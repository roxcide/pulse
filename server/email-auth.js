import {
  fail,
  hash,
  checkPassword,
  passwordHash,
  passwordMatches,
  emailValue,
  limit,
} from "./security.js";
import { requireMail, sendAuthMail } from "./mail.js";

export async function emailAuth(path, data, env) {
  if (["/api/auth/reset", "/api/auth/resend"].includes(path)) {
    const email = emailValue(data.email);
    requireMail(env);
    await limit(env, `mail:${email}`, 1, 60);
    await limit(env, `mail-hour:${email}`, 5, 3600);
    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?")
      .bind(email)
      .first();
    const kind = path.endsWith("reset") ? "reset" : "verify";
    if (user?.password_hash && (kind === "reset" || !user.email_verified)) {
      // The public acknowledgement must not reveal whether this email exists.
      try {
        await sendAuthMail(env, user, kind);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "auth_mail_failed",
            code: [
              "email_configuration_error",
              "email_unavailable",
              "email_not_configured",
            ].includes(error.message)
              ? error.message
              : "email_unavailable",
          }),
        );
      }
    }
    return { ok: true };
  }
  if (!["/api/auth/verify", "/api/auth/update-password"].includes(path))
    return null;
  if (typeof data.token !== "string" || !/^[\w-]{43}$/.test(data.token))
    fail(400, "invalid_token");
  const kind = path.endsWith("verify") ? "verify" : "reset";
  const tokenHash = await hash(data.token),
    now = Date.now();
  const user = await env.DB.prepare(
    "SELECT users.* FROM users JOIN email_tokens ON users.id = email_tokens.user_id WHERE token_hash = ? AND kind = ? AND expires_at > ?",
  )
    .bind(tokenHash, kind, now)
    .first();
  if (!user?.password_hash) fail(400, "invalid_token");
  await limit(env, `email-token:${tokenHash}`, 10);
  checkPassword(data.password);
  if (
    kind === "verify" &&
    !(await passwordMatches(data.password, user.password_hash))
  )
    fail(401, "invalid_credentials");
  const nextHash =
    kind === "reset" ? await passwordHash(data.password) : user.password_hash;
  // A single transaction consumes the token and revokes all previous credentials.
  const guard =
    "SELECT user_id FROM email_tokens WHERE token_hash = ? AND kind = ? AND expires_at > ?";
  const result = await env.DB.batch([
    env.DB.prepare(
      `UPDATE users SET email_verified = 1, password_hash = ? WHERE id = ? AND password_hash = ? AND id IN (${guard}) RETURNING id`,
    ).bind(nextHash, user.id, user.password_hash, tokenHash, kind, now),
    env.DB.prepare(`DELETE FROM sessions WHERE user_id IN (${guard})`).bind(
      tokenHash,
      kind,
      now,
    ),
    env.DB.prepare(`DELETE FROM email_tokens WHERE user_id IN (${guard})`).bind(
      tokenHash,
      kind,
      now,
    ),
  ]);
  if (!result[0].results.length) fail(400, "invalid_token");
  return { ok: true };
}
