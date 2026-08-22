// Server-side validation of Telegram Web App initData, per Telegram's
// documented algorithm (https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app):
//   secret_key = HMAC_SHA256(key="WebAppData", data=<bot_token>)
//   data_check_string = every field except "hash", sorted by key, joined "key=value" with "\n"
//   expected_hash = HMAC_SHA256(key=secret_key, data=data_check_string), hex
// The client (src/app/day29/page.tsx) sends window.Telegram.WebApp.initData
// as-is; this is the only thing that establishes which learner opened the
// page — per LDTKB-049, it must be verified, not trusted from a raw client id.

import { createHmac, timingSafeEqual } from "node:crypto";

export interface ValidatedInitData {
  telegramUserId: number;
}

const DEFAULT_MAX_AGE_SECONDS = 24 * 60 * 60;

export function validateTelegramInitData(
  initData: string,
  botToken: string,
  options?: { maxAgeSeconds?: number; now?: () => Date },
): ValidatedInitData | null {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const providedHash = params.get("hash");
  if (!providedHash) return null;
  params.delete("hash");

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");

  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const computedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  const computedBuf = Buffer.from(computedHash, "hex");
  const providedBuf = Buffer.from(providedHash, "hex");
  if (computedBuf.length !== providedBuf.length || !timingSafeEqual(computedBuf, providedBuf)) {
    return null;
  }

  const authDateStr = params.get("auth_date");
  if (authDateStr) {
    const authDate = Number(authDateStr);
    const maxAgeSeconds = options?.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS;
    const nowSeconds = (options?.now ? options.now() : new Date()).getTime() / 1000;
    if (!Number.isFinite(authDate) || nowSeconds - authDate > maxAgeSeconds) return null;
  }

  const userJson = params.get("user");
  if (!userJson) return null;
  try {
    const user = JSON.parse(userJson) as { id?: unknown };
    if (typeof user.id !== "number") return null;
    return { telegramUserId: user.id };
  } catch {
    return null;
  }
}
