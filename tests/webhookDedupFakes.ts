import type { ProcessedUpdatesStore } from "@/lib/webhook/processedUpdatesStore";

export class FakeProcessedUpdatesStore implements ProcessedUpdatesStore {
  private seen = new Set<number>();
  markProcessedCalls: number[] = [];

  async tryMarkProcessed(updateId: number): Promise<boolean> {
    this.markProcessedCalls.push(updateId);
    if (this.seen.has(updateId)) return false;
    this.seen.add(updateId);
    return true;
  }
}
