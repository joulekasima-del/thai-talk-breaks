import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

import type { Query } from "@/lib/db";
import { pgLearnerStore } from "@/lib/onboarding/learnerStore";
import { pgDeliveryStore } from "@/lib/delivery/deliveryStore";
import { pgPurchasesStore } from "@/lib/payments/purchasesStore";
import { pgPaymentSupportStore } from "@/lib/payments/paymentSupportStore";
import { pgOopsReportsStore } from "@/lib/oops/oopsReportsStore";
import { pgDay29QuestStore } from "@/lib/day29/questStore";
import { pgDay30QuizStore } from "@/lib/quiz/day30QuizStore";
import { pgProcessedUpdatesStore } from "@/lib/webhook/processedUpdatesStore";

// Runs the real store SQL against an in-process Postgres (PGlite) built from the
// repo's own migrations, so a typo in a query or a column rename fails here and
// not in production. The pg_cron / pg_net migration is skipped: those are
// Supabase-only extensions and are not part of the Neon setup.

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

let db: PGlite;
let query: Query;

before(async () => {
  db = new PGlite();
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql") && !name.includes("delivery_cron"))
    .sort();
  for (const file of files) {
    // gen_random_uuid() is built into Postgres 13+, so the pgcrypto extension (which
    // PGlite doesn't ship) is not needed to run these queries.
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/create extension[^;]*pgcrypto[^;]*;/gi, "");
    await db.exec(sql);
  }
  query = async (text, params = []) => (await db.query(text, params)).rows as Record<string, unknown>[];
});

after(async () => {
  await db.close();
});

test("learnerStore: create / find / update round trip keeps the JS types the app expects", async () => {
  const store = pgLearnerStore(query);
  const created = await store.create(7691221493);
  assert.equal(created.telegram_user_id, 7691221493); // bigint comes back as a number
  assert.equal(created.onboarding_step, "gender_pending");
  assert.equal(typeof created.pilot_start_date === "string" || created.pilot_start_date === null, true);

  assert.equal((await store.findByTelegramId(7691221493))?.id, created.id);
  assert.equal((await store.findById(created.id))?.id, created.id);
  assert.equal(await store.findByTelegramId(1), null);

  const updated = await store.update(created.id, {
    gender_branch: "female",
    schedule_period: "evening",
    schedule_time: "17:00:00",
    onboarding_step: "complete",
    pilot_start_date: "2026-09-03",
    paid_course_start_date: undefined, // undefined keys are ignored, like the old PostgREST update
  });
  assert.equal(updated.gender_branch, "female");
  assert.equal(updated.schedule_time, "17:00:00");
  assert.equal(updated.pilot_start_date, "2026-09-03"); // date stays a plain string
  assert.equal(updated.paid_course_start_date, null);

  const cleared = await store.update(created.id, { awaiting_oops_report_since: null });
  assert.equal(cleared.awaiting_oops_report_since, null);
  assert.equal((await store.update(created.id, {})).id, created.id); // empty patch is a no-op read

  assert.ok((await store.listOnboarded()).some((l) => l.id === created.id));
  await assert.rejects(() => store.update("00000000-0000-0000-0000-000000000000", { gender_branch: "male" }));
});

test("deliveryStore: unique guard, audio mark, activity answer, delivered list", async () => {
  const learner = await pgLearnerStore(query).create(111);
  const store = pgDeliveryStore(query);

  assert.equal(await store.findExisting(learner.id, 1, "2026-09-03"), null);
  const row = await store.insertTextSent(learner.id, 1, "2026-09-03", "2026-09-03T12:00:02.645+00:00");
  assert.equal(typeof row.id, "number"); // bigint id is a number
  assert.equal(row.delivery_date, "2026-09-03");
  assert.equal(row.audio_delivered_at, null);

  // the unique constraint IS the duplicate-send guard
  await assert.rejects(() => store.insertTextSent(learner.id, 1, "2026-09-03", "2026-09-03T12:05:00+00:00"));

  assert.equal((await store.findExisting(learner.id, 1, "2026-09-03"))?.id, row.id);
  await store.markAudioSent(row.id, "2026-09-03T12:00:10.327+00:00");
  assert.ok((await store.findExisting(learner.id, 1, "2026-09-03"))?.audio_delivered_at);

  await store.insertTextSent(learner.id, 2, "2026-09-04", "2026-09-04T12:00:00+00:00");
  assert.deepEqual((await store.listDeliveredLessonNumbers(learner.id)).sort(), [1, 2]);

  assert.equal((await store.findUnansweredActivity(learner.id, 1))?.id, row.id);
  await store.markActivityAnswered(row.id, true, "2026-09-03T13:00:00+00:00");
  assert.equal(await store.findUnansweredActivity(learner.id, 1), null);
  assert.equal((await store.findExisting(learner.id, 1, "2026-09-03"))?.activity_correct, true);
});

test("purchasesStore + paymentSupportStore: paid vs refunded lookups", async () => {
  const learner = await pgLearnerStore(query).create(222);
  const purchases = pgPurchasesStore(query);

  const first = await purchases.create({
    learnerId: learner.id,
    telegramPaymentChargeId: "charge-1",
    providerPaymentChargeId: null,
    currency: "XTR",
    totalAmount: 500,
    invoicePayload: "thirty_day_course_v1",
  });
  assert.equal(first.status, "paid");
  assert.equal(first.total_amount, 500);
  assert.equal((await purchases.findByChargeId("charge-1"))?.id, first.id);
  assert.equal((await purchases.findPaidByLearner(learner.id))?.id, first.id);

  const refunded = await purchases.markRefunded(first.id, "2026-09-10T09:55:20.871+00:00");
  assert.equal(refunded.status, "refunded");
  assert.ok(refunded.refunded_at);
  assert.equal(await purchases.findPaidByLearner(learner.id), null);
  assert.equal((await purchases.findMostRecentByLearner(learner.id))?.id, first.id);

  await assert.rejects(() =>
    purchases.create({
      learnerId: learner.id,
      telegramPaymentChargeId: "charge-1", // duplicate charge id
      providerPaymentChargeId: null,
      currency: "XTR",
      totalAmount: 500,
      invoicePayload: "x",
    }),
  );

  const support = await pgPaymentSupportStore(query).create(learner.id, first.id, "my audio did not arrive");
  assert.equal(support.purchase_id, first.id);
  assert.equal((await pgPaymentSupportStore(query).create(learner.id, null, "again")).purchase_id, null);
});

test("oops reports, day29 quest (upsert) and day30 quiz progress", async () => {
  const learner = await pgLearnerStore(query).create(333);

  const report = await pgOopsReportsStore(query).create(learner.id, "typo in lesson 3");
  assert.equal(report.report_text, "typo in lesson 3");

  const quest = pgDay29QuestStore(query);
  assert.equal(await quest.findByLearner(learner.id), null);
  const q1 = await quest.markAnsweredCorrectly(learner.id, "2026-09-03T07:49:16.303+00:00");
  const q2 = await quest.markAnsweredCorrectly(learner.id, "2026-09-04T07:00:00+00:00");
  assert.equal(q1.id, q2.id); // second call updates the same row
  assert.equal((await quest.findByLearner(learner.id))?.id, q1.id);

  const quiz = pgDay30QuizStore(query);
  assert.equal(await quiz.findByLearner(learner.id), null);
  const started = await quiz.start(learner.id);
  assert.equal(started.current_question_index, 1);
  assert.equal(started.correct_count, 0);
  await assert.rejects(() => quiz.start(learner.id)); // one row per learner

  assert.equal((await quiz.recordAnswer(started.id, true)).correct_count, 1);
  assert.equal((await quiz.recordAnswer(started.id, false)).correct_count, 1);
  assert.equal((await quiz.recordAnswer(started.id, true)).correct_count, 2);
  assert.equal((await quiz.advance(started.id, 2)).current_question_index, 2);
  assert.ok((await quiz.complete(started.id, "2026-09-05T10:00:00+00:00")).completed_at);
});

test("processedUpdatesStore: second insert of the same update id returns false", async () => {
  const store = pgProcessedUpdatesStore(query);
  assert.equal(await store.tryMarkProcessed(251641620), true);
  assert.equal(await store.tryMarkProcessed(251641620), false);
});
