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

export interface TelegramClient {
  sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<void>;
  answerCallbackQuery(callbackQueryId: string): Promise<void>;
  /** Uploads photo bytes directly (multipart) — Checkpoint 3, for lesson pictures. */
  sendPhoto(chatId: number, photo: MediaFile, caption?: string): Promise<void>;
  /** Uploads audio bytes directly (multipart) — Checkpoint 3, for lesson/activity audio. */
  sendAudio(chatId: number, audio: MediaFile, options?: SendAudioOptions): Promise<void>;
}

class HttpTelegramClient implements TelegramClient {
  private readonly baseUrl: string;

  constructor(botToken: string) {
    this.baseUrl = `https://api.telegram.org/bot${botToken}`;
  }

  async sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
    const body: Record<string, unknown> = { chat_id: chatId, text };
    if (keyboard) {
      body.reply_markup = { inline_keyboard: keyboard };
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
}

export interface TelegramMessage {
  text?: string;
  chat: { id: number };
  from: { id: number };
}

export interface TelegramCallbackQuery {
  id: string;
  data?: string;
  from: { id: number };
  message?: { chat: { id: number } };
}
