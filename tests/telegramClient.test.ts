import { test } from "node:test";
import assert from "node:assert/strict";

import { createTelegramClient } from "@/lib/telegram";

// Direct coverage of HttpTelegramClient.sendMessage's actual request body —
// every other test in this suite goes through FakeTelegramClient, which
// mirrors the interface contract but never proves what Telegram's real API
// actually receives. This is the one place that does, for LDTKB-053/054's
// parse_mode fix specifically (the real bug: no test anywhere previously
// caught that parse_mode was never being sent at all).

function mockFetchCapturingBody() {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as typeof fetch;
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}

test("sendMessage with parseMode 'HTML' includes parse_mode: 'HTML' in the real request body", async () => {
  const mock = mockFetchCapturingBody();
  try {
    const telegram = createTelegramClient("test-token");
    await telegram.sendMessage(123, "<b>hi</b>", undefined, "HTML");

    assert.equal(mock.calls.length, 1);
    assert.equal(mock.calls[0].body.parse_mode, "HTML");
    assert.equal(mock.calls[0].body.text, "<b>hi</b>");
  } finally {
    mock.restore();
  }
});

test("sendMessage with no parseMode sends no parse_mode field at all — byte-identical to before this fix", async () => {
  const mock = mockFetchCapturingBody();
  try {
    const telegram = createTelegramClient("test-token");
    await telegram.sendMessage(123, "plain text");

    assert.equal(mock.calls.length, 1);
    assert.equal("parse_mode" in mock.calls[0].body, false);
  } finally {
    mock.restore();
  }
});
