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
}

function fakeFile(filename: string): MediaFile {
  return { buffer: Buffer.from(filename), filename, contentType: "application/octet-stream" };
}

export class FakeMediaLoader implements MediaLoader {
  requested: string[] = [];

  async loadPhraseLessonAudio(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
    const name = `lesson${lessonNumber}_${gender}.mp3`;
    this.requested.push(name);
    return fakeFile(name);
  }

  async loadPhraseLessonImage(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
    const name = `lesson${lessonNumber}_${gender}.png`;
    this.requested.push(name);
    return fakeFile(name);
  }

  async loadNumberAudio(numberValue: number): Promise<MediaFile> {
    const name = `lesson2_${numberValue}.mp3`;
    this.requested.push(name);
    return fakeFile(name);
  }

  async loadNumberImage(numberValue: number): Promise<MediaFile> {
    const name = `lesson2_${numberValue}.png`;
    this.requested.push(name);
    return fakeFile(name);
  }

  async loadRepresentativeClip(lessonNumber: number, gender: GenderBranch): Promise<MediaFile> {
    const name = lessonNumber === 2 ? "lesson2_5.mp3" : `lesson${lessonNumber}_${gender}.mp3`;
    this.requested.push(`representative:${name}`);
    return fakeFile(name);
  }
}
