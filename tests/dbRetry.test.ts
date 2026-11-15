import { test } from "node:test";
import assert from "node:assert/strict";

import { isReadOnlyStatement, isTransientDbError, withDbRetry } from "@/lib/db";

// Neon's HTTP endpoint returns the odd 520; a read-only statement is retried,
// a write never is (see db.ts for why).

const SELECT = "SELECT to_jsonb(l) AS r FROM learners l WHERE onboarding_step = 'complete'";
const transient = () => new Error("Server error (HTTP status 520): error code: 520");

/** A runner that fails `failures` times, then returns one row. Records each call. */
function flakyRunner(failures: number, error: () => Error = transient) {
  const calls: string[] = [];
  let remaining = failures;
  const run = async (text: string) => {
    calls.push(text);
    if (remaining > 0) {
      remaining -= 1;
      throw error();
    }
    return [{ r: "ok" }];
  };
  return { run, calls };
}

test("a read-only statement that fails on transport is retried and succeeds", async () => {
  const { run, calls } = flakyRunner(1);
  const query = withDbRetry(run, [1, 1]);

  assert.deepEqual(await query(SELECT), [{ r: "ok" }]);
  assert.equal(calls.length, 2);
});

test("retries are capped: the error surfaces once the attempts are used up", async () => {
  const { run, calls } = flakyRunner(99);
  const query = withDbRetry(run, [1, 1]);

  await assert.rejects(() => query(SELECT), /HTTP status 520/);
  assert.equal(calls.length, 3); // first attempt + two retries
});

test("a write is never retried — running it twice would not be the same as once", async () => {
  const { run, calls } = flakyRunner(1);
  const query = withDbRetry(run, [1, 1]);

  await assert.rejects(
    () => query("UPDATE day30_quiz_progress SET correct_count = correct_count + $2 WHERE id = $1", [1, 1]),
    /HTTP status 520/,
  );
  assert.equal(calls.length, 1);
});

test("an error from the database itself is not retried, however often it is asked", async () => {
  const { run, calls } = flakyRunner(1, () => new Error('duplicate key value violates unique constraint'));
  const query = withDbRetry(run, [1, 1]);

  await assert.rejects(() => query(SELECT), /duplicate key/);
  assert.equal(calls.length, 1);
});

test("a statement that succeeds first time is run exactly once", async () => {
  const { run, calls } = flakyRunner(0);
  const query = withDbRetry(run, [1, 1]);

  await query(SELECT);
  assert.equal(calls.length, 1);
});

test("isReadOnlyStatement: plain reads yes, anything that writes no", () => {
  assert.equal(isReadOnlyStatement(SELECT), true);
  assert.equal(isReadOnlyStatement("  select 1  "), true);
  assert.equal(isReadOnlyStatement("WITH x AS (SELECT 1) SELECT * FROM x"), true);

  assert.equal(isReadOnlyStatement("INSERT INTO learners (telegram_user_id) VALUES ($1)"), false);
  assert.equal(isReadOnlyStatement("UPDATE learners SET schedule_time = $1"), false);
  assert.equal(isReadOnlyStatement("DELETE FROM lesson_deliveries WHERE id = $1"), false);
  // A CTE can write, and a RETURNING clause means the statement changed something.
  assert.equal(isReadOnlyStatement("with d as (delete from lesson_deliveries returning id) select * from d"), false);
  assert.equal(isReadOnlyStatement("INSERT INTO oops_reports (learner_id) VALUES ($1) RETURNING to_jsonb(oops_reports) AS r"), false);
  assert.equal(isReadOnlyStatement("SELECT * FROM learners FOR UPDATE"), false);
});

test("isTransientDbError: transport failures yes, rejected statements no", () => {
  assert.equal(isTransientDbError(transient()), true);
  assert.equal(isTransientDbError(new Error("Server error (HTTP status 503)")), true);
  assert.equal(isTransientDbError(new Error("fetch failed")), true);
  assert.equal(isTransientDbError(new Error("socket hang up")), true);

  assert.equal(isTransientDbError(new Error('relation "learner" does not exist')), false);
  assert.equal(isTransientDbError(new Error("duplicate key value violates unique constraint")), false);
  assert.equal(isTransientDbError(new Error("Server error (HTTP status 400)")), false);
});
