import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

// --- Hotfix: lesson_deliveries.lesson_number range widened 1-7 -> 1-29 -----
//
// The original schema's CHECK constraint was pilot-only (1-7) and was never
// widened when Checkpoint 5 extended delivery to Days 8-28 / Day 29. This
// test asserts the fix migration exists and is additive (no edit to the
// original migration), since there's no live Postgres in this test suite to
// exercise the constraint directly.

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

test("a migration widens lesson_deliveries_lesson_number_check to 1-29", () => {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const fixMigration = files.find((f) => {
    const contents = readFileSync(path.join(MIGRATIONS_DIR, f), "utf8");
    return (
      contents.includes("lesson_deliveries_lesson_number_check") &&
      contents.includes("between 1 and 29")
    );
  });
  assert.ok(fixMigration, "expected a migration widening lesson_number's range to 1-29");
});

test("the original initial_schema migration is untouched (still says 1-7, per additive-migration convention)", () => {
  const original = readFileSync(
    path.join(MIGRATIONS_DIR, "20260820000000_initial_schema.sql"),
    "utf8",
  );
  assert.match(original, /lesson_number between 1 and 7/);
});
