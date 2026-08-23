import type { InlineKeyboard, MediaFile, TelegramClient } from "@/lib/telegram";
import type { Learner, LearnerPatch, LearnerStore } from "@/lib/onboarding/learnerStore";

export class FakeLearnerStore implements LearnerStore {
  private learners = new Map<string, Learner>();
  private byTelegramId = new Map<number, string>();
  private nextId = 1;

  async findByTelegramId(telegramUserId: number): Promise<Learner | null> {
    const id = this.byTelegramId.get(telegramUserId);
    return id ? { ...this.learners.get(id)! } : null;
  }

  async create(telegramUserId: number): Promise<Learner> {
    const id = `learner-${this.nextId++}`;
    const learner: Learner = {
      id,
      telegram_user_id: telegramUserId,
      gender_branch: null,
      schedule_period: null,
      schedule_time: null,
      onboarding_step: "gender_pending",
      onboarding_completed_at: null,
      pilot_start_date: null,
      awaiting_oops_report_since: null,
    };
    this.learners.set(id, learner);
    this.byTelegramId.set(telegramUserId, id);
    return { ...learner };
  }

  async update(id: string, patch: LearnerPatch): Promise<Learner> {
    const existing = this.learners.get(id);
    if (!existing) throw new Error(`FakeLearnerStore: no learner ${id}`);
    const updated = { ...existing, ...patch };
    this.learners.set(id, updated);
    return { ...updated };
  }

  async listOnboarded(): Promise<Learner[]> {
    return [...this.learners.values()].filter((l) => l.onboarding_step === "complete").map((l) => ({ ...l }));
  }
}

export interface SentMessage {
  chatId: number;
  text: string;
  keyboard?: InlineKeyboard;
}

export interface SentMedia {
  chatId: number;
  filename: string;
  caption?: string;
}

export class FakeTelegramClient implements TelegramClient {
  sent: SentMessage[] = [];
  sentPhotos: SentMedia[] = [];
  sentAudio: SentMedia[] = [];
  answeredCallbackIds: string[] = [];

  /** Optional shared event log (see tests/deliveryFakes.ts EventLog), for cross-fake ordering assertions. */
  constructor(private log?: { push(event: string): void }) {}

  async sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
    this.sent.push({ chatId, text, keyboard });
  }

  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    this.answeredCallbackIds.push(callbackQueryId);
  }

  async sendPhoto(chatId: number, photo: MediaFile, caption?: string): Promise<void> {
    this.sentPhotos.push({ chatId, filename: photo.filename, caption });
  }

  async sendAudio(chatId: number, audio: MediaFile, caption?: string): Promise<void> {
    this.sentAudio.push({ chatId, filename: audio.filename, caption });
    this.log?.push(`sendAudio:${audio.filename}`);
  }
}
