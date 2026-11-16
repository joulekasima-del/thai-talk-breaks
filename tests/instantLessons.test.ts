import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

import type { Query } from "@/lib/db";
import type { TelegramUpdate } from "@/lib/telegram";
import { handleUpdate } from "@/lib/onboarding/handleUpdate";
import { pgLearnerStore } from "@/lib/onboarding/learnerStore";
import { pgDeliveryStore } from "@/lib/delivery/deliveryStore";
import { pgPurchasesStore } from "@/lib/payments/purchasesStore";
import { pgPaymentSupportStore } from "@/lib/payments/paymentSupportStore";
import { pgOopsReportsStore } from "@/lib/oops/oopsReportsStore";
import { pgSrsStore } from "@/lib/srs/srsStore";
import { pgDay30QuizStore } from "@/lib/quiz/day30QuizStore";
import { runDeliveryCron } from "@/lib/delivery/runDeliveryCron";
import { BUY_INVOICE_AMOUNT_STARS, BUY_INVOICE_PAYLOAD } from "@/lib/payments/content";
import { REMINDER_PERIOD_MESSAGE, readyMessage } from "@/lib/onboarding/content";
import { LESSON_PAYWALL_MESSAGE, ACTIVE_SESSION_NUDGE } from "@/lib/session/content";
import { FakeTelegramClient } from "./fakes";
import { FakeMediaLoader } from "./deliveryFakes";

// The instant-lessons flow end to end, against a real in-process Postgres
// built from the repo's migrations: lean onboarding straight into Lesson 1,
// multiple-choice checks with right/wrong feedback, spaced-repetition
// reviews in the following sessions, "Next lesson" on demand, the
// lesson-counted paywall, and the daily reminder.

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");
let db: PGlite;
let query: Query;

before(async () => {
  db = new PGlite();
  for (const file of fs.readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith(".sql") && !n.includes("delivery_cron")).sort()) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8").replace(/create extension[^;]*pgcrypto[^;]*;/gi, "");
    await db.exec(sql);
  }
  query = async (text, params = []) => (await db.query(text, params)).rows as Record<string, unknown>[];
});

after(async () => {
  await db.close();
});

// 10:00 in Thailand
const NOW = new Date("2026-11-15T03:00:00Z");

function makeDeps(telegram = new FakeTelegramClient(), now = NOW) {
  return {
    store: pgLearnerStore(query),
    telegram,
    oopsReportsStore: pgOopsReportsStore(query),
    purchasesStore: pgPurchasesStore(query),
    paymentSupportStore: pgPaymentSupportStore(query),
    deliveryStore: pgDeliveryStore(query),
    srsStore: pgSrsStore(query),
    quizStore: pgDay30QuizStore(query),
    media: new FakeMediaLoader(),
    appUrl: "https://example.test",
    adminTelegramUserId: null,
    now: () => now,
    rng: () => 0.3,
  };
}

let nextUpdateId = 1;
const text = (uid: number, t: string): TelegramUpdate => ({
  update_id: nextUpdateId++,
  message: { text: t, chat: { id: uid }, from: { id: uid, first_name: "Joule" } },
});
const tap = (uid: number, data: string, messageId = 500): TelegramUpdate => ({
  update_id: nextUpdateId++,
  callback_query: { id: `cb${nextUpdateId}`, data, from: { id: uid, first_name: "Joule" }, message: { message_id: messageId, chat: { id: uid } } },
});

async function learnerId(uid: number): Promise<string> {
  const rows = await query("SELECT id FROM learners WHERE telegram_user_id = $1", [uid]);
  return rows[0].id as string;
}

/** The question currently waiting for an answer. */
async function waitingPrompt(uid: number) {
  const rows = await query(
    "SELECT id, correct_index, options FROM quiz_prompts WHERE learner_id = $1 AND sent_at IS NOT NULL AND answered_at IS NULL",
    [await learnerId(uid)],
  );
  assert.equal(rows.length, 1, "exactly one question should be waiting");
  return rows[0] as { id: number; correct_index: number; options: string[] };
}

async function answer(uid: number, deps: ReturnType<typeof makeDeps>, right: boolean) {
  const p = await waitingPrompt(uid);
  const chosen = right ? p.correct_index : (p.correct_index + 1) % p.options.length;
  await handleUpdate(tap(uid, `q:${p.id}:${chosen}`), deps);
}

async function onboardToLessonOne(uid: number, gender: "male" | "female", deps: ReturnType<typeof makeDeps>) {
  await handleUpdate(text(uid, "/start"), deps);
  await handleUpdate(tap(uid, "name:tg"), deps);
  await handleUpdate(tap(uid, `gender:${gender}`), deps);
  for (const t of ["loc:visiting", "lvl:beginner", "why:travel", "src:friend"]) await handleUpdate(tap(uid, t), deps);
}

test("onboarding flows straight into Lesson 1 with a quiz; right answer is confirmed; then the reminder question", async () => {
  const uid = 7001;
  const deps = makeDeps();
  await onboardToLessonOne(uid, "male", deps);

  const sent = deps.telegram.sent.map((m) => m.text);
  assert.equal(deps.telegram.sentPhotos.length, 1, "Lesson 1 picture sent right away");
  assert.ok(sent.some((t) => t.includes("sà-wàt-dii kráp") && t.includes("Hello")), "phrase shown with the male particle");
  const tip = deps.telegram.sent.find((m) => m.text.startsWith("💡"));
  assert.ok(tip, "short tip sent");
  assert.ok(tip!.text.includes("sà-wàt-dii kráp works for hello and goodbye"));
  assert.deepEqual(
    tip!.keyboard?.[0].map((b) => b.text),
    ["🔊 Listen", "📖 More"],
  );
  const question = deps.telegram.sent.at(-1)!;
  assert.match(question.text, /What does this mean\?\n\nsà-wàt-dii kráp$/);
  assert.equal(question.keyboard?.length, 3, "three answer buttons");

  await answer(uid, deps, true);
  assert.match(deps.telegram.edited.at(-1)!.text, /✅ Right! sà-wàt-dii kráp = Hello/);
  assert.equal(deps.telegram.edited.at(-1)!.messageId, 500);
  assert.ok(deps.telegram.sent.some((m) => m.text.startsWith("🎉 Lesson 1 done, Joule! 1/1 right.")));
  assert.equal(deps.telegram.sent.at(-1)!.text, REMINDER_PERIOD_MESSAGE);

  const learner = await deps.store.findByTelegramId(uid);
  assert.equal(learner?.next_lesson_number, 2);
  assert.equal(learner?.onboarding_step, "schedule_period_pending");
  assert.equal(learner?.survey_location, "visiting");
  assert.equal(await deps.srsStore.countCards(learner!.id), 1);

  await handleUpdate(tap(uid, "period:morning"), deps);
  await handleUpdate(tap(uid, "time:09:00"), deps);
  assert.equal(deps.telegram.sent.at(-1)!.text, readyMessage("Joule"));
});

test("a wrong answer is called out, and 'Next lesson' runs a review of Lesson 1 before Lesson 2", async () => {
  const uid = 7002;
  const deps = makeDeps();
  await onboardToLessonOne(uid, "female", deps);
  await answer(uid, deps, false);
  assert.match(deps.telegram.edited.at(-1)!.text, /❌ Not quite — you picked ".+"\.\nsà-wàt-dii kâ = Hello/);
  await handleUpdate(tap(uid, "period:evening"), deps);
  await handleUpdate(tap(uid, "time:19:00"), deps);

  const before = deps.telegram.sent.length;
  await handleUpdate(tap(uid, "next:1"), deps);
  const fresh = deps.telegram.sent.slice(before).map((m) => m.text);
  assert.equal(fresh[0], "🔁 Quick warm-up — 1 word from before:");
  assert.match(fresh[1], /sà-wàt-dii kâ/);

  await answer(uid, deps, true); // review right -> streak 1
  const card = await deps.srsStore.getCard(await learnerId(uid), "L1");
  assert.equal(card?.streak, 1);
  assert.equal(card?.reps, 1);

  // Lesson 2 (numbers) followed by two quick-check questions
  assert.ok(deps.telegram.sent.some((m) => m.text.startsWith("Lesson 2 — Numbers 1-10")));
  assert.match(deps.telegram.sent.at(-1)!.text, /^Quick check 👇/);
  await answer(uid, deps, true);
  await answer(uid, deps, true);
  assert.ok(deps.telegram.sent.some((m) => m.text.startsWith("🎉 Lesson 2 done, Joule! 3/3 right.")));
  assert.match(deps.telegram.sent.find((m) => m.text.startsWith("🎉 Lesson 2"))!.text, /11 words in your review deck/);
  assert.equal(deps.telegram.sent.at(-1)!.keyboard?.[0][0].text, "▶️ Next lesson");
  assert.equal((await deps.store.findByTelegramId(uid))?.next_lesson_number, 3);
});

test("double-tapping an answer counts once; 'Next' mid-quiz re-shows the waiting question", async () => {
  const uid = 7003;
  const deps = makeDeps();
  await onboardToLessonOne(uid, "male", deps);
  const p = await waitingPrompt(uid);

  await handleUpdate(tap(uid, "next:1"), deps);
  assert.equal(deps.telegram.sent.at(-2)!.text, ACTIVE_SESSION_NUDGE);

  await handleUpdate(tap(uid, `q:${p.id}:${p.correct_index}`), deps);
  const sentAfterFirst = deps.telegram.sent.length;
  await handleUpdate(tap(uid, `q:${p.id}:${(p.correct_index + 1) % 3}`), deps);
  assert.equal(deps.telegram.sent.length, sentAfterFirst, "second tap does nothing");
  const rows = await query("SELECT correct FROM quiz_prompts WHERE id = $1", [p.id]);
  assert.equal(rows[0].correct, true);
});

test("'📖 More' shows the full explanation in the learner's own form, never bare sà-wàt-dii", async () => {
  const uid = 7004;
  const deps = makeDeps();
  await onboardToLessonOne(uid, "male", deps);
  await handleUpdate(tap(uid, "more:1"), deps);
  const more = deps.telegram.sent.at(-1)!.text;
  assert.ok(more.includes("sà-wàt-dii kráp — hello"));
  assert.ok(!/sà-wàt-dii —/.test(more));
  assert.ok(more.includes("Here's what our tone marks mean"), "tone legend lives behind More now");
  assert.ok(more.length < 4096, "fits in one Telegram message");
  for (const m of deps.telegram.sent) assert.ok(!/sà-wàt-dii(?! kr| k)/.test(m.text), `bare sà-wàt-dii in: ${m.text.slice(0, 60)}`);
});

test("Lesson 8 needs a purchase: the check-in is sent, and paying starts Lesson 8 at once", async () => {
  const uid = 7005;
  const deps = makeDeps();
  const learner = await deps.store.create(uid);
  await deps.store.update(learner.id, {
    display_name: "Joule",
    gender_branch: "male",
    schedule_time: "09:00",
    onboarding_step: "complete",
    next_lesson_number: 8,
  });

  await handleUpdate(tap(uid, "next:1"), deps);
  assert.equal(deps.telegram.sent.at(-1)!.text, LESSON_PAYWALL_MESSAGE);
  assert.ok((await deps.store.findByTelegramId(uid))?.paywall_prompt_sent_at);

  await handleUpdate(text(uid, "hello?"), deps);
  assert.equal(deps.telegram.sent.at(-1)!.text, LESSON_PAYWALL_MESSAGE, "any message re-sends the check-in");

  await handleUpdate(
    {
      update_id: nextUpdateId++,
      message: {
        chat: { id: uid },
        from: { id: uid },
        successful_payment: { currency: "XTR", total_amount: BUY_INVOICE_AMOUNT_STARS, invoice_payload: BUY_INVOICE_PAYLOAD, telegram_payment_charge_id: "ch_7005" },
      },
    },
    deps,
  );
  assert.equal(deps.telegram.sentPhotos.length, 1, "Lesson 8 picture sent straight after payment");
  assert.match(deps.telegram.sent.at(-1)!.text, /^Quick check 👇/);
});

test("the daily reminder starts a session once a day, with reviews first", async () => {
  const uid = 7006;
  const deps = makeDeps();
  await onboardToLessonOne(uid, "male", deps);
  await answer(uid, deps, true);
  await handleUpdate(tap(uid, "period:afternoon"), deps);
  await handleUpdate(tap(uid, "time:17:00"), deps);
  // Pretend the onboarding session happened yesterday.
  await query("UPDATE learners SET last_session_date = '2026-11-14' WHERE telegram_user_id = $1", [uid]);

  const telegram = new FakeTelegramClient();
  const at1700 = new Date("2026-11-15T10:00:00Z");
  const run = await runDeliveryCron({ telegram, query, media: new FakeMediaLoader(), appUrl: "https://example.test", now: at1700 });
  const mine = run.results.filter((r) => r.telegramUserId === uid);
  assert.deepEqual(mine.map((r) => r.status), ["started"]);
  const texts = telegram.sent.filter((m) => m.chatId === uid).map((m) => m.text);
  assert.deepEqual(texts.slice(0, 2), ["⏰ Time for your Thai break, Joule!", "🔁 Quick warm-up — 1 word from before:"]);

  const again = await runDeliveryCron({ telegram, query, media: new FakeMediaLoader(), appUrl: "https://example.test", now: at1700 });
  assert.equal(again.results.filter((r) => r.telegramUserId === uid).length, 0, "once a day");
});
