// Access to oops_reports (supabase/migrations/20260826000000_oops_reports.sql).
// Every report gets its own row — unlike day29QuestStore.ts's single-row-
// per-learner guard, there is no "already exists" check here at all.

import { queryOneOrThrow, type Query } from "@/lib/db";

export interface OopsReport {
  id: string;
  learner_id: string;
  report_text: string;
  created_at: string;
}

export interface OopsReportsStore {
  create(learnerId: string, reportText: string): Promise<OopsReport>;
}

export function pgOopsReportsStore(query: Query): OopsReportsStore {
  return {
    async create(learnerId, reportText) {
      return queryOneOrThrow<OopsReport>(
        query,
        "INSERT INTO oops_reports (learner_id, report_text) VALUES ($1, $2) RETURNING to_jsonb(oops_reports) AS r",
        [learnerId, reportText],
      );
    },
  };
}
