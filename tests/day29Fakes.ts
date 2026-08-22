import type { Day29QuestProgress, Day29QuestStore } from "@/lib/day29/questStore";

export class FakeDay29QuestStore implements Day29QuestStore {
  private rows = new Map<string, Day29QuestProgress>(); // keyed by learner_id
  private nextId = 1;

  async findByLearner(learnerId: string): Promise<Day29QuestProgress | null> {
    const row = this.rows.get(learnerId);
    return row ? { ...row } : null;
  }

  async markAnsweredCorrectly(learnerId: string, answeredAt: string): Promise<Day29QuestProgress> {
    const existing = this.rows.get(learnerId);
    const row: Day29QuestProgress = existing
      ? { ...existing, answered_correctly_at: answeredAt }
      : { id: `quest-${this.nextId++}`, learner_id: learnerId, answered_correctly_at: answeredAt };
    this.rows.set(learnerId, row);
    return { ...row };
  }
}
