// The actual ordering guarantee behind the dedup hotfix, as one small
// testable unit: `process()` — which is whatever sends Telegram messages or
// mutates learner state — is only ever invoked when tryMarkProcessed says
// this update_id is new. For a retry of an already-processed update,
// `process()` is never called at all (not called-then-ignored), and the
// caller (webhook/route.ts) still returns 200 OK either way.

import type { ProcessedUpdatesStore } from "@/lib/webhook/processedUpdatesStore";

export async function dedupeAndProcess(
  updateId: number,
  store: ProcessedUpdatesStore,
  process: () => Promise<void>,
): Promise<{ processed: boolean }> {
  const isNewUpdate = await store.tryMarkProcessed(updateId);
  if (!isNewUpdate) return { processed: false };
  await process();
  return { processed: true };
}
