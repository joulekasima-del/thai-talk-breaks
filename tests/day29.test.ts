import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createHmac } from "node:crypto";

import { DAY29_STORY_PAGES, DAY29_TOTAL_PAGES, DAY29_QUEST_CORRECT_ANSWER_ID, day29AssetUrl } from "@/lib/day29/comicContent";
import { buildPlaybackPlan, SPEECH_GAP_MS, PANEL_GAP_MS } from "@/lib/day29/audioSequencer";
import { validateTelegramInitData } from "@/lib/day29/telegramInitData";
import { getQuestStatus, submitQuestAnswer } from "@/lib/day29/questApi";
import { deliverDay29Entry, DAY29_LESSON_NUMBER } from "@/lib/day29/deliverDay29Entry";
import { FakeLearnerStore, FakeTelegramClient } from "./fakes";
import { FakeDeliveryStore } from "./deliveryFakes";
import { FakeDay29QuestStore } from "./day29Fakes";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_BOT_TOKEN = "123456:TEST-BOT-TOKEN";

// --- Asset accessibility: comicContent.ts's filenames match the real files -

test("every Day 29 page/speech filename in comicContent.ts exists in curriculum/day29/assets/", () => {
  const assetsDir = path.join(REPO_ROOT, "curriculum", "day29", "assets");
  const actualFiles = new Set(readdirSync(assetsDir));

  assert.equal(DAY29_STORY_PAGES.length, 8, "8 story pages, per day29-story-draft.md");
  assert.equal(DAY29_TOTAL_PAGES, 9, "8 story pages + Page 9 Surprise Quest, per the living-comic spec");

  for (const page of DAY29_STORY_PAGES) {
    assert.ok(actualFiles.has(page.image), `missing image file: ${page.image}`);
    for (const speech of page.speeches) {
      assert.ok(actualFiles.has(speech.audioFile), `missing audio file: ${speech.audioFile}`);
    }
  }
});

test("comicContent.ts's audio filenames match every row of day29-audio-map.md, in order", () => {
  const raw = readFileSync(path.join(REPO_ROOT, "curriculum", "day29", "day29-audio-map.md"), "utf8");
  const rows = [...raw.matchAll(/^\| (\d+) \| \d+ \|.*\| `(day29_\S+\.mp3)` \|/gm)];
  const expectedByPage = new Map<number, string[]>();
  for (const [, pageStr, filename] of rows) {
    const page = Number(pageStr);
    if (!expectedByPage.has(page)) expectedByPage.set(page, []);
    expectedByPage.get(page)!.push(filename);
  }

  for (const page of DAY29_STORY_PAGES) {
    const expected = expectedByPage.get(page.pageNumber);
    assert.ok(expected, `no audio-map rows found for page ${page.pageNumber}`);
    assert.deepEqual(
      page.speeches.map((s) => s.audioFile),
      expected,
      `page ${page.pageNumber} speech order must match day29-audio-map.md's row order`,
    );
  }
});

test("day29AssetUrl builds a /day29/ public path", () => {
  assert.equal(day29AssetUrl("day29_page01.png"), "/day29/day29_page01.png");
});

// --- Audio sequencing: 2s within a panel, 3s across panels ----------------

test("buildPlaybackPlan: 2s gap between speeches sharing a panel, 3s gap across panels, 0 after the last", () => {
  const page5 = DAY29_STORY_PAGES.find((p) => p.pageNumber === 5)!;
  const plan = buildPlaybackPlan(page5.speeches);

  assert.equal(plan.length, 6);
  assert.equal(plan[0].gapAfterMs, SPEECH_GAP_MS, "panel 1's two speeches: 2s gap");
  assert.equal(plan[1].gapAfterMs, PANEL_GAP_MS, "panel 1 -> panel 2: 3s gap");
  assert.equal(plan[2].gapAfterMs, SPEECH_GAP_MS, "panel 2's two speeches: 2s gap");
  assert.equal(plan[3].gapAfterMs, PANEL_GAP_MS, "panel 2 -> panel 3: 3s gap");
  assert.equal(plan[4].gapAfterMs, SPEECH_GAP_MS, "panel 3's two speeches: 2s gap");
  assert.equal(plan[5].gapAfterMs, 0, "no gap after the page's last speech");
});

test("buildPlaybackPlan: a single-panel page (Page 8) has one step with no gap", () => {
  const page8 = DAY29_STORY_PAGES.find((p) => p.pageNumber === 8)!;
  const plan = buildPlaybackPlan(page8.speeches);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].gapAfterMs, 0);
});

test("buildPlaybackPlan: two single-speech panels get the 3s panel gap, not the 2s speech gap", () => {
  const page2 = DAY29_STORY_PAGES.find((p) => p.pageNumber === 2)!;
  const plan = buildPlaybackPlan(page2.speeches);
  assert.equal(plan.length, 2);
  assert.equal(plan[0].gapAfterMs, PANEL_GAP_MS);
  assert.equal(plan[1].gapAfterMs, 0);
});

// --- Telegram Web App initData validation ----------------------------------

function signInitData(fields: Record<string, string>, botToken: string): string {
  const dataCheckString = Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .sort()
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
  const params = new URLSearchParams({ ...fields, hash });
  return params.toString();
}

test("validateTelegramInitData accepts correctly-signed initData and extracts the telegram user id", () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const initData = signInitData(
    { user: JSON.stringify({ id: 4242 }), auth_date: String(nowSeconds) },
    TEST_BOT_TOKEN,
  );
  const result = validateTelegramInitData(initData, TEST_BOT_TOKEN);
  assert.deepEqual(result, { telegramUserId: 4242 });
});

test("validateTelegramInitData rejects a tampered hash", () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const initData = signInitData(
    { user: JSON.stringify({ id: 4242 }), auth_date: String(nowSeconds) },
    TEST_BOT_TOKEN,
  );
  const tampered = initData.replace(/hash=[0-9a-f]+/, "hash=" + "0".repeat(64));
  assert.equal(validateTelegramInitData(tampered, TEST_BOT_TOKEN), null);
});

test("validateTelegramInitData rejects initData signed with a different bot token", () => {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const initData = signInitData(
    { user: JSON.stringify({ id: 4242 }), auth_date: String(nowSeconds) },
    "999999:SOME-OTHER-TOKEN",
  );
  assert.equal(validateTelegramInitData(initData, TEST_BOT_TOKEN), null);
});

test("validateTelegramInitData rejects missing hash / missing user / empty input", () => {
  assert.equal(validateTelegramInitData("", TEST_BOT_TOKEN), null);
  assert.equal(validateTelegramInitData("user=%7B%22id%22%3A1%7D", TEST_BOT_TOKEN), null);
});

test("validateTelegramInitData rejects stale auth_date beyond maxAgeSeconds", () => {
  const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
  const initData = signInitData(
    { user: JSON.stringify({ id: 4242 }), auth_date: String(twoDaysAgo) },
    TEST_BOT_TOKEN,
  );
  assert.equal(validateTelegramInitData(initData, TEST_BOT_TOKEN), null);
});

// --- Surprise Quest API: unlimited wrong attempts, locks on correct -------

test("submitQuestAnswer: wrong answers never persist a row, and can be retried indefinitely", async () => {
  const learnerStore = new FakeLearnerStore();
  const learner = await learnerStore.create(555);
  const questStore = new FakeDay29QuestStore();

  for (const wrongAnswer of ["chiang_dao", "mae_kam_pong", "doi_inthanon"]) {
    const result = await submitQuestAnswer(learner.telegram_user_id, wrongAnswer, { learnerStore, questStore });
    assert.deepEqual(result, { ok: true, correct: false });
    assert.equal(await questStore.findByLearner(learner.id), null, "a wrong attempt must not create a progress row");
  }
});

test("submitQuestAnswer: the correct answer locks the quest permanently", async () => {
  const learnerStore = new FakeLearnerStore();
  const learner = await learnerStore.create(556);
  const questStore = new FakeDay29QuestStore();

  const first = await submitQuestAnswer(learner.telegram_user_id, DAY29_QUEST_CORRECT_ANSWER_ID, { learnerStore, questStore });
  assert.deepEqual(first, { ok: true, correct: true, alreadyAnswered: false });

  const progress = await questStore.findByLearner(learner.id);
  assert.ok(progress, "a row must exist after the first correct answer");

  // Locked: a later call (even with a "wrong" answerId) short-circuits to
  // already-answered rather than re-evaluating the answer.
  const second = await submitQuestAnswer(learner.telegram_user_id, "chiang_dao", { learnerStore, questStore });
  assert.deepEqual(second, { ok: true, correct: true, alreadyAnswered: true });
});

test("getQuestStatus: reflects answered/not-answered state, and errors for an unknown learner", async () => {
  const learnerStore = new FakeLearnerStore();
  const learner = await learnerStore.create(557);
  const questStore = new FakeDay29QuestStore();

  const before = await getQuestStatus(learner.telegram_user_id, { learnerStore, questStore });
  assert.deepEqual(before, { ok: true, answeredCorrectly: false, answeredCorrectlyAt: null });

  await submitQuestAnswer(learner.telegram_user_id, DAY29_QUEST_CORRECT_ANSWER_ID, { learnerStore, questStore });

  const after = await getQuestStatus(learner.telegram_user_id, { learnerStore, questStore });
  assert.equal(after.ok, true);
  if (after.ok) {
    assert.equal(after.answeredCorrectly, true);
    assert.ok(after.answeredCorrectlyAt);
  }

  const unknown = await getQuestStatus(999999, { learnerStore, questStore });
  assert.deepEqual(unknown, { ok: false, error: "learner_not_found" });
});

// --- Bot-side entry trigger: buildup + web_app button, dedup guard --------

test("deliverDay29Entry sends the buildup messages and a web_app button, then guards against a second send same day", async () => {
  const telegram = new FakeTelegramClient();
  const deliveryStore = new FakeDeliveryStore();

  const first = await deliverDay29Entry(
    { learnerId: "learner-1", chatId: 111, deliveryDate: "2026-09-19" },
    { telegram, deliveryStore, appUrl: "https://thaitalkbreaks.example", now: () => new Date("2026-09-19T08:00:00Z") },
  );
  assert.deepEqual(first, { status: "delivered" });

  assert.equal(telegram.sent.length, 3, "3 buildup messages, the last carrying the button");
  const lastMessage = telegram.sent[2];
  assert.ok(lastMessage.keyboard, "the button-bearing message must have a keyboard");
  const button = lastMessage.keyboard![0][0];
  assert.deepEqual(button, { text: "🎁 Start the story", web_app: { url: "https://thaitalkbreaks.example/day29" } });

  const delivered = await deliveryStore.findExisting("learner-1", DAY29_LESSON_NUMBER, "2026-09-19");
  assert.ok(delivered, "a lesson_deliveries row (lesson_number=29) must exist after sending");

  const second = await deliverDay29Entry(
    { learnerId: "learner-1", chatId: 111, deliveryDate: "2026-09-19" },
    { telegram, deliveryStore, appUrl: "https://thaitalkbreaks.example", now: () => new Date("2026-09-19T08:05:00Z") },
  );
  assert.deepEqual(second, { status: "already_delivered" });
  assert.equal(telegram.sent.length, 3, "no messages sent on the duplicate-guarded second attempt");
});

test("deliverDay29Entry's buildup text matches day29-living-comic-spec.md's locked entry message", () => {
  const spec = readFileSync(path.join(REPO_ROOT, "curriculum", "day29", "day29-living-comic-spec.md"), "utf8");
  assert.match(spec, /🗺️ \*knock knock\*/);
  assert.match(spec, /Heyy! Remember everything you've learned this month\?/);
  assert.match(spec, /I put together something special — a little story, a little journey, a few surprises along the way\.\.\./);
  assert.match(spec, /🎁 Start the story/);
});
