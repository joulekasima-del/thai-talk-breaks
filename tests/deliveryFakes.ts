import type { DeliveryRecord, DeliveryStore } from "@/lib/delivery/deliveryStore";
import type { MediaLoader } from "@/lib/delivery/deliverLesson";
import type { GenderBranch } from "@/lib/curriculum/content";
import type { MediaFile } from "@/lib/telegram";

/** Records the order of guard-relevant events, so tests can assert text-before-audio. */
export class EventLog {
  events: string[] = [];
  push(event: string) {
    this.events.push(event);
  }
}

export class FakeDeliveryStore implements DeliveryStore {
  private rows: DeliveryRecord[] = [];
  private nextId = 1;

  constructor(private log?: EventLog) {}

  async findExisting(learnerId: string, lessonNumber: number, deliveryDate: string): Promise<DeliveryRecord | null> {
    const row = this.rows.find(
      (r) => r.learner_id === learnerId && r.lesson_number === lessonNumber && r.delivery_date === deliveryDate,
    );
    return row ? { ...row } : null;
  }

  async insertTextSent(
    learnerId: string,
    lessonNumber: number,
    deliveryDate: string,
    deliveredAt: string,
  ): Promise<DeliveryRecord> {
    const existing = await this.findExisting(learnerId, lessonNumber, deliveryDate);
    if (existing) throw new Error("unique constraint violation: duplicate delivery"); // mirrors the real unique constraint
    const row: DeliveryRecord = {
      id: this.nextId++,
      learner_id: learnerId,
      lesson_number: lessonNumber,
      delivery_date: deliveryDate,
      delivered_at: deliveredAt,
      audio_delivered_at: null,
      activity_answered_at: null,
      activity_correct: null,
    };
    this.rows.push(row);
    this.log?.push(`delivered_at:${learnerId}:${lessonNumber}`);
    return { ...row };
  }

  async markAudioSent(deliveryId: number, audioDeliveredAt: string): Promise<void> {
    const row = this.rows.find((r) => r.id === deliveryId);
    if (!row) throw new Error(`no delivery row ${deliveryId}`);
    row.audio_delivered_at = audioDeliveredAt;
    this.log?.push(`audio_delivered_at:${row.learner_id}:${row.lesson_number}`);
  }

  async listDeliveredLessonNumbers(learnerId: string): Promise<number[]> {
    return this.rows.filter((r) => r.learner_id === learnerId).map((r) => r.lesson_number);
  }

  async findUnansweredActivity(learnerId: string, lessonNumber: number): Promise<DeliveryRecord | null> {
    const row = this.rows.find(
      (r) => r.learner_id === learnerId && r.lesson_number === lessonNumber && r.activity_answered_at === null,
    );
    return row ? { ...row } : null;
  }

  async markActivityAnswered(deliveryId: number, correct: boolean, answeredAt: string): Promise<void> {
    const row = this.rows.find((r) => r.id === deliveryId);
    if (!row) throw new Error(`no delivery row ${deliveryId}`);
    row.activity_answered_at = answeredAt;
    row.activity_correct = correct;
    this.log?.push(`activity_answered_at:${row.learner_id}:${row.lesson_number}:${correct}`);
  }
}

function fakeFile(filename: string): MediaFile {
  return { buffer: Buffer.from(filename), filename, contentType: "application/octet-stream" };
}

export class FakeMediaLoader implements MediaLoader {
  requested: string[] = [];

  async loadPhraseLessonImage(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
    const name = `lesson${lessonNumber}_${gender}.png`;
    this.requested.push(name);
    return fakeFile(name);
  }

  async loadCombinedNumbersImage(): Promise<MediaFile> {
    const name = "lesson2_combined.png";
    this.requested.push(name);
    return fakeFile(name);
  }

  async loadRepresentativeClip(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
    const isWordSet = [8, 10, 16, 26].includes(lessonNumber);
    const name = lessonNumber === 2 ? "lesson2_combined.mp3" : isWordSet ? `day${lessonNumber}_1.mp3` : `lesson${lessonNumber}_${gender}.mp3`;
    this.requested.push(`representative:${name}`);
    return fakeFile(name);
  }

  async loadWordSetImage(dayNumber: number): Promise<MediaFile> {
    const name = `day${dayNumber}.png`;
    this.requested.push(name);
    return fakeFile(name);
  }
}
