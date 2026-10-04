import { createRemoteJWKSet, jwtVerify, SignJWT, importPKCS8 } from "jose";
import {
  fail,
  randomToken,
  hash,
  cookie,
  readCookie,
  origin,
  newSession,
  emailValue,
  requestText,
} from "./security.js";

const providers = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    issuer: ["https://accounts.google.com", "accounts.google.com"],
    jwks: createRemoteJWKSet(
      new URL("https://www.googleapis.com/oauth2/v3/certs"),
    ),
  },
  apple: {
    authorize: "https://appleid.apple.com/auth/authorize",
    token: "https://appleid.apple.com/auth/token",
    issuer: "https://appleid.apple.com",
    jwks: createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys")),
  },
};
export const enabledProviders = (env) => ({
  google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  apple: Boolean(
    env.APPLE_CLIENT_ID &&
    env.APPLE_TEAM_ID &&
    env.APPLE_KEY_ID &&
    env.APPLE_PRIVATE_KEY,
  ),
});
export async function oauthStart(request, env, provider) {
  if (!enabledProviders(env)[provider]) fail(503, "provider_unavailable");
  const state = randomToken(),
    browser = randomToken(),
    nonce = randomToken(),
    verifier = randomToken();
  await env.DB.prepare("INSERT INTO oauth_states VALUES(?,?,?,?,?,?)")
    .bind(
      await hash(state),
      provider,
      nonce,
      verifier,
      await hash(browser),
      Date.now() + 600000,
    )
    .run();
  const url = new URL(providers[provider].authorize);
  const params = {
    client_id: env[`${provider.toUpperCase()}_CLIENT_ID`],
    redirect_uri: `${origin(env)}/api/auth/callback/${provider}`,
    response_type: "code",
    scope: provider === "google" ? "openid email profile" : "name email",
    state,
    nonce,
  };
  if (provider === "google") {
    params.code_challenge = Buffer.from(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ).toString("base64url");
    params.code_challenge_method = "S256";
  } else params.response_mode = "form_post";
  url.search = new URLSearchParams(params).toString();
  return new Response(null, {
    status: 302,
    headers: {
      Location: url.href,
      "Set-Cookie": cookie(env, "oauth", browser, 600),
    },
  });
}
export async function oauthCallback(request, env, provider) {
  if (!enabledProviders(env)[provider]) fail(503, "provider_unavailable");
  const input =
    request.method === "POST"
      ? new URLSearchParams(await requestText(request))
      : new URL(request.url).searchParams;
  const state = input.get("state"),
    browser = readCookie(request, env, "oauth");
  if (!state || !browser) fail(400, "oauth_failed");
  const saved = await env.DB.prepare(
    "DELETE FROM oauth_states WHERE state_hash = ? AND provider = ? AND browser_hash = ? AND expires_at > ? RETURNING *",
  )
    .bind(await hash(state), provider, await hash(browser), Date.now())
    .first();
  if (!saved || input.has("error") || !input.get("code"))
    fail(400, "oauth_failed");
  let secret = env.GOOGLE_CLIENT_SECRET;
  if (provider === "apple") {
    secret = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: env.APPLE_KEY_ID })
      .setIssuer(env.APPLE_TEAM_ID)
      .setAudience("https://appleid.apple.com")
      .setSubject(env.APPLE_CLIENT_ID)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(
        await importPKCS8(env.APPLE_PRIVATE_KEY.replace(/\\n/g, "\n"), "ES256"),
      );
  }
  const response = await fetch(providers[provider].token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.get("code"),
      client_id: env[`${provider.toUpperCase()}_CLIENT_ID`],
      client_secret: secret,
      redirect_uri: `${origin(env)}/api/auth/callback/${provider}`,
      ...(provider === "google" ? { code_verifier: saved.verifier } : {}),
    }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) fail(400, "oauth_failed");
  const tokens = await response.json();
  const { payload } = await jwtVerify(
    tokens.id_token,
    providers[provider].jwks,
    {
      issuer: providers[provider].issuer,
      audience: env[`${provider.toUpperCase()}_CLIENT_ID`],
      algorithms: ["RS256"],
      requiredClaims: ["sub", "exp", "iat", "nonce"],
    },
  );
  if (
    payload.nonce !== saved.nonce ||
    ![true, "true"].includes(payload.email_verified)
  )
    fail(400, "oauth_failed");
  let user = await env.DB.prepare(
    "SELECT users.* FROM identities JOIN users ON users.id = identities.user_id WHERE provider = ? AND subject = ?",
  )
    .bind(provider, payload.sub)
    .first();
  if (!user) {
    const email = emailValue(payload.email);
    if (
      await env.DB.prepare("SELECT id FROM users WHERE email = ?")
        .bind(email)
        .first()
    )
      fail(409, "account_exists");
    let name = payload.name || email.split("@")[0];
    if (provider === "apple" && input.get("user")) {
      try {
        const data = JSON.parse(input.get("user"));
        name =
          [data.name?.firstName, data.name?.lastName]
            .filter(Boolean)
            .join(" ") || name;
      } catch {
        /* Optional Apple display name. */
      }
    }
    user = {
      id: crypto.randomUUID(),
      email,
      display_name: String(name).slice(0, 24),
    };
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO users(id,email,display_name,email_verified,created_at) VALUES(?,?,?,1,?)",
      ).bind(user.id, user.email, user.display_name, Date.now()),
      env.DB.prepare("INSERT INTO identities VALUES(?,?,?)").bind(
        provider,
        payload.sub,
        user.id,
      ),
    ]);
  }
  const headers = new Headers({ Location: `${origin(env)}/#dashboard` });
  headers.append("Set-Cookie", await newSession(env, user));
  headers.append("Set-Cookie", cookie(env, "oauth", "", 0));
  return new Response(null, { status: 303, headers });
}
