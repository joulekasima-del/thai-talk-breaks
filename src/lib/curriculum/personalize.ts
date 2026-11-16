// Shows a lesson's full explanation (LDTKB-051) in the learner's own
// particle form. The locked explanations are written once for everyone
// ("kráp/kâ", or the bare "sà-wàt-dii"); here each learner sees only their
// own ending — "sà-wàt-dii kráp" for a male learner, never bare "sà-wàt-dii".

import type { GenderBranch } from "@/lib/curriculum/content";
import { LESSON_EXPLANATIONS } from "@/lib/curriculum/lessonExplanations";
import { TONE_LEGEND_MESSAGE } from "@/lib/delivery/deliverLesson";

export function personalizeParticles(text: string, gender: GenderBranch): string {
  const male = gender === "male";
  return text
    .replaceAll("khǎaw-thôht ná kráp / khǎaw-thôht ná-ká", male ? "khǎaw-thôht ná kráp" : "khǎaw-thôht ná-ká")
    .replaceAll("kráp/kâ", male ? "kráp" : "kâ")
    .replaceAll("kráp/ká", male ? "kráp" : "ká");
}

/** The "📖 More" message for a lesson. Lesson 1 also carries the tone-mark legend. */
export function moreMessageFor(lessonNumber: number, gender: GenderBranch): string | null {
  const explanation = LESSON_EXPLANATIONS[lessonNumber];
  if (!explanation) return null;
  let text = personalizeParticles(explanation, gender);
  if (lessonNumber === 1) {
    text = text.replace("sà-wàt-dii — hello", `sà-wàt-dii ${gender === "male" ? "kráp" : "kâ"} — hello`);
    text = `${text}\n\n🔤 ${TONE_LEGEND_MESSAGE}`;
  }
  return text;
}
