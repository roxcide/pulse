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
          return db.prepare(sql).run(...this.args);
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
let env, letters, signingKey, jwk;
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
  letters = [];
  env = {
    APP_ORIGIN: "https://pulse.example",
    DB: database(),
    EMAIL_FROM: "hello@pulse.example",
    EMAIL: { send: async (mail) => letters.push(mail) },
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
function token() {
  return letters.at(-1).text.match(/#token=([\w-]+)/)[1];
}
async function register(email = "one@example.com") {
  return call("/api/auth/register", { email, password, name: "Анна" });
}
async function account(email = "one@example.com") {
  await register(email);
  await call("/api/auth/verify", { token: token() });
  const response = await call("/api/auth/login", { email, password });
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie").split(";")[0];
}

describe("Cloudflare account API", () => {
  it("requires verified email, hashes passwords, creates secure session and rejects token replay", async () => {
    expect((await register()).status).toBe(200);
    const row = env.DB.raw.prepare("SELECT * FROM users").get();
    expect(row.password_hash).toMatch(/^scrypt-v1:/);
    expect(row.password_hash).not.toContain(password);
    expect(
      (await call("/api/auth/login", { email: row.email, password })).status,
    ).toBe(403);
    const verification = token();
    expect(
      (await call("/api/auth/verify", { token: verification })).status,
    ).toBe(200);
    expect(
      (await call("/api/auth/verify", { token: verification })).status,
    ).toBe(400);
    expect(
      (
        await call("/api/auth/login", {
          email: row.email,
          password: "incorrect",
        })
      ).status,
    ).toBe(401);
    const response = await call("/api/auth/login", {
      email: row.email,
      password,
    });
    expect(response.headers.get("set-cookie")).toMatch(
      /__Host-pulse_session=.*HttpOnly; SameSite=Lax; Max-Age=604800; Secure/,
    );
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await response.json()).user.email).toBe(row.email);
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
  it("resets passwords with single-use tokens and revokes all sessions", async () => {
    const cookie = await account();
    expect(
      (await call("/api/auth/reset", { email: "one@example.com" })).status,
    ).toBe(200);
    const reset = token(),
      next = "a different strong password";
    expect(
      (
        await call("/api/auth/update-password", {
          token: reset,
          password: next,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await call("/api/auth/update-password", {
          token: reset,
          password: next,
        })
      ).status,
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
          password: next,
        })
      ).status,
    ).toBe(200);
  });
  it("rejects expired email links and does not disclose unknown reset accounts", async () => {
    await register();
    const expired = token();
    env.DB.raw.exec("UPDATE email_tokens SET expires_at=0");
    expect((await call("/api/auth/verify", { token: expired })).status).toBe(
      400,
    );
    expect(
      await (
        await call("/api/auth/reset", { email: "unknown@example.com" })
      ).json(),
    ).toEqual({ ok: true });
    expect(letters).toHaveLength(1);
  });
  it("cannot overwrite an existing password by registering the same email", async () => {
    await register();
    const before = env.DB.raw.prepare("SELECT password_hash FROM users").get();
    await call("/api/auth/register", {
      email: "one@example.com",
      password: "attacker-password",
      name: "Other",
    });
    expect(env.DB.raw.prepare("SELECT password_hash FROM users").get()).toEqual(
      before,
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
    env.APPLE_CLIENT_ID = "service";
    env.APPLE_TEAM_ID = "team";
    env.APPLE_KEY_ID = "key";
    env.APPLE_PRIVATE_KEY = "not-used";
    const start = await call("/api/auth/oauth/apple");
    const url = new URL(start.headers.get("location"));
    expect(url.searchParams.get("response_mode")).toBe("form_post");
    expect(start.headers.get("set-cookie")).toContain("SameSite=None");
    await call(
      "/api/auth/callback/apple?state=" +
        url.searchParams.get("state") +
        "&error=access_denied",
      undefined,
      { cookie: start.headers.get("set-cookie").split(";")[0] },
    );
    expect(
      env.DB.raw.prepare("SELECT count(*) AS n FROM oauth_states").get().n,
    ).toBe(0);
  });
  it("disables unavailable providers and email without pretending to create an account", async () => {
    delete env.EMAIL;
    expect((await (await call("/api/auth/config")).json()).emailAvailable).toBe(
      false,
    );
    expect((await register()).status).toBe(503);
    expect((await call("/api/auth/oauth/google")).status).toBe(503);
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
