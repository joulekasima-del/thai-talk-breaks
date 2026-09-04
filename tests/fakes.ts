import type {
  InlineKeyboard,
  MediaFile,
  SendAudioOptions,
  SendInvoiceOptions,
  TelegramClient,
} from "@/lib/telegram";
import type { Learner, LearnerPatch, LearnerStore } from "@/lib/onboarding/learnerStore";

export class FakeLearnerStore implements LearnerStore {
  private learners = new Map<string, Learner>();
  private byTelegramId = new Map<number, string>();
  private nextId = 1;

  async findByTelegramId(telegramUserId: number): Promise<Learner | null> {
    const id = this.byTelegramId.get(telegramUserId);
    return id ? { ...this.learners.get(id)! } : null;
  }

  async findById(id: string): Promise<Learner | null> {
    const learner = this.learners.get(id);
    return learner ? { ...learner } : null;
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
      awaiting_paysupport_request_since: null,
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
  /** Only the welcome message (LDTKB-053/054) ever sets this — see telegram.ts's sendMessage signature. */
  parseMode?: "HTML";
}

export interface SentMedia {
  chatId: number;
  filename: string;
  caption?: string;
  /** sendAudio only — see SendAudioOptions. Never set on sentPhotos entries. */
  title?: string;
  performer?: string;
}

export interface SentInvoice {
  chatId: number;
  title: string;
  description: string;
  payload: string;
  prices: { label: string; amount: number }[];
}

export interface AnsweredPreCheckoutQuery {
  preCheckoutQueryId: string;
  ok: boolean;
  errorMessage?: string;
}

export interface IssuedRefund {
  userId: number;
  telegramPaymentChargeId: string;
}

export class FakeTelegramClient implements TelegramClient {
  sent: SentMessage[] = [];
  sentPhotos: SentMedia[] = [];
  sentAudio: SentMedia[] = [];
  answeredCallbackIds: string[] = [];
  sentInvoices: SentInvoice[] = [];
  answeredPreCheckoutQueries: AnsweredPreCheckoutQuery[] = [];
  refunds: IssuedRefund[] = [];

  /** Optional shared event log (see tests/deliveryFakes.ts EventLog), for cross-fake ordering assertions. */
  constructor(private log?: { push(event: string): void }) {}

  async sendMessage(chatId: number, text: string, keyboard?: InlineKeyboard, parseMode?: "HTML"): Promise<void> {
    this.sent.push({ chatId, text, keyboard, parseMode });
  }

  async answerCallbackQuery(callbackQueryId: string): Promise<void> {
    this.answeredCallbackIds.push(callbackQueryId);
  }

  async sendPhoto(chatId: number, photo: MediaFile, caption?: string): Promise<void> {
    this.sentPhotos.push({ chatId, filename: photo.filename, caption });
  }

  async sendAudio(chatId: number, audio: MediaFile, options?: SendAudioOptions): Promise<void> {
    this.sentAudio.push({ chatId, filename: audio.filename, title: options?.title, performer: options?.performer });
    this.log?.push(`sendAudio:${audio.filename}`);
  }

  async sendInvoice(chatId: number, options: SendInvoiceOptions): Promise<void> {
    this.sentInvoices.push({
      chatId,
      title: options.title,
      description: options.description,
      payload: options.payload,
      prices: options.prices,
    });
  }

  async answerPreCheckoutQuery(preCheckoutQueryId: string, ok: boolean, errorMessage?: string): Promise<void> {
    this.answeredPreCheckoutQueries.push({ preCheckoutQueryId, ok, errorMessage });
  }

  async refundStarPayment(userId: number, telegramPaymentChargeId: string): Promise<void> {
    this.refunds.push({ userId, telegramPaymentChargeId });
  }
}
