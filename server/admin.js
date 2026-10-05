import { ADMIN_EMAIL, isAdmin } from "./admin-access.js";
import {
  body,
  checkPassword,
  currentUser,
  emailValue,
  fail,
  hash,
  limit,
  passwordHash,
  readCookie,
} from "./security.js";
import { validateState } from "./state.js";

const columns =
  "id,email,display_name,email_verified,created_at,blocked,revision,(password_hash IS NOT NULL) AS has_password";
const accountInfo = (row) => ({
  id: row.id,
  email: row.email,
  displayName: row.display_name,
  emailVerified: !!row.email_verified,
  blocked: !!row.blocked,
  createdAt: row.created_at,
  revision: row.revision,
  hasPassword: !!row.has_password,
  isAdmin: isAdmin(row),
});

async function details(env, id) {
  const [users, values, providers] = await env.DB.batch([
    env.DB.prepare(`SELECT ${columns} FROM users WHERE id = ?`).bind(id),
    env.DB.prepare(
      "SELECT key,value FROM fitness_state WHERE user_id = ?",
    ).bind(id),
    env.DB.prepare("SELECT provider FROM identities WHERE user_id = ?").bind(
      id,
    ),
  ]);
  if (!users.results.length) fail(404, "user_not_found");
  return {
    user: accountInfo(users.results[0]),
    state: Object.fromEntries(
      values.results.map((row) => [row.key, JSON.parse(row.value)]),
    ),
    providers: providers.results.map((row) => row.provider),
  };
}

export async function adminRoute(request, env) {
  const actor = await currentUser(request, env);
  if (!actor) fail(401, "unauthorized");
  if (!isAdmin(actor)) fail(403, "admin_required");
  if (request.headers.get("X-Pulse-Account") !== actor.id)
    fail(409, "account_changed");
  await limit(env, `admin:${actor.id}`, 120, 60);
  const url = new URL(request.url),
    method = request.method;
  if (url.pathname === "/api/admin/users" && method === "GET") {
    const query = (url.searchParams.get("q") || "").trim();
    const page = Number(url.searchParams.get("page") || 0);
    if (
      query.length > 254 ||
      !Number.isSafeInteger(page) ||
      page < 0 ||
      page > 100000
    )
      fail(400, "invalid_request");
    const where =
      "WHERE instr(lower(email), lower(?)) > 0 OR instr(lower(display_name), lower(?)) > 0";
    const [count, rows] = await env.DB.batch([
      env.DB.prepare(`SELECT COUNT(*) AS total FROM users ${where}`).bind(
        query,
        query,
      ),
      env.DB.prepare(
        `SELECT ${columns} FROM users ${where} ORDER BY created_at DESC,id LIMIT 25 OFFSET ?`,
      ).bind(query, query, page * 25),
    ]);
    return Response.json({
      users: rows.results.map(accountInfo),
      total: count.results[0].total,
      page,
      pageSize: 25,
    });
  }
  if (url.pathname === "/api/admin/audit" && method === "GET") {
    const rows = await env.DB.prepare(
      "SELECT id,actor_id,target_id,action,created_at FROM admin_audit ORDER BY created_at DESC,id DESC LIMIT 50",
    ).all();
    return Response.json({ entries: rows.results });
  }
  const match = url.pathname.match(
    /^\/api\/admin\/users\/([a-zA-Z0-9-]{1,100})$/,
  );
  if (!match) fail(404, "not_found");
  const id = match[1];
  if (method === "GET") return Response.json(await details(env, id));
  if (!["PUT", "DELETE"].includes(method)) fail(405, "invalid_request");
  const data = await body(request, 2 * 1024 * 1024);
  if (!Number.isSafeInteger(data.revision) || data.revision < 0)
    fail(400, "invalid_request");
  const target = await env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(id)
    .first();
  if (!target) fail(404, "user_not_found");
  if (target.email === ADMIN_EMAIL || target.id === actor.id)
    fail(403, "admin_protected");
  if (target.revision !== data.revision) fail(409, "admin_conflict");
  const sessionHash = await hash(readCookie(request, env));
  // A failed comparison violates NOT NULL, rolling back the entire D1 batch.
  // Recheck the admin session inside the same transaction as the mutation.
  const guard = env.DB.prepare(
    `UPDATE users SET revision = CASE WHEN revision = ? AND EXISTS (
    SELECT 1 FROM sessions JOIN users AS owner ON owner.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND owner.id = ?
      AND owner.email = ? AND owner.email_verified = 1 AND owner.blocked = 0
    ) THEN revision + 1 ELSE NULL END WHERE id = ? RETURNING id`,
  ).bind(data.revision, sessionHash, Date.now(), actor.id, ADMIN_EMAIL, id);
  const statements = [guard];
  let action;
  let sessionsRevoked = false;
  if (method === "DELETE") {
    if (
      data.confirmation !== "DELETE" ||
      emailValue(data.email) !== target.email
    )
      fail(400, "deletion_not_confirmed");
    statements.push(env.DB.prepare("DELETE FROM users WHERE id = ?").bind(id));
    action = "delete_account";
  } else {
    const account = data.account;
    if (
      !account ||
      Object.keys(account).some(
        (key) =>
          ![
            "displayName",
            "email",
            "emailVerified",
            "blocked",
            "password",
          ].includes(key),
      )
    )
      fail(400, "invalid_request");
    if (
      typeof account.displayName !== "string" ||
      !account.displayName.trim() ||
      account.displayName.trim().length > 24
    )
      fail(400, "invalid_name");
    const email = emailValue(account.email),
      emailChanged = email !== target.email;
    if (email === ADMIN_EMAIL) fail(403, "admin_protected");
    if (
      typeof account.blocked !== "boolean" ||
      typeof account.emailVerified !== "boolean"
    )
      fail(400, "invalid_request");
    let nextHash = target.password_hash;
    const passwordChanged =
      account.password !== undefined && account.password !== "";
    if (passwordChanged) {
      checkPassword(account.password);
      nextHash = await passwordHash(account.password);
    }
    if (emailChanged && !nextHash)
      fail(400, "password_required_for_email_change");
    const entries = validateState(data.state);
    const requiredKeys = [
      "profile",
      "history",
      "plans",
      "split",
      "exercises",
      "active",
    ];
    if (requiredKeys.some((key) => !Object.hasOwn(data.state, key)))
      fail(400, "invalid_state");
    if (
      !data.state.profile ||
      data.state.profile.name !== account.displayName.trim()
    )
      fail(400, "invalid_state");
    statements.push(
      env.DB.prepare(
        "UPDATE users SET email=?,display_name=?,email_verified=?,blocked=?,password_hash=? WHERE id=?",
      ).bind(
        email,
        account.displayName.trim(),
        emailChanged ? 0 : Number(account.emailVerified),
        Number(account.blocked),
        nextHash,
        id,
      ),
    );
    if (emailChanged)
      statements.push(
        env.DB.prepare("DELETE FROM identities WHERE user_id=?").bind(id),
      );
    statements.push(
      env.DB.prepare("DELETE FROM fitness_state WHERE user_id=?").bind(id),
    );
    for (const [key, value] of entries)
      statements.push(
        env.DB.prepare("INSERT INTO fitness_state VALUES(?,?,?)").bind(
          id,
          key,
          JSON.stringify(value),
        ),
      );
    sessionsRevoked = account.blocked || passwordChanged;
    if (sessionsRevoked)
      statements.push(
        env.DB.prepare("DELETE FROM sessions WHERE user_id=?").bind(id),
      );
    // Keep pending verification/reset links for unrelated profile or workout edits.
    if (
      sessionsRevoked ||
      emailChanged ||
      account.emailVerified !== !!target.email_verified
    )
      statements.push(
        env.DB.prepare("DELETE FROM email_tokens WHERE user_id=?").bind(id),
      );
    action = "update_account";
  }
  statements.push(
    env.DB.prepare("INSERT INTO admin_audit VALUES(?,?,?,?,?)").bind(
      crypto.randomUUID(),
      actor.id,
      id,
      action,
      Date.now(),
    ),
  );
  try {
    const result = await env.DB.batch(statements);
    if (!result[0].results.length) fail(404, "user_not_found");
  } catch (error) {
    const detail =
      String(error.message) + " " + String(error.cause?.message || "");
    if (/NOT NULL constraint failed: users.revision/i.test(detail))
      fail(409, "admin_conflict");
    if (/UNIQUE constraint failed: users.email/i.test(detail))
      fail(409, "account_exists");
    throw error;
  }
  return method === "DELETE"
    ? Response.json({ ok: true })
    : Response.json({ ...(await details(env, id)), sessionsRevoked });
}
