// Access to oops_reports (supabase/migrations/20260826000000_oops_reports.sql).
// Every report gets its own row — unlike day29QuestStore.ts's single-row-
// per-learner guard, there is no "already exists" check here at all.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface OopsReport {
  id: string;
  learner_id: string;
  report_text: string;
  created_at: string;
}

export interface OopsReportsStore {
  create(learnerId: string, reportText: string): Promise<OopsReport>;
}

export function supabaseOopsReportsStore(client: SupabaseClient): OopsReportsStore {
  return {
    async create(learnerId, reportText) {
      const { data, error } = await client
        .from("oops_reports")
        .insert({ learner_id: learnerId, report_text: reportText })
        .select("*")
        .single();
      if (error) throw error;
      return data as OopsReport;
    },
  };
}
