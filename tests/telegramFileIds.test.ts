import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

import type { Query } from "@/lib/db";
import { createTelegramClient, type FileIdCache, type MediaFile } from "@/lib/telegram";
import { botIdFromToken, pgFileIdCache } from "@/lib/telegramFileIdStore";

// Lesson pictures are uploaded once per bot; after that Telegram's file_id is
// sent instead (much less CPU per delivery on Cloudflare's free plan).

const PHOTO: MediaFile = {
  buffer: new Uint8Array([1, 2, 3]),
  filename: "week2_day09_female.png",
  contentType: "image/png",
  path: "week2-images/week2_day09_female.png",
};

class MemoryCache implements FileIdCache {
  map = new Map<string, string>();
  async get(p: string) {
    return this.map.get(p) ?? null;
  }
  async put(p: string, id: string) {
    this.map.set(p, id);
  }
}

type Call = { method: string; json: Record<string, unknown> | null; multipart: boolean };

/** Fake Telegram: multipart uploads return a photo with file_id "uploaded-N"; JSON sends succeed unless the id is in `rejected`. */
function mockTelegram(rejected: string[] = []) {
  const calls: Call[] = [];
  let uploads = 0;
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const method = String(url).split("/").pop()!;
    const multipart = init?.body instanceof FormData;
    const json = multipart ? null : (JSON.parse(String(init?.body)) as Record<string, unknown>);
    calls.push({ method, json, multipart });
    if (multipart) {
      uploads += 1;
      const result = { photo: [{ file_id: "small" }, { file_id: `uploaded-${uploads}` }] };
      return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
    }
    if (rejected.includes(String(json?.photo))) {
      return new Response(JSON.stringify({ ok: false, description: "Bad Request: wrong file identifier" }), { status: 400 });
    }
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => (globalThis.fetch = original) };
}

test("first send uploads and remembers the largest size's file_id; the next send reuses it with no upload", async () => {
  const mock = mockTelegram();
  try {
    const cache = new MemoryCache();
    const telegram = createTelegramClient("123:abc", { fileIdCache: cache });

    await telegram.sendPhoto(1, PHOTO);
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].multipart, true);
    assert.equal(cache.map.get(PHOTO.path!), "uploaded-1");

    await telegram.sendPhoto(2, PHOTO, "hi");
    assert.equal(mock.calls.length, 2);
    assert.equal(mock.calls[1].multipart, false);
    assert.deepEqual(mock.calls[1].json, { chat_id: 2, photo: "uploaded-1", caption: "hi" });
  } finally {
    mock.restore();
  }
});

test("a file_id Telegram rejects (400) falls back to an upload and replaces the cached id", async () => {
  const mock = mockTelegram(["stale-id"]);
  try {
    const cache = new MemoryCache();
    cache.map.set(PHOTO.path!, "stale-id");
    const telegram = createTelegramClient("123:abc", { fileIdCache: cache });

    await telegram.sendPhoto(1, PHOTO);
    assert.deepEqual(
      mock.calls.map((c) => c.multipart),
      [false, true],
    );
    assert.equal(cache.map.get(PHOTO.path!), "uploaded-1");
  } finally {
    mock.restore();
  }
});

test("a cache that fails never blocks the photo: it is just uploaded", async () => {
  const mock = mockTelegram();
  try {
    const broken: FileIdCache = {
      get: async () => {
        throw new Error("db down");
      },
      put: async () => {
        throw new Error("db down");
      },
    };
    const telegram = createTelegramClient("123:abc", { fileIdCache: broken });
    await telegram.sendPhoto(1, PHOTO);
    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].multipart, true);
  } finally {
    mock.restore();
  }
});

test("without a cache, or for a file with no path, every send uploads (old behaviour)", async () => {
  const mock = mockTelegram();
  try {
    await createTelegramClient("123:abc").sendPhoto(1, PHOTO);
    const cache = new MemoryCache();
    await createTelegramClient("123:abc", { fileIdCache: cache }).sendPhoto(1, { ...PHOTO, path: undefined });
    assert.deepEqual(
      mock.calls.map((c) => c.multipart),
      [true, true],
    );
    assert.equal(cache.map.size, 0);
  } finally {
    mock.restore();
  }
});

test("botIdFromToken reads the numeric id before the colon", () => {
  assert.equal(botIdFromToken("8123456789:AAH-secret"), 8123456789);
  assert.equal(botIdFromToken("not-a-token"), null);
});

// The real SQL against an in-process Postgres built from the repo's migrations.
let db: PGlite;
let query: Query;

before(async () => {
  db = new PGlite();
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  for (const file of fs.readdirSync(dir).filter((n) => n.endsWith(".sql") && !n.includes("delivery_cron")).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, file), "utf8").replace(/create extension[^;]*pgcrypto[^;]*;/gi, ""));
  }
  query = async (text, params = []) => (await db.query(text, params)).rows as Record<string, unknown>[];
});

after(async () => {
  await db.close();
});

test("pgFileIdCache: ids are kept per bot and overwritten on re-upload", async () => {
  const realBot = pgFileIdCache(query, 8123456789);
  const testBot = pgFileIdCache(query, 7000000001);

  assert.equal(await realBot.get("week2-images/a.png"), null);
  await realBot.put("week2-images/a.png", "id-1");
  assert.equal(await realBot.get("week2-images/a.png"), "id-1");
  assert.equal(await testBot.get("week2-images/a.png"), null);

  await realBot.put("week2-images/a.png", "id-2");
  assert.equal(await realBot.get("week2-images/a.png"), "id-2");
});
