import { scrypt, timingSafeEqual } from "node:crypto";
import { Buffer } from "node:buffer";

export class HttpError extends Error {
  constructor(status, code) {
    super(code);
    this.status = status;
  }
}
export const fail = (status, code) => {
  throw new HttpError(status, code);
};
export const randomToken = () =>
  Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
export const hash = async (value) =>
  Buffer.from(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
  ).toString("hex");
const derive = (password, salt) =>
  new Promise((resolve, reject) =>
    scrypt(
      password,
      salt,
      64,
      { N: 16384, r: 8, p: 5, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    ),
  );
export async function passwordHash(password) {
  const salt = randomToken();
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}
export async function passwordMatches(password, stored) {
  const [version, salt, expected] = (stored || "").split(":");
  const actual = await derive(password, salt || "pulse-missing-account-timing");
  const valid =
    version === "scrypt-v1" && /^[a-f0-9]{128}$/.test(expected || "");
  return valid && timingSafeEqual(actual, Buffer.from(expected, "hex"));
}
export function origin(env) {
  let url;
  try {
    url = new URL(env.APP_ORIGIN);
  } catch {
    fail(503, "not_configured");
  }
  if (
    url.origin !== env.APP_ORIGIN ||
    (url.protocol !== "https:" &&
      !["localhost", "127.0.0.1"].includes(url.hostname))
  )
    fail(503, "not_configured");
  return url.origin;
}
export function cookieName(env, type = "session") {
  return `${origin(env).startsWith("https:") ? "__Host-" : ""}pulse_${type}`;
}
export function cookie(env, type, value, seconds = 604800) {
  const secure = origin(env).startsWith("https:");
  return `${cookieName(env, type)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? "; Secure" : ""}`;
}
export function readCookie(request, env, type = "session") {
  const name = cookieName(env, type);
  return (
    (request.headers.get("Cookie") || "")
      .split(";")
      .map((s) => s.trim())
      .find((s) => s.startsWith(`${name}=`))
      ?.slice(name.length + 1) || ""
  );
}
export async function requestText(request, max = 16384) {
  const reader = request.body?.getReader();
  if (!reader) fail(400, "invalid_request");
  let size = 0,
    chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      fail(413, "too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString();
}
export async function body(request, max = 16384) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    fail(415, "invalid_request");
  const raw = await requestText(request, max);
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data))
      fail(400, "invalid_request");
    return data;
  } catch {
    fail(400, "invalid_request");
  }
}
export function emailValue(value) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    fail(400, "invalid_email");
  return value.trim().toLowerCase();
}
export function checkPassword(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128)
    fail(400, "invalid_password");
}
export async function limit(env, bucket, maximum = 10, seconds = 900) {
  const now = Date.now();
  const row = await env.DB.prepare(
    "INSERT INTO rate_limits(bucket,count,expires_at) VALUES(?,1,?) ON CONFLICT(bucket) DO UPDATE SET count = CASE WHEN expires_at <= ? THEN 1 ELSE count+1 END, expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END RETURNING count",
  )
    .bind(await hash(bucket), now + seconds * 1000, now, now)
    .first();
  if (row.count > maximum) fail(429, "rate_limit");
}
export const safeUser = (user) => ({
  id: user.id,
  email: user.email,
  displayName: user.display_name,
});
export async function currentUser(request, env) {
  const token = readCookie(request, env);
  if (!token) return null;
  return env.DB.prepare(
    "SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?",
  )
    .bind(await hash(token), Date.now())
    .first();
}
export async function newSession(env, user) {
  const token = randomToken();
  await env.DB.prepare("INSERT INTO sessions VALUES(?,?,?)")
    .bind(await hash(token), user.id, Date.now() + 604800000)
    .run();
  return cookie(env, "session", token);
}
