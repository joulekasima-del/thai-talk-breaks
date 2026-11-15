// Learner persistence, abstracted behind an interface so the onboarding
// logic (handleUpdate.ts) can be unit-tested against an in-memory fake
// without a real database connection. pgLearnerStore() below is the
// only implementation that talks to the actual `learners` table defined in
// supabase/migrations/20260820000000_initial_schema.sql.

import { queryMany, queryOne, queryOneOrThrow, type Query } from "@/lib/db";

export type GenderBranch = "male" | "female";
export type SchedulePeriod = "morning" | "afternoon" | "evening";
export type OnboardingStep =
  | "gender_pending"
  | "schedule_period_pending"
  | "schedule_time_pending"
  | "complete";

export interface Learner {
  id: string;
  telegram_user_id: number;
  gender_branch: GenderBranch | null;
  schedule_period: SchedulePeriod | null;
  schedule_time: string | null;
  onboarding_step: OnboardingStep;
  onboarding_completed_at: string | null;
  pilot_start_date: string | null;
  /**
   * Thailand calendar date ("YYYY-MM-DD") the learner's paid content (Day 8)
   * actually started — the anchor Days 8-30 count from, replacing
   * pilot_start_date for that range only (Days 1-7 keep using
   * pilot_start_date, untouched). Null until they cross the Day 8 paywall.
   * Cleared back to null by /refund. See
   * supabase/migrations/20260909000000_paid_course_gating.sql and
   * delivery/duePaidLearners.ts.
   */
  paid_course_start_date: string | null;
  /**
   * Set the first time the one-time Day 8 check-in message is sent; null
   * otherwise. A permanent "have they ever seen this" marker — NOT a
   * transient pending flag, so (unlike the awaiting_* flags below) it is
   * deliberately never cleared on /start.
   */
  paywall_prompt_sent_at: string | null;
  /**
   * Set while waiting for a learner's next message to be captured as an
   * /oops report; null otherwise. Deliberately independent of
   * onboarding_step — see supabase/migrations/20260826000000_oops_reports.sql.
   */
  awaiting_oops_report_since: string | null;
  /**
   * Set while waiting for a learner's next message to be captured as a
   * /paysupport request; null otherwise. Same pending-flag pattern as
   * awaiting_oops_report_since — see
   * supabase/migrations/20260903000000_star_payments.sql (Stage 5, LDTKB-014).
   */
  awaiting_paysupport_request_since: string | null;
}

export type LearnerPatch = Partial<
  Pick<
    Learner,
    | "gender_branch"
    | "schedule_period"
    | "schedule_time"
    | "onboarding_step"
    | "onboarding_completed_at"
    | "pilot_start_date"
    | "paid_course_start_date"
    | "paywall_prompt_sent_at"
    | "awaiting_oops_report_since"
    | "awaiting_paysupport_request_since"
  >
>;

export interface LearnerStore {
  findByTelegramId(telegramUserId: number): Promise<Learner | null>;
  /**
   * Look up by the learner's own row id, not their Telegram id. Added for
   * Stage 5 (LDTKB-014)'s /refund flow: a purchases row only carries
   * learner_id (the internal uuid), so resolving the learner's
   * telegram_user_id to actually send them the refund-issued message (and
   * call refundStarPayment) needs this, not findByTelegramId.
   */
  findById(id: string): Promise<Learner | null>;
  create(telegramUserId: number): Promise<Learner>;
  update(id: string, patch: LearnerPatch): Promise<Learner>;
  /**
   * All learners with onboarding_step = 'complete' (uses the
   * idx_learners_due_for_delivery partial index). Added in Checkpoint 3 for
   * the delivery cron route — the onboarding flow itself (handleUpdate.ts)
   * never calls this; it only ever looks up a single learner by Telegram id.
   */
  listOnboarded(): Promise<Learner[]>;
}

const LEARNER_PATCH_COLUMNS = [
  "gender_branch",
  "schedule_period",
  "schedule_time",
  "onboarding_step",
  "onboarding_completed_at",
  "pilot_start_date",
  "paid_course_start_date",
  "paywall_prompt_sent_at",
  "awaiting_oops_report_since",
  "awaiting_paysupport_request_since",
] as const;

export function pgLearnerStore(query: Query): LearnerStore {
  return {
    async findByTelegramId(telegramUserId) {
      return queryOne<Learner>(query, "SELECT to_jsonb(l) AS r FROM learners l WHERE telegram_user_id = $1", [
        telegramUserId,
      ]);
    },

    async findById(id) {
      return queryOne<Learner>(query, "SELECT to_jsonb(l) AS r FROM learners l WHERE id = $1", [id]);
    },

    async create(telegramUserId) {
      return queryOneOrThrow<Learner>(
        query,
        "INSERT INTO learners (telegram_user_id) VALUES ($1) RETURNING to_jsonb(learners) AS r",
        [telegramUserId],
      );
    },

    async update(id, patch) {
      // Same as the old PostgREST update: keys the patch doesn't set (or sets to
      // undefined) are left alone; only whitelisted columns can be written.
      const entries = LEARNER_PATCH_COLUMNS.filter((column) => patch[column] !== undefined).map(
        (column) => [column, patch[column]] as const,
      );
      if (entries.length === 0) {
        return queryOneOrThrow<Learner>(query, "SELECT to_jsonb(l) AS r FROM learners l WHERE id = $1", [id]);
      }
      const assignments = entries.map(([column], index) => `${column} = $${index + 2}`).join(", ");
      return queryOneOrThrow<Learner>(
        query,
        `UPDATE learners SET ${assignments} WHERE id = $1 RETURNING to_jsonb(learners) AS r`,
        [id, ...entries.map(([, value]) => value)],
      );
    },

    async listOnboarded() {
      return queryMany<Learner>(query, "SELECT to_jsonb(l) AS r FROM learners l WHERE onboarding_step = 'complete'");
    },
  };
}
