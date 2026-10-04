import {
  HttpError,
  fail,
  body,
  origin,
  hash,
  randomToken,
  cookie,
  readCookie,
  currentUser,
  safeUser,
  newSession,
  emailValue,
  checkPassword,
  passwordHash,
  passwordMatches,
  limit,
} from "./security.js";
import { enabledProviders, oauthStart, oauthCallback } from "./oauth.js";
import { validateState } from "./state.js";

const json = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers });
const emailReady = (env) => Boolean(env.EMAIL?.send && env.EMAIL_FROM);
async function sendLink(env, user, kind) {
  if (!emailReady(env)) fail(503, "email_unavailable");
  const token = randomToken();
  await env.DB.prepare("INSERT INTO email_tokens VALUES(?,?,?,?)")
    .bind(
      await hash(token),
      user.id,
      kind,
      Date.now() + (kind === "verify" ? 86400000 : 1800000),
    )
    .run();
  const link = `${origin(env)}/?auth=${kind === "verify" ? "verify" : "recovery"}#token=${token}`;
  try {
    await env.EMAIL.send({
      from: env.EMAIL_FROM,
      to: user.email,
      subject:
        kind === "verify"
          ? "PULSE — подтверди email"
          : "PULSE — восстановление доступа",
      text: `${kind === "verify" ? "Подтверди email для регистрации в PULSE. Ссылка действует 24 часа." : "Задай новый пароль PULSE. Ссылка действует 30 минут."}\n\n${link}\n\nЕсли ты не отправлял этот запрос, проигнорируй письмо.`,
    });
  } catch {
    await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash = ?")
      .bind(await hash(token))
      .run();
    fail(503, "email_unavailable");
  }
}
async function route(request, env) {
  const path = new URL(request.url).pathname,
    method = request.method;
  if (path === "/api/auth/config" && method === "GET") {
    let configured = Boolean(env.DB);
    try {
      origin(env);
    } catch {
      configured = false;
    }
    return json({
      configured,
      emailAvailable: configured && emailReady(env),
      providers: configured
        ? enabledProviders(env)
        : { google: false, apple: false },
    });
  }
  if (!env.DB) fail(503, "not_configured");
  const appOrigin = origin(env);
  if (new URL(request.url).origin !== appOrigin) fail(403, "wrong_origin");
  const callback = path.match(/^\/api\/auth\/callback\/(google|apple)$/);
  if (
    !["GET", "HEAD"].includes(method) &&
    !callback &&
    request.headers.get("Origin") !== appOrigin
  )
    fail(403, "wrong_origin");
  if (callback && (method === "GET" || method === "POST")) {
    if (Number(request.headers.get("content-length") || 0) > 16384)
      fail(413, "too_large");
    try {
      return await oauthCallback(request, env, callback[1]);
    } catch (error) {
      const code = error instanceof HttpError ? error.message : "oauth_failed";
      return new Response(null, {
        status: 303,
        headers: {
          Location: `${appOrigin}/?error=${encodeURIComponent(code)}`,
          "Set-Cookie": cookie(env, "oauth", "", 0),
        },
      });
    }
  }
  const oauth = path.match(/^\/api\/auth\/oauth\/(google|apple)$/);
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (oauth && method === "GET") {
    await limit(env, `oauth:${ip}`, 30);
    return oauthStart(request, env, oauth[1]);
  }
  if (path === "/api/auth/session" && method === "GET") {
    const user = await currentUser(request, env);
    return json({ user: user ? safeUser(user) : null });
  }
  if (path === "/api/auth/logout" && method === "POST") {
    await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?")
      .bind(await hash(readCookie(request, env)))
      .run();
    return json({ ok: true }, 200, {
      "Set-Cookie": cookie(env, "session", "", 0),
    });
  }
  if (path === "/api/state") {
    const user = await currentUser(request, env);
    if (!user) fail(401, "unauthorized");
    if (request.headers.get("X-Pulse-Account") !== user.id)
      fail(409, "account_changed");
    if (method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT key,value FROM fitness_state WHERE user_id = ?",
      )
        .bind(user.id)
        .all();
      return json({
        state: Object.fromEntries(
          rows.results.map((row) => [row.key, JSON.parse(row.value)]),
        ),
      });
    }
    if (method === "PUT") {
      await limit(env, `state:${user.id}`, 240, 60);
      const entries = validateState(await body(request, 2 * 1024 * 1024));
      await env.DB.batch(
        entries.map(([key, value]) =>
          env.DB.prepare(
            "INSERT INTO fitness_state VALUES(?,?,?) ON CONFLICT(user_id,key) DO UPDATE SET value = excluded.value",
          ).bind(user.id, key, JSON.stringify(value)),
        ),
      );
      return json({ ok: true });
    }
  }
  if (method !== "POST") fail(404, "not_found");
  const data = await body(request);
  await limit(env, `auth:${ip}`, 30);
  if (
    path === "/api/auth/register" ||
    path === "/api/auth/resend" ||
    path === "/api/auth/reset"
  ) {
    if (!emailReady(env)) fail(503, "email_unavailable");
    const email = emailValue(data.email);
    await limit(env, `mail:${email}`, 5, 3600);
    let user = await env.DB.prepare("SELECT * FROM users WHERE email = ?")
      .bind(email)
      .first();
    if (path.endsWith("/register")) {
      checkPassword(data.password);
      if (
        typeof data.name !== "string" ||
        !data.name.trim() ||
        data.name.trim().length > 24
      )
        fail(400, "invalid_name");
      if (!user) {
        user = {
          id: crypto.randomUUID(),
          email,
          display_name: data.name.trim(),
        };
        await env.DB.prepare(
          "INSERT INTO users(id,email,display_name,password_hash,created_at) VALUES(?,?,?,?,?)",
        )
          .bind(
            user.id,
            email,
            user.display_name,
            await passwordHash(data.password),
            Date.now(),
          )
          .run();
      }
    }
    if (path.endsWith("/reset")) {
      if (user?.email_verified && user.password_hash)
        await sendLink(env, user, "reset");
    } else if (user && !user.email_verified)
      await sendLink(env, user, "verify");
    return json({ ok: true });
  }
  if (path === "/api/auth/login") {
    const email = emailValue(data.email);
    if (typeof data.password !== "string" || data.password.length > 128)
      fail(400, "invalid_credentials");
    await limit(env, `login:${email}`, 10);
    const user = await env.DB.prepare("SELECT * FROM users WHERE email = ?")
      .bind(email)
      .first();
    if (!(await passwordMatches(data.password, user?.password_hash)))
      fail(401, "invalid_credentials");
    if (!user.email_verified) fail(403, "email_not_confirmed");
    return json({ user: safeUser(user) }, 200, {
      "Set-Cookie": await newSession(env, user),
    });
  }
  if (path === "/api/auth/verify" || path === "/api/auth/update-password") {
    if (typeof data.token !== "string" || data.token.length > 200)
      fail(400, "invalid_token");
    const kind = path.endsWith("/verify") ? "verify" : "reset";
    let password;
    if (kind === "reset") {
      checkPassword(data.password);
      password = await passwordHash(data.password);
    }
    const token = await env.DB.prepare(
      "DELETE FROM email_tokens WHERE token_hash = ? AND kind = ? AND expires_at > ? RETURNING *",
    )
      .bind(await hash(data.token), kind, Date.now())
      .first();
    if (!token) fail(400, "invalid_token");
    if (kind === "verify")
      await env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?")
        .bind(token.user_id)
        .run();
    else
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(
          password,
          token.user_id,
        ),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(
          token.user_id,
        ),
        env.DB.prepare("DELETE FROM email_tokens WHERE user_id = ?").bind(
          token.user_id,
        ),
      ]);
    return json({ ok: true });
  }
  fail(404, "not_found");
}
export default {
  async fetch(request, env) {
    if (!new URL(request.url).pathname.startsWith("/api/"))
      return env.ASSETS.fetch(request);
    let response;
    try {
      response = await route(request, env);
    } catch (error) {
      response = json(
        { error: error instanceof HttpError ? error.message : "server_error" },
        error instanceof HttpError ? error.status : 500,
      );
    }
    response.headers.set("Cache-Control", "no-store");
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  },
  async scheduled(event, env) {
    await env.DB.batch(
      ["sessions", "email_tokens", "oauth_states", "rate_limits"].map((table) =>
        env.DB.prepare(`DELETE FROM ${table} WHERE expires_at <= ?`).bind(
          Date.now(),
        ),
      ),
    );
  },
};
