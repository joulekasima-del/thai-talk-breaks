import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

import type { Query } from "@/lib/db";
import type { MediaFile, TelegramClient } from "@/lib/telegram";
import type { MediaLoader } from "@/lib/delivery/deliverLesson";
import { runDeliveryCron } from "@/lib/delivery/runDeliveryCron";
import { pgLearnerStore } from "@/lib/onboarding/learnerStore";

// The Cloudflare cron trigger's whole job, run against a real (in-process)
// Postgres: due learners get their lesson once, a second run is a no-op, and
// the request-budget stop leaves the rest for the next run.

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

class FakeTelegram implements TelegramClient {
  sent: { chatId: number; kind: string }[] = [];
  async sendMessage(chatId: number) {
    this.sent.push({ chatId, kind: "message" });
  }
  async answerCallbackQuery() {}
  async sendPhoto(chatId: number) {
    this.sent.push({ chatId, kind: "photo" });
  }
  async sendAudio(chatId: number) {
    this.sent.push({ chatId, kind: "audio" });
  }
  async sendInvoice() {}
  async answerPreCheckoutQuery() {}
  async refundStarPayment() {}
}

const fakeFile = (): MediaFile => ({ buffer: new Uint8Array([1, 2, 3]), filename: "x.png", contentType: "image/png" });
const media: MediaLoader = {
  loadPhraseLessonImage: async () => fakeFile(),
  loadCombinedNumbersImage: async () => fakeFile(),
  loadRepresentativeClip: async () => fakeFile(),
  loadWordSetImage: async () => fakeFile(),
};

// 17:00 in Thailand on 2026-11-13
const NOW = new Date("2026-11-13T10:00:00Z");

async function addLearner(telegramUserId: number): Promise<string> {
  const store = pgLearnerStore(query);
  const learner = await store.create(telegramUserId);
  await store.update(learner.id, {
    gender_branch: "female",
    schedule_period: "evening",
    schedule_time: "17:00:00",
    onboarding_step: "complete",
    onboarding_completed_at: NOW.toISOString(),
    pilot_start_date: "2026-11-13", // Day 1 today
  });
  return learner.id;
}

test("delivers Day 1 once; an immediate second run sends nothing more", async () => {
  const learnerId = await addLearner(9001);
  const telegram = new FakeTelegram();
  const deps = { telegram, query, media, appUrl: "https://example.test", now: NOW };

  const first = await runDeliveryCron(deps);
  assert.equal(first.stoppedEarly, false);
  assert.deepEqual(first.results.map((r) => r.status), ["delivered"]);
  assert.ok(telegram.sent.some((m) => m.kind === "photo" && m.chatId === 9001));

  const rows = await query("SELECT lesson_number, delivery_date::text AS d FROM lesson_deliveries WHERE learner_id = $1", [learnerId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].lesson_number, 1);

  const sentAfterFirst = telegram.sent.length;
  const second = await runDeliveryCron(deps);
  assert.equal(second.results.length, 0); // pre-filter: already delivered today
  assert.equal(second.due, 0);
  assert.equal(telegram.sent.length, sentAfterFirst);
});

test("a run that is told to stop leaves remaining learners for the next run", async () => {
  await addLearner(9002);
  await addLearner(9003);
  const telegram = new FakeTelegram();
  let calls = 0;
  // stop after the first learner has been handled
  const shouldStop = () => calls++ >= 1;
  const run1 = await runDeliveryCron({ telegram, query, media, appUrl: "https://example.test", now: NOW, shouldStop });
  assert.equal(run1.stoppedEarly, true);
  assert.equal(run1.results.length, 1);

  const run2 = await runDeliveryCron({ telegram, query, media, appUrl: "https://example.test", now: NOW });
  assert.equal(run2.stoppedEarly, false);
  assert.equal(run2.results.length, 1); // the one that was left over
  const total = await query("SELECT count(*)::int AS n FROM lesson_deliveries WHERE learner_id IN (SELECT id FROM learners WHERE telegram_user_id IN (9002, 9003))");
  assert.equal(total[0].n, 2);
});

test("a learner whose lesson time is not now is not delivered to", async () => {
  const store = pgLearnerStore(query);
  const learner = await store.create(9004);
  await store.update(learner.id, {
    gender_branch: "male",
    schedule_period: "morning",
    schedule_time: "08:00:00",
    onboarding_step: "complete",
    pilot_start_date: "2026-11-13",
  });
  const telegram = new FakeTelegram();
  await runDeliveryCron({ telegram, query, media, appUrl: "https://example.test", now: NOW });
  assert.equal(telegram.sent.filter((m) => m.chatId === 9004).length, 0);
});
