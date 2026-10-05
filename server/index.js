import {
  HttpError,
  fail,
  body,
  origin,
  hash,
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
import { oauthStart, oauthCallback } from "./oauth.js";
import { authConfig, errorCode } from "./diagnostics.js";
import { validateState } from "./state.js";
import { requireMail } from "./mail.js";
import { emailAuth } from "./email-auth.js";
import {
  pendingVerification,
  startVerification,
  verificationRoute,
} from "./verification.js";

const json = (data, status = 200, headers = {}) =>
  Response.json(data, { status, headers });
async function route(request, env) {
  const path = new URL(request.url).pathname,
    method = request.method;
  if (path === "/api/auth/config" && method === "GET")
    return json(await authConfig(env));
  if (!env.DB) fail(503, "not_configured");
  const appOrigin = origin(env);
  if (new URL(request.url).origin !== appOrigin) fail(403, "wrong_origin");
  const callback = path.match(/^\/api\/auth\/callback\/(google)$/);
  if (
    !["GET", "HEAD"].includes(method) &&
    request.headers.get("Origin") !== appOrigin
  )
    fail(403, "wrong_origin");
  if (callback && method === "GET") {
    if (Number(request.headers.get("content-length") || 0) > 16384)
      fail(413, "too_large");
    return oauthCallback(request, env, callback[1]);
  }
  const oauth = path.match(/^\/api\/auth\/oauth\/(google)$/);
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  if (oauth && method === "GET") {
    await limit(env, `oauth:${ip}`, 30);
    return oauthStart(request, env, oauth[1]);
  }
  if (path === "/api/auth/session" && method === "GET") {
    const user = await currentUser(request, env);
    const pending = !user ? await pendingVerification(request, env) : null;
    return json({
      user: user ? safeUser(user) : null,
      ...(pending ? { verification: { email: pending.user.email } } : {}),
    });
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
  const verification = await verificationRoute(request, env, path, data);
  if (verification) return verification;
  const emailResult = await emailAuth(path, data, env);
  if (emailResult) return json(emailResult);
  if (path === "/api/auth/register") {
    requireMail(env);
    const email = emailValue(data.email);
    checkPassword(data.password);
    if (
      typeof data.name !== "string" ||
      !data.name.trim() ||
      data.name.trim().length > 24
    )
      fail(400, "invalid_name");
    await limit(env, `register:${email}`, 5, 3600);
    const existing = await env.DB.prepare(
      "SELECT id FROM users WHERE email = ?",
    )
      .bind(email)
      .first();
    if (existing) fail(409, "account_exists");
    const user = await env.DB.prepare(
      "INSERT INTO users(id,email,display_name,password_hash,created_at) VALUES(?,?,?,?,?) ON CONFLICT(email) DO NOTHING RETURNING *",
    )
      .bind(
        crypto.randomUUID(),
        email,
        data.name.trim(),
        await passwordHash(data.password),
        Date.now(),
      )
      .first();
    if (!user) fail(409, "account_exists");
    return startVerification(env, user, 201);
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
    if (!user.email_verified) return startVerification(env, user);
    return json({ user: safeUser(user) }, 200, {
      "Set-Cookie": await newSession(env, user),
    });
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
      const code = errorCode(error),
        requestId = crypto.randomUUID(),
        path = new URL(request.url).pathname;
      if (!(error instanceof HttpError) || error.status >= 500)
        console.error(
          JSON.stringify({
            event: "auth_request_failed",
            requestId,
            path,
            code,
            type: error?.name || "Error",
          }),
        );
      let redirectOrigin;
      try {
        redirectOrigin = origin(env);
      } catch {
        /* No trusted origin available. */
      }
      if (
        redirectOrigin &&
        /^\/api\/auth\/(oauth|callback)\/google$/.test(path)
      ) {
        response = new Response(null, {
          status: 303,
          headers: {
            Location: redirectOrigin + "/?error=" + encodeURIComponent(code),
            "Set-Cookie": cookie(env, "oauth", "", 0),
          },
        });
      } else
        response = json(
          { error: code, requestId },
          error instanceof HttpError
            ? error.status
            : code.startsWith("database_")
              ? 503
              : 500,
        );
      response.headers.set("X-Request-Id", requestId);
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
