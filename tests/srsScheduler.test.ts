import { test } from "node:test";
import assert from "node:assert/strict";

import {
  applyAnswer,
  GRADUATION_INTERVAL_DAYS,
  isDue,
  newCard,
  reviewCapForLesson,
  selectDueCards,
  type SrsCard,
} from "@/lib/srs/scheduler";
import { buildQuestion, itemsForLesson, allItems } from "@/lib/srs/items";

const TODAY = "2026-11-15";

function seq(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

test("a new card graduates after 4 correct sessions in a row, then is due in 3 days", () => {
  let card = newCard("l1", "L1", 1);
  for (let i = 0; i < 3; i++) {
    card = applyAnswer(card, true, TODAY);
    assert.equal(card.phase, "learning");
    assert.ok(isDue(card, TODAY), "a learning card is due every session");
  }
  card = applyAnswer(card, true, TODAY);
  assert.equal(card.phase, "review");
  assert.equal(card.interval_days, GRADUATION_INTERVAL_DAYS);
  assert.equal(card.due_date, "2026-11-18");
  assert.equal(isDue(card, TODAY), false);
  assert.equal(isDue(card, "2026-11-18"), true);
});

test("a wrong answer while learning resets the streak — 4 in a row are needed", () => {
  let card = newCard("l1", "L1", 1);
  card = applyAnswer(card, true, TODAY);
  card = applyAnswer(card, true, TODAY);
  card = applyAnswer(card, false, TODAY);
  assert.equal(card.streak, 0);
  assert.equal(card.phase, "learning");
});

test("review intervals grow by the ease; a lapse lowers ease, halves the interval, and needs 2 sessions to return", () => {
  let card: SrsCard = { ...newCard("l1", "L1", 1), phase: "review", interval_days: 3, due_date: TODAY };
  card = applyAnswer(card, true, TODAY);
  assert.equal(card.interval_days, 8); // round(3 * 2.5)
  assert.equal(card.due_date, "2026-11-23");

  card = applyAnswer(card, false, "2026-11-23");
  assert.equal(card.phase, "learning");
  assert.equal(card.lapses, 1);
  assert.equal(card.ease, 2.3);
  assert.equal(card.interval_days, 4);

  card = applyAnswer(card, true, "2026-11-23");
  assert.equal(card.phase, "learning");
  card = applyAnswer(card, true, "2026-11-24");
  assert.equal(card.phase, "review");
  assert.equal(card.interval_days, 4, "relearned card keeps its halved interval");
});

test("ease never drops below 1.3", () => {
  let card: SrsCard = { ...newCard("l1", "L1", 1), phase: "review", interval_days: 10, ease: 1.35, due_date: TODAY };
  card = applyAnswer(card, false, TODAY);
  assert.equal(card.ease, 1.3);
});

test("selectDueCards: learning first (shakiest first), then most-overdue reviews, capped", () => {
  const cards: SrsCard[] = [
    { ...newCard("l", "R-late", 1), phase: "review", due_date: "2026-11-14" },
    { ...newCard("l", "R-later", 1), phase: "review", due_date: "2026-11-10" },
    { ...newCard("l", "R-future", 1), phase: "review", due_date: "2026-12-01" },
    { ...newCard("l", "L-strong", 1), streak: 3 },
    { ...newCard("l", "L-weak", 1), streak: 0 },
  ];
  assert.deepEqual(selectDueCards(cards, TODAY, 10).map((c) => c.item_key), ["L-weak", "L-strong", "R-later", "R-late"]);
  assert.deepEqual(selectDueCards(cards, TODAY, 3).map((c) => c.item_key), ["L-weak", "L-strong", "R-later"]);
});

test("review sessions get longer as the course goes on", () => {
  assert.ok(reviewCapForLesson(2) < reviewCapForLesson(10));
  assert.ok(reviewCapForLesson(10) < reviewCapForLesson(25));
});

test("items always carry the learner's own particle — never bare sà-wàt-dii", () => {
  assert.equal(itemsForLesson(1, "male")[0].karaoke, "sà-wàt-dii kráp");
  assert.equal(itemsForLesson(1, "female")[0].karaoke, "sà-wàt-dii kâ");
  for (const gender of ["male", "female"] as const) {
    for (const item of allItems(gender)) {
      assert.notEqual(item.karaoke, "sà-wàt-dii");
    }
  }
});

test("every lesson 1-28 yields items; numbers and word sets yield one per word", () => {
  for (let n = 1; n <= 28; n++) assert.ok(itemsForLesson(n, "male").length > 0, `lesson ${n}`);
  assert.equal(itemsForLesson(2, "male").length, 10);
  assert.equal(itemsForLesson(8, "male").length, 4);
  assert.deepEqual(itemsForLesson(29, "male"), []);
});

test("buildQuestion: 3 distinct options, exactly one right, distractors from the same group", () => {
  for (const gender of ["male", "female"] as const) {
    for (const item of allItems(gender)) {
      for (const direction of ["th_en", "en_th"] as const) {
        const q = buildQuestion(item, direction, gender, seq([0.1, 0.7, 0.4, 0.9, 0.2]));
        assert.equal(q.options.length, 3, item.key);
        assert.equal(new Set(q.options.map((o) => o.toLowerCase())).size, 3, item.key);
        assert.equal(q.options[q.correctIndex], direction === "th_en" ? item.meaning : item.karaoke);
        assert.ok(q.options.every((o) => o.length <= 64), "button text stays short");
      }
    }
  }
  const numberQ = buildQuestion(itemsForLesson(2, "male")[0], "th_en", "male", Math.random);
  assert.ok(numberQ.options.every((o) => /^\d+$/.test(o)), "number distractors are numbers");
});
