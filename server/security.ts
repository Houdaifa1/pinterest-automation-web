import type { Context } from "hono";
import type { AppEnv, Env } from "./types";

const encoder = new TextEncoder();
export const now = () => Math.floor(Date.now() / 1000);
export const id = () => crypto.randomUUID();
export function base64url(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export function unbase64(value: string) {
  return Uint8Array.from(
    atob(value.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
}
export function randomToken() {
  return base64url(crypto.getRandomValues(new Uint8Array(32)));
}
export async function hash(value: string) {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
}
export async function hashBytes(value: Uint8Array) {
  return base64url(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(value).buffer),
    ),
  );
}
async function encryptionKey(env: Env) {
  if (!env.ENCRYPTION_KEY) throw new Error("encryption_unavailable");
  const raw = unbase64(env.ENCRYPTION_KEY);
  if (raw.length !== 32) throw new Error("encryption_unavailable");
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encrypt(env: Env, value: string, owner: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(owner) },
    await encryptionKey(env),
    encoder.encode(value),
  );
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(cipher))}`;
}
export async function decrypt(env: Env, value: string, owner: string) {
  const [version, iv, cipher] = value.split(".");
  if (version !== "v1" || !iv || !cipher)
    throw new Error("encryption_unavailable");
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: unbase64(iv),
      additionalData: encoder.encode(owner),
    },
    await encryptionKey(env),
    unbase64(cipher),
  );
  return new TextDecoder().decode(plain);
}
export class PublicError extends Error {
  constructor(
    public code: string,
    public message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export async function rateLimit(
  c: Context<AppEnv>,
  key: string,
  max: number,
  seconds: number,
) {
  const time = now();
  const row = await c.env.DB.prepare(
    `INSERT INTO rate_limits(key,count,reset_at) VALUES(?,1,?)
 ON CONFLICT(key) DO UPDATE SET count=CASE WHEN reset_at<=? THEN 1 ELSE count+1 END,
 reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END RETURNING count`,
  )
    .bind(key, time + seconds, time, time)
    .first<{ count: number }>();
  if (!row || row.count > max)
    throw new PublicError(
      "rate_limited",
      "Please wait a moment and try again.",
      429,
    );
}
export function isLocal(c: Context<AppEnv>) {
  const host = new URL(c.req.url).hostname;
  return (
    c.env.DEV_LOGIN === "true" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(host)
  );
}
export function cookieName(
  c: Context<AppEnv>,
  kind: "session" | "oauth_state",
) {
  return isLocal(c) ? kind : `__Host-${kind}`;
}
export function ownOrigin(c: Context<AppEnv>) {
  return isLocal(c) ? new URL(c.req.url).origin : c.env.APP_ORIGIN;
}
export function requireOrigin(c: Context<AppEnv>) {
  if (c.req.header("Origin") !== ownOrigin(c))
    throw new PublicError("origin", "Refresh this page and try again.", 403);
}
