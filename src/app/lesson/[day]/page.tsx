import { WEEKS234_LAST_DAY } from "@/lib/curriculum/content";
import LessonClient from "./LessonClient";

// The lesson Web App page is the same for every day (it reads the day from the
// URL and fetches its content from /api/lesson/<day>), so the static build on
// Cloudflare just needs one prebuilt copy per lesson day, 1..28.
export function generateStaticParams() {
  return Array.from({ length: WEEKS234_LAST_DAY }, (_, index) => ({ day: String(index + 1) }));
}

export default function LessonPage() {
  return <LessonClient />;
}
