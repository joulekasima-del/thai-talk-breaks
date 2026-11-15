import { test } from "node:test";
import assert from "node:assert/strict";
import type { Query } from "@/lib/db";

import { pgProcessedUpdatesStore } from "@/lib/webhook/processedUpdatesStore";
import { dedupeAndProcess } from "@/lib/webhook/dedupeAndProcess";
import { FakeProcessedUpdatesStore } from "./webhookDedupFakes";

// --- pgProcessedUpdatesStore: unique-violation vs. real error -------

function fakeInsertQuery(error: { code: string } | null): Query {
  return async () => {
    if (error) throw Object.assign(new Error("db error"), error);
    return [];
  };
}

test("pgProcessedUpdatesStore.tryMarkProcessed returns true when the insert succeeds (new update)", async () => {
  const store = pgProcessedUpdatesStore(fakeInsertQuery(null));
  assert.equal(await store.tryMarkProcessed(100), true);
});

test("pgProcessedUpdatesStore.tryMarkProcessed returns false on a unique-constraint conflict (retry of a known update)", async () => {
  const store = pgProcessedUpdatesStore(fakeInsertQuery({ code: "23505" }));
  assert.equal(await store.tryMarkProcessed(100), false);
});

test("pgProcessedUpdatesStore.tryMarkProcessed rethrows any other database error", async () => {
  const store = pgProcessedUpdatesStore(fakeInsertQuery({ code: "08006" })); // connection failure, unrelated to dedup
  await assert.rejects(() => store.tryMarkProcessed(100));
});

// --- dedupeAndProcess: the actual ordering/skip guarantee ------------------

test("dedupeAndProcess: the same update_id processed twice produces only one set of side effects", async () => {
  const store = new FakeProcessedUpdatesStore();
  let processCount = 0;
  const process = async () => {
    processCount += 1;
  };

  const first = await dedupeAndProcess(555, store, process);
  const second = await dedupeAndProcess(555, store, process); // simulates Telegram's retry

  assert.deepEqual(first, { processed: true });
  assert.deepEqual(second, { processed: false });
  assert.equal(processCount, 1, "process() must run exactly once for a duplicate update_id");
});

test("dedupeAndProcess: different update_ids both process normally", async () => {
  const store = new FakeProcessedUpdatesStore();
  const processedIds: number[] = [];

  await dedupeAndProcess(1, store, async () => {
    processedIds.push(1);
  });
  await dedupeAndProcess(2, store, async () => {
    processedIds.push(2);
  });

  assert.deepEqual(processedIds, [1, 2]);
});

test("dedupeAndProcess: on a duplicate, the process closure is never invoked at all (not called-then-ignored)", async () => {
  const store = new FakeProcessedUpdatesStore();
  await store.tryMarkProcessed(9); // pre-seed as already processed

  let invoked = false;
  const result = await dedupeAndProcess(9, store, async () => {
    invoked = true;
  });

  assert.equal(invoked, false);
  assert.deepEqual(result, { processed: false });
});

test("dedupeAndProcess: the dedup check happens before process() runs, not after", async () => {
  const events: string[] = [];
  const store: { tryMarkProcessed: (id: number) => Promise<boolean> } = {
    tryMarkProcessed: async (id) => {
      events.push(`marked:${id}`);
      return true;
    },
  };

  await dedupeAndProcess(42, store as never, async () => {
    events.push("processed");
  });

  assert.deepEqual(events, ["marked:42", "processed"]);
});
