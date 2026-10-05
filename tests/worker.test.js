// @vitest-environment node
import {
  beforeAll,
  beforeEach,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import worker from "../server/index.js";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { createHash } from "node:crypto";

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(
      new URL("../migrations/0001_auth.sql", import.meta.url),
      "utf8",
    ),
  );
  return {
    raw: db,
    prepare(sql) {
      const statement = {
        args: [],
        bind(...args) {
          this.args = args;
          return this;
        },
        async first() {
          return db.prepare(sql).get(...this.args) || null;
        },
        async all() {
          return { results: db.prepare(sql).all(...this.args) };
        },
        async run() {
          const stmt = db.prepare(sql);
          if (stmt.columns().length) return { results: stmt.all(...this.args) };
          return { ...stmt.run(...this.args), results: [] };
        },
      };
      return statement;
    },
    async batch(statements) {
      db.exec("BEGIN");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        db.exec("COMMIT");
        return result;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}
let env, signingKey, jwk, mails;
const mailCode = () => mails.at(-1).textContent.match(/Код: (\d{6})/)[1];
const expireMailLimit = (email = "one@example.com") =>
  env.DB.raw
    .prepare("UPDATE rate_limits SET expires_at = 0 WHERE bucket = ?")
    .run(createHash("sha256").update(`mail:${email}`).digest("hex"));
const mailToken = () => mails.at(-1).textContent.match(/#token=([\w-]+)/)[1];
beforeAll(async () => {
  const keys = await generateKeyPair("RS256");
  signingKey = keys.privateKey;
  jwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "test-key",
    alg: "RS256",
    use: "sig",
  };
});
beforeEach(() => {
  mails = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options) => {
      expect(url).toBe("https://api.brevo.com/v3/smtp/email");
      expect(options.headers["api-key"]).toBe("test-key");
      mails.push(JSON.parse(options.body));
      return Response.json({ messageId: "test-message" }, { status: 201 });
    }),
  );
  env = {
    APP_ORIGIN: "https://pulse.example",
    DB: database(),
    BREVO_API_KEY: "test-key",
    EMAIL_FROM: "noreply@pulser.pp.ua",
  };
});
afterEach(() => {
  env.DB.raw.close();
  vi.unstubAllGlobals();
});
const password = "correct horse battery staple";
function call(
  path,
  data,
  {
    cookie = "",
    method = data === undefined ? "GET" : "POST",
    origin = env.APP_ORIGIN,
    accountId,
  } = {},
) {
  const userId = cookie
    ? env.DB.raw
        .prepare("SELECT user_id FROM sessions WHERE token_hash = ?")
        .get(
          createHash("sha256")
            .update(cookie.split(";")[0].split("=")[1])
            .digest("hex"),
        )?.user_id
    : "";
  return worker.fetch(
    new Request(`${env.APP_ORIGIN}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        Cookie: cookie,
        "CF-Connecting-IP": "192.0.2.1",
        "X-Pulse-Account": accountId ?? userId ?? "",
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
    env,
  );
}
async function register(email = "one@example.com") {
  return call("/api/auth/register", { email, password, name: "Анна" });
}
async function account(email = "one@example.com") {
  const registration = await register(email);
  const response = await call(
    "/api/auth/verify",
    { code: mailCode() },
    { cookie: registration.headers.get("set-cookie") },
  );
  expect(response.status).toBe(200);
  expireMailLimit(email);
  return response.headers.get("set-cookie").split(";")[0];
}

describe("Cloudflare account API", () => {
  it("confirms six digits and creates a secure session without a second login", async () => {
    const response = await register();
    const cookie = response.headers.get("set-cookie");
    expect(response.status).toBe(201);
    expect(cookie).toContain("__Host-pulse_verification");
    expect(cookie).not.toContain("pulse_session");
    const row = env.DB.raw.prepare("SELECT * FROM users").get();
    expect(row.email_verified).toBe(0);
    const code = mailCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(mails.at(-1).textContent).not.toContain("#token=");
    expect(
      env.DB.raw
        .prepare("SELECT token_hash FROM email_tokens WHERE kind='verify_code'")
        .get().token_hash,
    ).not.toBe(code);
    expect((await call("/api/state", undefined, { cookie })).status).toBe(401);
    expect((await call("/api/auth/verify", { code })).status).toBe(400);
    expect(
      (
        await call(
          "/api/auth/verify",
          { code: code === "000000" ? "111111" : "000000" },
          { cookie },
        )
      ).status,
    ).toBe(400);
    const verified = await call("/api/auth/verify", { code }, { cookie });
    expect(verified.status).toBe(200);
    expect(verified.headers.get("set-cookie")).toMatch(
      /__Host-pulse_session=.*HttpOnly; SameSite=Lax; Max-Age=604800; Secure/,
    );
    expect((await call("/api/auth/verify", { code }, { cookie })).status).toBe(
      400,
    );
    expect(
      await (
        await call("/api/state", undefined, {
          cookie: verified.headers.get("set-cookie"),
        })
      ).json(),
    ).toEqual({ state: {} });
  });
  it("starts empty and isolates every saved key by authenticated user", async () => {
    const a = await account(),
      b = await account("two@example.com");
    expect(
      await (await call("/api/state", undefined, { cookie: a })).json(),
    ).toEqual({ state: {} });
    expect(
      (
        await call(
          "/api/state",
          { profile: { name: "Анна", goal: 3, rest: 90 } },
          { cookie: a, method: "PUT" },
        )
      ).status,
    ).toBe(200);
    expect(
      (await (await call("/api/state", undefined, { cookie: a })).json()).state
        .profile.goal,
    ).toBe(3);
    expect(
      await (await call("/api/state", undefined, { cookie: b })).json(),
    ).toEqual({ state: {} });
    expect(
      (
        await call(
          "/api/state",
          { user_id: "other", history: [] },
          { cookie: b, method: "PUT" },
        )
      ).status,
    ).toBe(400);
    expect((await call("/api/state")).status).toBe(401);
    expect(
      (
        await call(
          "/api/state",
          { history: [] },
          { cookie: b, method: "PUT", accountId: "stale-tab-user" },
        )
      ).status,
    ).toBe(409);
  });
  it("validates all workout shapes used by the app and persists them together", async () => {
    const cookie = await account();
    const e = {
      id: "bench",
      name: "Жим",
      muscle: "Грудь",
      equipment: "Штанга",
      reps: 10,
      weight: 20,
    };
    const active = {
      id: "w1",
      name: "Full Body",
      date: "2026-10-04",
      startedAt: Date.now(),
      restEndsAt: null,
      exercises: [{ ...e, sets: [{ weight: 20, reps: 10, done: true }] }],
    };
    const data = {
      exercises: [e],
      split: Array(7).fill("Не запланировано"),
      profile: { name: "Анна", goal: 0, rest: 90 },
      plans: [{ id: "p1", date: "2026-10-05", name: "Full Body" }],
      history: [{ ...active, duration: 25, volume: 200, sets: 1 }],
      active,
    };
    expect(
      (await call("/api/state", data, { cookie, method: "PUT" })).status,
    ).toBe(200);
    expect(
      (await (await call("/api/state", undefined, { cookie })).json()).state,
    ).toEqual(data);
    expect(
      (
        await call(
          "/api/state",
          { profile: { name: "А", goal: 99, rest: 90 } },
          { cookie, method: "PUT" },
        )
      ).status,
    ).toBe(400);
  });
  it("blocks cross-origin mutations, expired sessions and logout reuse", async () => {
    const cookie = await account();
    expect(
      (
        await call(
          "/api/state",
          { history: [] },
          { cookie, method: "PUT", origin: "https://attacker.example" },
        )
      ).status,
    ).toBe(403);
    expect((await call("/api/auth/logout", {}, { cookie })).status).toBe(200);
    expect((await call("/api/state", undefined, { cookie })).status).toBe(401);
    const fresh = (
      await call("/api/auth/login", { email: "one@example.com", password })
    ).headers.get("set-cookie");
    env.DB.raw.exec("UPDATE sessions SET expires_at = 0");
    expect(
      (await call("/api/state", undefined, { cookie: fresh })).status,
    ).toBe(401);
  });
  it("resets passwords once, revokes sessions and preserves training data", async () => {
    const cookie = await account();
    await call("/api/state", { history: [] }, { cookie, method: "PUT" });
    await call("/api/auth/reset", { email: "one@example.com" });
    const token = mailToken();
    expect(
      (await call("/api/auth/update-password", { token, password: "short" }))
        .status,
    ).toBe(400);
    expect(
      (
        await call("/api/auth/update-password", {
          token,
          password: "a-new-long-password",
        })
      ).status,
    ).toBe(200);
    expect(
      (await call("/api/auth/update-password", { token, password })).status,
    ).toBe(400);
    expect((await call("/api/state", undefined, { cookie })).status).toBe(401);
    expect(
      (await call("/api/auth/login", { email: "one@example.com", password }))
        .status,
    ).toBe(401);
    expect(
      (
        await call("/api/auth/login", {
          email: "one@example.com",
          password: "a-new-long-password",
        })
      ).status,
    ).toBe(200);
    expect(
      env.DB.raw.prepare("SELECT count(*) AS n FROM fitness_state").get().n,
    ).toBe(1);
  });
  it("resends codes, replaces old codes and restores pending verification after reload", async () => {
    const registration = await register(),
      cookie = registration.headers.get("set-cookie"),
      oldCode = mailCode();
    expect(
      (await (await call("/api/auth/session", undefined, { cookie })).json())
        .verification.email,
    ).toBe("one@example.com");
    expect((await call("/api/auth/resend", {}, { cookie })).status).toBe(429);
    expireMailLimit();
    expect((await call("/api/auth/resend", {}, { cookie })).status).toBe(200);
    const code = mailCode();
    expect(
      env.DB.raw
        .prepare(
          "SELECT count(*) AS n FROM email_tokens WHERE kind='verify_code'",
        )
        .get().n,
    ).toBe(1);
    if (code !== oldCode)
      expect(
        (await call("/api/auth/verify", { code: oldCode }, { cookie })).status,
      ).toBe(400);
    expect((await call("/api/auth/verify", { code }, { cookie })).status).toBe(
      200,
    );
  });
  it("requires the original password to resume verification in another browser", async () => {
    await register();
    expireMailLimit();
    expect(
      (
        await call("/api/auth/login", {
          email: "one@example.com",
          password: "wrong",
        })
      ).status,
    ).toBe(401);
    const login = await call("/api/auth/login", {
      email: "one@example.com",
      password,
    });
    expect((await login.json()).verificationRequired).toBe(true);
    expect(
      (
        await call(
          "/api/auth/verify",
          { code: mailCode() },
          { cookie: login.headers.get("set-cookie") },
        )
      ).status,
    ).toBe(200);
  });
  it("rejects expired codes and blocks guessing across browsers and resends", async () => {
    const registration = await register(),
      cookie = registration.headers.get("set-cookie"),
      code = mailCode();
    env.DB.raw.exec(
      "UPDATE email_tokens SET expires_at=0 WHERE kind='verify_code'",
    );
    expect((await call("/api/auth/verify", { code }, { cookie })).status).toBe(
      400,
    );
    for (let i = 0; i < 4; i++)
      expect(
        (await call("/api/auth/verify", { code: "123456" }, { cookie })).status,
      ).toBe(400);
    expireMailLimit();
    const login = await call("/api/auth/login", {
      email: "one@example.com",
      password,
    });
    expect(
      (
        await call(
          "/api/auth/verify",
          { code: mailCode() },
          { cookie: login.headers.get("set-cookie") },
        )
      ).status,
    ).toBe(429);
    expect(
      env.DB.raw.prepare("SELECT email_verified FROM users").get()
        .email_verified,
    ).toBe(0);
  });
  it("keeps mail failures recoverable with a pending browser session", async () => {
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ secret: "must-not-leak" }, { status: 401 }),
      ),
    );
    const response = await register(),
      cookie = response.headers.get("set-cookie");
    expect(response.status).toBe(201);
    expect((await response.json()).emailError).toBe(
      "email_configuration_error",
    );
    expect(
      env.DB.raw
        .prepare(
          "SELECT count(*) AS n FROM email_tokens WHERE kind='verify_code'",
        )
        .get().n,
    ).toBe(0);
    vi.stubGlobal("fetch", original);
    expireMailLimit();
    await call("/api/auth/resend", {}, { cookie });
    expect(
      (await call("/api/auth/verify", { code: mailCode() }, { cookie })).status,
    ).toBe(200);
  });
  it("accepts eight-character passwords for signup and reset, rejecting seven", async () => {
    expect(
      (
        await call("/api/auth/register", {
          email: "eight@example.com",
          name: "Анна",
          password: "1234567",
        })
      ).status,
    ).toBe(400);
    const registration = await call("/api/auth/register", {
      email: "eight@example.com",
      name: "Анна",
      password: "12345678",
    });
    expect(registration.status).toBe(201);
    expect(
      (
        await call(
          "/api/auth/verify",
          { code: mailCode() },
          { cookie: registration.headers.get("set-cookie") },
        )
      ).status,
    ).toBe(200);
    expireMailLimit("eight@example.com");
    await call("/api/auth/reset", { email: "eight@example.com" });
    const token = mailToken();
    expect(
      (await call("/api/auth/update-password", { token, password: "7654321" }))
        .status,
    ).toBe(400);
    expect(
      (await call("/api/auth/update-password", { token, password: "87654321" }))
        .status,
    ).toBe(200);
    expect(
      (
        await call("/api/auth/login", {
          email: "eight@example.com",
          password: "87654321",
        })
      ).status,
    ).toBe(200);
  });
  it("does not reveal account existence in reset responses or add passwords to Google accounts", async () => {
    await account();
    env.DB.raw.exec(
      "INSERT INTO users(id,email,display_name,email_verified,created_at) VALUES('google','google@example.com','Google',1,0)",
    );
    const results = [];
    for (const email of [
      "one@example.com",
      "missing@example.com",
      "google@example.com",
    ])
      results.push(await (await call("/api/auth/reset", { email })).json());
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(mails.filter((m) => m.tags.includes("reset"))).toHaveLength(1);
    expect(
      env.DB.raw
        .prepare("SELECT password_hash FROM users WHERE id='google'")
        .get().password_hash,
    ).toBeNull();
  });
  it("cannot overwrite an existing password by registering the same email", async () => {
    await register();
    const before = env.DB.raw.prepare("SELECT password_hash FROM users").get();
    const duplicate = await call("/api/auth/register", {
      email: "one@example.com",
      password: "attacker-password",
      name: "Other",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.headers.get("set-cookie")).toBeNull();
    expect(env.DB.raw.prepare("SELECT password_hash FROM users").get()).toEqual(
      before,
    );
  });
  it("normalizes duplicate addresses and rejects invalid signup data before saving", async () => {
    for (const data of [
      { email: "bad-address", name: "Анна", password },
      { email: "one@example.com", name: " ", password },
      { email: "one@example.com", name: "Анна", password: "short" },
    ])
      expect((await call("/api/auth/register", data)).status).toBe(400);
    expect(env.DB.raw.prepare("SELECT count(*) AS n FROM users").get().n).toBe(
      0,
    );
    expect((await register(" One@Example.com ")).status).toBe(201);
    expect((await register("one@example.com")).status).toBe(409);
    expect(env.DB.raw.prepare("SELECT email FROM users").get().email).toBe(
      "one@example.com",
    );
  });
  it("rate-limits before repeated expensive login attempts", async () => {
    for (let i = 0; i < 10; i++)
      await call("/api/auth/login", {
        email: "missing@example.com",
        password: "wrong",
      });
    expect(
      (
        await call("/api/auth/login", {
          email: "missing@example.com",
          password: "wrong",
        })
      ).status,
    ).toBe(429);
  });
  it("binds OAuth state to browser and provider; rejects forged callbacks", async () => {
    env.GOOGLE_CLIENT_ID = "test-client";
    env.GOOGLE_CLIENT_SECRET = "test-secret";
    const start = await call("/api/auth/oauth/google");
    expect(start.status).toBe(302);
    const url = new URL(start.headers.get("location"));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("nonce")).toBeTruthy();
    const callback = await call(
      "/api/auth/callback/google?state=" +
        url.searchParams.get("state") +
        "&code=forged",
    );
    expect(callback.headers.get("location")).toContain("error=oauth_failed");
    expect(env.DB.raw.prepare("SELECT count(*) AS n FROM users").get().n).toBe(
      0,
    );
  });
  it("uses one-time OAuth state even when consent is cancelled", async () => {
    env.GOOGLE_CLIENT_ID = "client";
    env.GOOGLE_CLIENT_SECRET = "secret";
    const start = await call("/api/auth/oauth/google");
    const url = new URL(start.headers.get("location"));
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(start.headers.get("set-cookie")).toContain("SameSite=Lax");
    await call(
      "/api/auth/callback/google?state=" +
        url.searchParams.get("state") +
        "&error=access_denied",
      undefined,
      { cookie: start.headers.get("set-cookie").split(";")[0] },
    );
    expect(
      env.DB.raw.prepare("SELECT count(*) AS n FROM oauth_states").get().n,
    ).toBe(0);
  });
  it("disables signup when email is not configured without disabling Google", async () => {
    delete env.BREVO_API_KEY;
    env.GOOGLE_CLIENT_ID = "client";
    env.GOOGLE_CLIENT_SECRET = "secret";
    const config = await (await call("/api/auth/config")).json();
    expect(config.passwordRegistration).toBe(false);
    expect(config.providers.google).toBe(true);
    expect(config).not.toHaveProperty("emailAvailable");
    expect((await register()).status).toBe(503);
    expect(
      (await call("/api/auth/oauth/google")).headers.get("location"),
    ).toContain("accounts.google.com");
  });
});

async function googleCallback(claims = {}) {
  env.GOOGLE_CLIENT_ID = "test-client";
  env.GOOGLE_CLIENT_SECRET = "test-secret";
  const start = await call("/api/auth/oauth/google"),
    url = new URL(start.headers.get("location"));
  const jwt = await new SignJWT({
    email: "oauth@example.com",
    email_verified: true,
    name: "OAuth User",
    nonce: url.searchParams.get("nonce"),
    ...claims,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setSubject("google-subject")
    .setIssuer("https://accounts.google.com")
    .setAudience("test-client")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signingKey);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input) =>
      String(input).includes("/certs")
        ? Response.json({ keys: [jwk] })
        : Response.json({ id_token: jwt }),
    ),
  );
  return call(
    "/api/auth/callback/google?state=" +
      url.searchParams.get("state") +
      "&code=test-code",
    undefined,
    { cookie: start.headers.get("set-cookie").split(";")[0] },
  );
}
it("verifies a signed provider JWT and starts an isolated Google account", async () => {
  const response = await googleCallback();
  expect(response.headers.get("location")).toBe(env.APP_ORIGIN + "/#dashboard");
  expect(response.headers.get("set-cookie")).toContain("__Host-pulse_session=");
  expect(
    env.DB.raw.prepare("SELECT provider,subject FROM identities").get(),
  ).toMatchObject({ provider: "google", subject: "google-subject" });
  expect(
    env.DB.raw.prepare("SELECT count(*) AS n FROM fitness_state").get().n,
  ).toBe(0);
});
it("rejects a valid JWT with the wrong OAuth nonce", async () => {
  const response = await googleCallback({ nonce: "other-browser" });
  expect(response.headers.get("location")).toContain("error=oauth_failed");
  expect(env.DB.raw.prepare("SELECT count(*) AS n FROM users").get().n).toBe(0);
});
it("never silently links a Google identity by matching an existing email", async () => {
  await register("oauth@example.com");
  const response = await googleCallback();
  expect(response.headers.get("location")).toContain("error=account_exists");
  expect(
    env.DB.raw.prepare("SELECT count(*) AS n FROM identities").get().n,
  ).toBe(0);
});

it("reports missing D1 tables instead of declaring authentication ready", async () => {
  env.DB.raw.exec("DROP TABLE oauth_states");
  const config = await (await call("/api/auth/config")).json();
  expect(config.configured).toBe(false);
  expect(config.checks.database).toBe("missing_schema");
  expect(config.providers.google).toBe(false);
});
it("returns an actionable page redirect when OAuth cannot store state", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  env.GOOGLE_CLIENT_ID = "client";
  env.GOOGLE_CLIENT_SECRET = "secret";
  env.DB.raw.exec("DROP TABLE oauth_states");
  const response = await call("/api/auth/oauth/google");
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    env.APP_ORIGIN + "/?error=database_not_initialized",
  );
  expect(response.headers.get("x-request-id")).toBeTruthy();
});
it("does not require a global Buffer to begin Google authentication", async () => {
  env.GOOGLE_CLIENT_ID = "client";
  env.GOOGLE_CLIENT_SECRET = "secret";
  vi.stubGlobal("Buffer", undefined);
  const response = await call("/api/auth/oauth/google");
  expect(response.status).toBe(302);
});
it("does not expose Apple endpoints or capabilities", async () => {
  const config = await (await call("/api/auth/config")).json();
  expect(config.providers).not.toHaveProperty("apple");
  expect((await call("/api/auth/oauth/apple")).status).toBe(404);
});
it("logs safe error identifiers without request passwords or tokens", async () => {
  const logged = vi.spyOn(console, "error").mockImplementation(() => {});
  env.DB.prepare = () => {
    throw new Error("D1_ERROR: database unavailable secret-example");
  };
  const response = await call("/api/auth/login", {
    email: "private@example.com",
    password: "private-password",
  });
  expect(response.status).toBe(503);
  expect((await response.json()).error).toBe("database_unavailable");
  expect(JSON.stringify(logged.mock.calls)).not.toMatch(
    /secret-example|private-password|private@example.com/,
  );
});

it("can apply the bootstrap SQL repeatedly without losing existing accounts", async () => {
  await register();
  const migration = readFileSync(
    new URL("../migrations/0001_auth.sql", import.meta.url),
    "utf8",
  );
  env.DB.raw.exec(migration);
  env.DB.raw.exec(migration);
  expect(env.DB.raw.prepare("SELECT count(*) AS n FROM users").get().n).toBe(1);
  expect((await (await call("/api/auth/config")).json()).checks.database).toBe(
    "ready",
  );
});
it("reuses a Google account on subsequent logins without email sending", async () => {
  delete env.EMAIL;
  const first = await googleCallback();
  expect(first.status).toBe(303);
  const id = env.DB.raw.prepare("SELECT id FROM users").get().id;
  const second = await googleCallback();
  expect(second.headers.get("location")).toBe(env.APP_ORIGIN + "/#dashboard");
  expect(env.DB.raw.prepare("SELECT count(*) AS n FROM users").get().n).toBe(1);
  expect(env.DB.raw.prepare("SELECT id FROM users").get().id).toBe(id);
});

it("deletes only the authenticated account and all its related data", async () => {
  const cookie = await account(),
    other = await account("other@example.com");
  const id = env.DB.raw
    .prepare("SELECT id FROM users WHERE email=?")
    .get("one@example.com").id;
  await call(
    "/api/state",
    { history: [], profile: { name: "Анна", goal: 4, rest: 90 } },
    { cookie, method: "PUT" },
  );
  env.DB.raw
    .prepare("INSERT INTO identities VALUES('google','linked-test',?)")
    .run(id);
  await call("/api/auth/reset", { email: "one@example.com" });
  const oldToken = mailToken();
  const anotherSession = await call("/api/auth/login", {
    email: "one@example.com",
    password,
  });
  const confirmation = { confirmation: "DELETE", email: "one@example.com" };
  expect(
    (
      await call("/api/auth/account", confirmation, {
        cookie,
        method: "DELETE",
        origin: "https://evil.example",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call("/api/auth/account", confirmation, {
        cookie,
        method: "DELETE",
        accountId: "stale-user",
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await call(
        "/api/auth/account",
        { confirmation: "DELETE", email: "other@example.com" },
        { cookie, method: "DELETE" },
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        "/api/auth/account",
        { email: "one@example.com" },
        { cookie, method: "DELETE" },
      )
    ).status,
  ).toBe(400);
  expect(
    (await call("/api/auth/account", confirmation, { method: "DELETE" }))
      .status,
  ).toBe(401);
  const result = await call("/api/auth/account", confirmation, {
    cookie,
    method: "DELETE",
  });
  expect(result.status).toBe(200);
  expect(result.headers.getSetCookie()).toHaveLength(3);
  for (const table of [
    "identities",
    "sessions",
    "email_tokens",
    "fitness_state",
  ])
    expect(
      env.DB.raw
        .prepare("SELECT count(*) AS n FROM " + table + " WHERE user_id=?")
        .get(id).n,
    ).toBe(0);
  expect(
    env.DB.raw.prepare("SELECT id FROM users WHERE id=?").get(id),
  ).toBeUndefined();
  expect((await call("/api/state", undefined, { cookie })).status).toBe(401);
  expect(
    (
      await call("/api/state", undefined, {
        cookie: anotherSession.headers.get("set-cookie"),
      })
    ).status,
  ).toBe(401);
  expect(
    (
      await call("/api/auth/update-password", {
        token: oldToken,
        password: "new-password",
      })
    ).status,
  ).toBe(400);
  expect((await call("/api/state", undefined, { cookie: other })).status).toBe(
    200,
  );
  expect(
    (await call("/api/auth/login", { email: "one@example.com", password }))
      .status,
  ).toBe(401);
  expect((await register()).status).toBe(201);
  expect(
    env.DB.raw
      .prepare("SELECT id FROM users WHERE email=?")
      .get("one@example.com").id,
  ).not.toBe(id);
});
it("deletes Google accounts without requiring a password", async () => {
  const login = await googleCallback();
  const cookie = login.headers.get("set-cookie").split(";")[0];
  const user = env.DB.raw.prepare("SELECT * FROM users").get();
  expect(user.password_hash).toBeNull();
  expect(
    (
      await call(
        "/api/auth/account",
        { confirmation: "DELETE", email: user.email },
        { cookie, method: "DELETE" },
      )
    ).status,
  ).toBe(200);
  expect(
    env.DB.raw.prepare("SELECT count(*) AS n FROM identities").get().n,
  ).toBe(0);
});
