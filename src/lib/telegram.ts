import crypto from "node:crypto";

/**
 * Payload the Telegram Login Widget hands us after the user authorises.
 * Docs: https://core.telegram.org/widgets/login#receiving-authorization-data
 */
export interface TelegramAuthPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

const MAX_AUTH_AGE_SECONDS = 60 * 60; // Telegram recommends rejecting payloads older than 1h

/**
 * Verifies the HMAC signature attached to a Telegram Login Widget payload.
 *
 * Algorithm (from Telegram docs):
 *   secret = SHA256(bot_token)
 *   data_check_string = sorted "k=v" lines joined by "\n", excluding "hash"
 *   expected_hash = HMAC_SHA256(secret, data_check_string) as hex
 *
 * Also rejects payloads older than {@link MAX_AUTH_AGE_SECONDS} so a leaked
 * widget POST cannot be replayed indefinitely.
 *
 * Returns the typed payload on success, or null on any failure.
 */
export function verifyTelegramAuth(
  payload: Record<string, unknown>,
  botToken: string,
): TelegramAuthPayload | null {
  const hash = payload.hash;
  const id = payload.id;
  const authDate = payload.auth_date;

  if (typeof hash !== "string" || hash.length !== 64) return null;
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  if (typeof authDate !== "number" || !Number.isFinite(authDate)) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec - authDate > MAX_AUTH_AGE_SECONDS) return null;
  if (authDate - nowSec > 60) return null; // clock skew tolerance going forward

  // Build data-check-string: all fields except `hash`, sorted by key, "k=v" joined by \n.
  const lines: string[] = [];
  for (const key of Object.keys(payload).sort()) {
    if (key === "hash") continue;
    const value = payload[key];
    if (value === undefined || value === null) continue;
    lines.push(`${key}=${value}`);
  }
  const dataCheckString = lines.join("\n");

  const secret = crypto.createHash("sha256").update(botToken).digest();
  const expected = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");

  let actualBuf: Buffer;
  let expectedBuf: Buffer;
  try {
    actualBuf = Buffer.from(hash, "hex");
    expectedBuf = Buffer.from(expected, "hex");
  } catch {
    return null;
  }
  if (actualBuf.length !== expectedBuf.length) return null;
  if (!crypto.timingSafeEqual(actualBuf, expectedBuf)) return null;

  return {
    id,
    first_name: typeof payload.first_name === "string" ? payload.first_name : undefined,
    last_name: typeof payload.last_name === "string" ? payload.last_name : undefined,
    username: typeof payload.username === "string" ? payload.username : undefined,
    photo_url: typeof payload.photo_url === "string" ? payload.photo_url : undefined,
    auth_date: authDate,
    hash,
  };
}

/**
 * Synthetic email used as the auth.users.email for Telegram-only accounts.
 * The subdomain has no MX record so no real account can ever exist at it,
 * which means there is no way for a Google/email signup to collide with
 * `telegram_<id>@telegram.bugattisound.online`.
 */
export function telegramSyntheticEmail(id: number): string {
  return `telegram_${id}@telegram.bugattisound.online`;
}

export function telegramDisplayName(payload: TelegramAuthPayload): string {
  const parts = [payload.first_name, payload.last_name].filter(Boolean).join(" ").trim();
  if (parts) return parts;
  if (payload.username) return `@${payload.username}`;
  return `Telegram ${payload.id}`;
}
