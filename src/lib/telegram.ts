// Minimal Telegram Bot API client. Raw fetch, no SDK — see ARCHITECTURE.md /
// the Checkpoint 2 report for why: onboarding only needs sendMessage and
// answerCallbackQuery, so a full SDK dependency isn't earning its place yet.

// Telegram's actual API: a button has either callback_data OR web_app, never
// both (https://core.telegram.org/bots/api#inlinekeyboardbutton). web_app is
// Checkpoint 6 — Day 29's living comic is the first thing in this project
// that opens as a genuine Telegram Web App rather than driving a callback.
export type InlineKeyboardButton =
  | { text: string; callback_data: string }
  | { text: string; web_app: { url: string } };

export type InlineKeyboard = InlineKeyboardButton[][];

export interface MediaFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

// Telegram's sendAudio has real `title`/`performer` fields specifically so a
// caller doesn't have to expose the raw uploaded filename as the audio
// player's displayed title (https://core.telegram.org/bots/api#sendaudio).
// Replaces the old single `caption` parameter for sendAudio specifically —
// sendPhoto has no equivalent concept and keeps its own caption unchanged.
export interface SendAudioOptions {
  title?: string;
  performer?: string;
}

// Stage 5 (LDTKB-014): Telegram Stars checkout. One price tier, one item —
// see sendInvoice's own doc comment for why `prices` is still an array and
// why `provider_token`/`currency` aren't caller-supplied options.
export interface InvoicePrice {
  label: string;
  amount: number;
}

export interface SendInvoiceOptions {
  title: string;
  description: string;
  payload: string;
  prices: InvoicePrice[];
}

export interface TelegramClient {
  /**
   * `parseMode` is optional and defaults to unset — omitting it (every call
   * site except the welcome message) sends exactly as before this existed,
   * with no `parse_mode` field at all. Only "HTML" is supported: Telegram's
   * actual tag set for it (`<b>`, `<i>`, etc. — not Markdown asterisks,
   * which were the original bug here) is what LDTKB-053/054's welcome
   * message uses.
   */
  sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard, parseMode?: "HTML"): Promise<void>;
  answerCallbackQuery(callbackQueryId: string): Promise<void>;
  /** Uploads photo bytes directly (multipart) — Checkpoint 3, for lesson pictures. */
  sendPhoto(chatId: number, photo: MediaFile, caption?: string): Promise<void>;
  /** Uploads audio bytes directly (multipart) — Checkpoint 3, for lesson/activity audio. */
  sendAudio(chatId: number, audio: MediaFile, options?: SendAudioOptions): Promise<void>;
  /**
   * POSTs to /sendInvoice. Stars-only in this project — `currency` is
   * hardcoded to "XTR" and `provider_token` to "" (empty string, Telegram's
   * documented requirement for Stars) inside the implementation, not
   * exposed as caller-supplied options, since this client only ever sells
   * Stars-priced digital goods (Stage 5, LDTKB-014/LDTKB-008).
   */
  sendInvoice(chatId: number, options: SendInvoiceOptions): Promise<void>;
  /**
   * POSTs to /answerPreCheckoutQuery. Must be called within Telegram's
   * ~10-second window after the pre_checkout_query update arrives, or the
   * payment fails client-side.
   */
  answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string): Promise<void>;
  /** POSTs to /refundStarPayment — issues a Stars refund for a completed payment. */
  refundStarPayment(userId: number, telegramPaymentChargeId: string): Promise<void>;
}

class HttpTelegramClient implements TelegramClient {
  private readonly baseUrl: string;

  constructor(botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard, parseMode?: "HTML"): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (keyboard) {
      body.reply_markup = { inline_keyboard: keyboard };
    }
    if (parseMode) {
      body.parse_mode = parseMode;
    }
    const res = await fetch(`${this.baseUrl}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Telegram sendMessage failed: ${res.status} ${await res.text()}`);
    }
  }

  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    });
    if (!res.ok) {
      throw new Error(`Telegram answerCallbackQuery failed: ${res.status} ${await res.text()}`);
    }
  }

  async sendPhoto(chatId: number, photo: MediaFile, caption?: string): Promise<void> {
    await this.sendMultipart("sendPhoto", "photo", chatId, photo, caption);
  }

  async sendAudio(chatId: number, audio: MediaFile, options?: SendAudioOptions): Promise<void> {
    const extraFields: Record<string, string> = {};
    if (options?.title) extraFields.title = options.title;
    if (options?.performer) extraFields.performer = options.performer;
    await this.sendMultipart("sendAudio", "audio", chatId, audio, undefined, extraFields);
  }

  async sendInvoice(chatId: number, options: SendInvoiceOptions): Promise<void> {
    // Stars-only: currency is always "XTR", provider_token is always "" —
    // Telegram's documented requirement for Stars payments (no real payment
    // provider is involved). Hardcoded here, not exposed as caller options.
    // Note on `start_parameter`: required by very old Bot API versions, but
    // the current sendInvoice method lists it as optional (only relevant
    // for building a shareable invoice deep-link) — omitted here since
    // nothing in this project needs that link.
    const res = await fetch(`${this.baseUrl}/sendInvoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        title: options.title,
        description: options.description,
        payload: options.payload,
        provider_token: "",
        currency: "XTR",
        prices: options.prices,
      }),
    });
    if (!res.ok) {
      throw new Error(`Telegram sendInvoice failed: ${res.status} ${await res.text()}`);
    }
  }

  async answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string): Promise<void> {
    const body: Record<string, unknown> = { pre_checkout_query_id: preCheckoutQueryId, ok };
    if (!ok && errorMessage) body.error_message = errorMessage;
    const res = await fetch(`${this.baseUrl}/answerPreCheckoutQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Telegram answerPreCheckoutQuery failed: ${res.status} ${await res.text()}`);
    }
  }

  async refundStarPayment(userId: number, telegramPaymentChargeId: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/refundStarPayment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, telegram_payment_charge_id: telegramPaymentChargeId }),
    });
    if (!res.ok) {
      throw new Error(`Telegram refundStarPayment failed: ${res.status} ${await res.text()}`);
    }
  }

  private async sendMultipart(
    method: string,
    field: string,
    chatId: number,
    file: MediaFile,
    caption?: string,
    extraFields?: Record<string, string>,
  ): Promise<void> {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    if (caption) form.set("caption", caption);
    if (extraFields) {
      for (const [key, value] of Object.entries(extraFields)) {
        form.set(key, value);
      }
    }
    form.set(field, new Blob([new Uint8Array(file.buffer)], { type: file.contentType }), file.filename);

    const res = await fetch(`${this.baseUrl}/${method}`, { method: "POST", body: form });
    if (!res.ok) {
      throw new Error(`Telegram ${method} failed: ${res.status} ${await res.text()}`);
    }
  }
}

export function createTelegramClient(botToken: string): TelegramClient {
  return new HttpTelegramClient(botToken);
}

// Minimal subset of the Telegram Update shape this webhook actually reads.
// https://core.telegram.org/bots/api#update

export interface TelegramUpdate {
  // Unique, monotonically-increasing per update — Telegram's own dedup key.
  // See processedUpdatesStore.ts / webhook/route.ts for why this now
  // matters: Telegram retries delivery of the same update_id if it doesn't
  // get a timely 200 OK, and until this hotfix nothing tracked update_id at
  // all, so a retry was silently processed twice.
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  /**
   * Stage 5 (LDTKB-014): sent by Telegram right after a learner taps "Pay"
   * on an invoice, before the payment is actually charged. Must be answered
   * (answerPreCheckoutQuery) within ~10 seconds. Carries no `message` at
   * all — handleUpdate.ts must route on this before falling through to any
   * text-based branch.
   */
  pre_checkout_query?: TelegramPreCheckoutQuery;
}

export interface TelegramMessage {
  text?: string;
  chat: { id: number };
  from: { id: number };
  /**
   * Stage 5 (LDTKB-014): present on the confirmation message Telegram sends
   * once a Stars payment actually completes. `text` is typically undefined
   * on this message — handleUpdate.ts checks for this explicitly before the
   * plain-text/oops-capture fallback, so it isn't silently swallowed.
   */
  successful_payment?: TelegramSuccessfulPayment;
}

export interface TelegramPreCheckoutQuery {
  id: string;
  from: { id: number };
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

export interface TelegramSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
}

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from: { id: number };
  message?: { chat: { id: number } };
}
