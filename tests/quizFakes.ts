import type { Day30QuizProgress, Day30QuizStore } from "@/lib/quiz/day30QuizStore";

export class FakeDay30QuizStore implements Day30QuizStore {
  private rows = new Map<string, Day30QuizProgress>();
  private nextId = 1;

  async findByLearner(learnerId: string): Promise<Day30QuizProgress | null> {
    const row = [...this.rows.values()].find((r) => r.learner_id === learnerId);
    return row ? { ...row } : null;
  }

  async start(learnerId: string): Promise<Day30QuizProgress> {
    const id = `progress-${this.nextId++}`;
    const row: Day30QuizProgress = {
      id,
      learner_id: learnerId,
      current_question_index: 1,
      correct_count: 0,
      completed_at: null,
    };
    this.rows.set(id, row);
    return { ...row };
  }

  async recordAnswer(id: string, correct: boolean): Promise<Day30QuizProgress> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`no progress row ${id}`);
    row.correct_count += correct ? 1 : 0;
    return { ...row };
  }

  async advance(id: string, nextQuestionIndex: number): Promise<Day30QuizProgress> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`no progress row ${id}`);
    row.current_question_index = nextQuestionIndex;
    return { ...row };
  }

  async complete(id: string, completedAt: string): Promise<Day30QuizProgress> {
    const row = this.rows.get(id);
    if (!row) throw new Error(`no progress row ${id}`);
    row.completed_at = completedAt;
    return { ...row };
  }
}
