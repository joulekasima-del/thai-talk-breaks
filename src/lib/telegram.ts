// Minimal Telegram Bot API client. Raw fetch, no SDK — see ARCHITECTURE.md /
// the Checkpoint 2 report for why: onboarding only needs sendMessage and
// answerCallbackQuery, so a full SDK dependency isn't earning its place yet.

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

export interface TelegramClient {
  sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<void>;
  answerCallbackQuery(callbackQueryId: string): Promise<void>;
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
}

export function createTelegramClient(botToken: string): TelegramClient {
  return new HttpTelegramClient(botToken);
}

// Minimal subset of the Telegram Update shape this webhook actually reads.
// https://core.telegram.org/bots/api#update

export interface TelegramUpdate {
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
