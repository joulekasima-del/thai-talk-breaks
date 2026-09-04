// Stage 5 (LDTKB-014) Telegram Stars checkout copy — DRAFT, given verbatim
// by the Stage 5 build prompt pending Joule's confirmation. Same "do not
// edit without checking the source" spirit as oops/content.ts: once
// confirmed, this becomes its own locked LDTKB entry, the same way
// LDTKB-038 locked the /start copy.
//
// This is a test-purchase flow for Stage 5 checkout verification
// (LDTKB-014) — NOT the final paywall (Stage 8, out of scope here). See
// handleUpdate.ts's /buy handler.

export const BUY_INVOICE_TITLE = "Thai Talk Breaks — 30-Day Course";
export const BUY_INVOICE_DESCRIPTION =
  "The full 30-day spoken-Thai course, delivered daily at your chosen time. This is a test purchase for Stage 5 checkout verification.";
export const BUY_INVOICE_PAYLOAD = "thirty_day_course_v1";
export const BUY_INVOICE_PRICE_LABEL = "30-Day Course";
export const BUY_INVOICE_AMOUNT_STARS = 500;

export const BUY_NOT_ONBOARDED_MESSAGE = "Send /start first to set up your account, then /buy again.";

export const PAYMENT_CONFIRMATION_MESSAGE =
  "🎉 Payment received — thank you! If a lesson ever fails to arrive as scheduled, send /paysupport and I'll take a look.";

export const PAYSUPPORT_PROMPT_MESSAGE =
  "What's going on with your payment? Describe it and I'll take a look. 💳\n\nJust so you know: refunds are issued when Thai Talk Breaks fails to deliver a lesson as scheduled. For anything else, I'm still glad to help however I can — it just may not always mean a refund.";

export const PAYSUPPORT_CONFIRMATION_MESSAGE =
  "Got it — I've passed this along for review and will follow up here once it's sorted. 🙏";

export const REFUND_ISSUED_MESSAGE = "Your refund has been processed — the Stars are back in your balance. Thanks for your patience! 💛";
