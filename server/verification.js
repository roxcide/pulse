import { randomInt } from "node:crypto";
import {
  fail,
  hash,
  randomToken,
  readCookie,
  cookie,
  safeUser,
  limit,
} from "./security.js";
import { requireMail, sendVerificationMail } from "./mail.js";

const CODE_TTL = 600000;
export async function pendingVerification(request, env) {
  const challenge = readCookie(request, env, "verification");
  if (!/^[\w-]{43}$/.test(challenge)) return null;
  const user = await env.DB.prepare(
    "SELECT users.* FROM users JOIN email_tokens ON users.id = email_tokens.user_id WHERE token_hash = ? AND kind = 'pending' AND expires_at > ? AND email_verified = 0",
  )
    .bind(await hash(challenge), Date.now())
    .first();
  return user ? { user, challenge } : null;
}

async function sendCode(env, user, challenge) {
  requireMail(env);
  await limit(env, `mail:${user.email}`, 1, 60);
  await limit(env, `mail-hour:${user.email}`, 5, 3600);
  const code = String(randomInt(0, 1000000)).padStart(6, "0");
  const codeHash = await hash(`${user.id}:${challenge}:${code}`);
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM email_tokens WHERE user_id = ? AND kind = 'verify_code'",
    ).bind(user.id),
    env.DB.prepare("INSERT INTO email_tokens VALUES(?,?,?,?)").bind(
      codeHash,
      user.id,
      "verify_code",
      Date.now() + CODE_TTL,
    ),
  ]);
  try {
    await sendVerificationMail(env, user, code);
  } catch (error) {
    await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash = ?")
      .bind(codeHash)
      .run();
    throw error;
  }
}

export async function startVerification(env, user, status = 200) {
  const challenge = randomToken();
  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM email_tokens WHERE user_id = ? AND kind IN ('pending','verify_code','verify')",
    ).bind(user.id),
    env.DB.prepare("INSERT INTO email_tokens VALUES(?,?,?,?)").bind(
      await hash(challenge),
      user.id,
      "pending",
      Date.now() + 86400000,
    ),
  ]);
  let emailError;
  try {
    await sendCode(env, user, challenge);
  } catch (error) {
    emailError = [
      "rate_limit",
      "email_not_configured",
      "email_configuration_error",
      "email_unavailable",
    ].includes(error.message)
      ? error.message
      : "email_unavailable";
    console.error(
      JSON.stringify({ event: "verification_mail_failed", code: emailError }),
    );
  }
  return Response.json(
    {
      verificationRequired: true,
      email: user.email,
      emailSent: !emailError,
      ...(emailError ? { emailError } : {}),
    },
    {
      status,
      headers: { "Set-Cookie": cookie(env, "verification", challenge, 86400) },
    },
  );
}

export async function verificationRoute(request, env, path, data) {
  if (!["/api/auth/verify", "/api/auth/resend"].includes(path)) return null;
  const pending = await pendingVerification(request, env);
  if (!pending) fail(400, "verification_expired");
  const { user, challenge } = pending;
  if (path.endsWith("resend")) {
    await sendCode(env, user, challenge);
    return Response.json({ ok: true });
  }
  if (typeof data.code !== "string" || !/^\d{6}$/.test(data.code))
    fail(400, "invalid_code");
  // Limit by account, not by the supplied code, browser or IP. Resending cannot reset attempts.
  await limit(env, `verify-attempts:${user.id}`, 5, 600);
  const codeHash = await hash(`${user.id}:${challenge}:${data.code}`),
    now = Date.now();
  const guard =
    "SELECT user_id FROM email_tokens WHERE token_hash = ? AND kind = 'verify_code' AND expires_at > ? AND user_id IN (SELECT user_id FROM email_tokens WHERE token_hash = ? AND kind = 'pending' AND expires_at > ?)";
  const args = [codeHash, now, await hash(challenge), now];
  const session = randomToken();
  // Consume the code, verify the account and issue its session in one transaction.
  const results = await env.DB.batch([
    env.DB.prepare(`DELETE FROM sessions WHERE user_id IN (${guard})`).bind(
      ...args,
    ),
    env.DB.prepare(
      `INSERT INTO sessions SELECT ?, id, ? FROM users WHERE email_verified = 0 AND id IN (${guard}) RETURNING user_id`,
    ).bind(await hash(session), now + 604800000, ...args),
    env.DB.prepare(
      `UPDATE users SET email_verified = 1 WHERE id IN (${guard})`,
    ).bind(...args),
    env.DB.prepare(`DELETE FROM email_tokens WHERE user_id IN (${guard})`).bind(
      ...args,
    ),
  ]);
  if (!results[1].results.length) fail(400, "invalid_code");
  const response = Response.json({ user: safeUser(user) });
  response.headers.append("Set-Cookie", cookie(env, "session", session));
  response.headers.append("Set-Cookie", cookie(env, "verification", "", 0));
  return response;
}
