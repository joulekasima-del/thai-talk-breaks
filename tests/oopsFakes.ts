import type { OopsReport, OopsReportsStore } from "@/lib/oops/oopsReportsStore";

export class FakeOopsReportsStore implements OopsReportsStore {
  reports: OopsReport[] = [];
  private nextId = 1;

  async create(learnerId: string, reportText: string): Promise<OopsReport> {
    const report: OopsReport = {
      id: `oops-${this.nextId++}`,
      learner_id: learnerId,
      report_text: reportText,
      created_at: new Date().toISOString(),
    };
    this.reports.push(report);
    return { ...report };
  }
}
