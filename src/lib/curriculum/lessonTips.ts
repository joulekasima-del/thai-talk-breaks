// Short lesson tips — DRAFT, not locked. Mirrors curriculum/lesson-tips.md;
// needs Joule's review (and a native-speaker check) before it is locked.
//
// One tip per lesson, shown right under the phrase with the audio button.
// Week 1 tips are one line (instant gratification); from week 2 they may
// run to two. The full LDTKB-051 explanation stays one tap away behind
// "📖 More". `{phrase}` is replaced with the learner's own phrase (with
// their krap/ka ending).

export const LESSON_TIPS: Record<number, string> = {
  1: "{phrase} works for hello and goodbye, any time of day.",
  2: "Listen for the rising tone in sǎwng (2) and sǎam (3).",
  3: "Point at what you want and say it — works at any shop or food stall.",
  4: "Your go-to question at markets, taxis and tuk-tuks.",
  5: "Ask before you order — plenty of small shops are cash only.",
  6: "A friendly small-talk opener — Thais often ask it first.",
  7: "Say it with a smile and people will slow down or switch to gestures.",
  8: "Directions for taxis and motorbike rides.\nAdd dâi-loei after one for a confident, polite instruction — tap More.",
  9: "Handy when your phone is dead — and an easy chat opener.\ngìi-mohng = what time, láew = already/now.",
  10: "Three time words you'll hear every day.\nThey usually go at the start of the sentence.",
  11: "Small talk that always lands in Thailand.\nmâak = very — put it after almost any describing word.",
  12: "For clothes shopping when nothing fits.\nSwap yài (big) for lék (small) to ask for smaller.",
  13: "Your café order: ao (want, from Lesson 3) + what + how many.\ngâew = glass.",
  14: "A warm goodbye between friends.\njer = meet, gan = each other.",
  15: "Introduce yourself — just swap in your own name after chêu (name).",
  16: "Family words for small talk.\nphîi-nórng covers brothers and sisters, older and younger.",
  17: "Swap duu-nǎng (watch movies) for anything you enjoy.\nchôrp = like.",
  18: "Make plans with Thai friends.\nná makes it a friendly suggestion rather than an order.",
  19: "Say it to the cook — it always earns a smile.\nmâak = very, back from Lesson 11.",
  20: "For bumping into someone, or a real apology.\nAdd ná for a softer \"excuse me\" before a question.",
  21: "rót-dtìt = traffic jam.\nmâi before a verb makes it negative (Lesson 7).",
  22: "For the pharmacy. Swap hǔa (head) for another body part.\nbpùat = ache.",
  23: "An emergency phrase — say it loud and clear.",
  24: "Hotel check-in. nèung khuen = one night.\nSwap in another number (Lesson 2) for a longer stay.",
  25: "Ask permission for almost anything: khǎw … dâai mǎi?\nSwap in any action.",
  26: "Three quick answers for any yes/no question.\nmâi châi = not correct (mâi = not, Lesson 7).",
  27: "Thanks, upgraded — mâak = very.\nUse it with anyone who helped you.",
  28: "A compliment Thais love to hear.\nsǔay = beautiful — for places and people.",
};

export function lessonTip(lessonNumber: number, learnerPhrase: string): string | null {
  const tip = LESSON_TIPS[lessonNumber];
  return tip ? tip.replaceAll("{phrase}", learnerPhrase) : null;
}
