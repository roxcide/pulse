import { HttpError, origin } from "./security.js";
import { enabledProviders } from "./oauth.js";
import { mailReady } from "./mail.js";

export function errorCode(error) {
  if (error instanceof HttpError) return error.message;
  let current = error,
    details = "";
  for (let i = 0; current && i < 5; i++, current = current.cause)
    details += " " + String(current.message || "");
  if (/no such table|no such column|has no column named/i.test(details))
    return "database_not_initialized";
  if (/D1_|SQLITE_|database is locked|database.*unavailable/i.test(details))
    return "database_unavailable";
  return "server_error";
}

export async function authConfig(env) {
  const checks = {
    origin: "ready",
    database: "ready",
    email: mailReady(env) ? "ready" : "not_configured",
  };
  try {
    origin(env);
  } catch {
    checks.origin = "invalid";
  }
  if (!env.DB) checks.database = "missing_binding";
  else {
    try {
      // LIMIT 0 checks the deployed schema without reading personal data.
      await env.DB.prepare(
        `SELECT users.id, users.email, users.display_name, users.password_hash, users.email_verified, users.created_at,
        identities.provider, identities.subject, identities.user_id, sessions.token_hash, sessions.user_id, sessions.expires_at,
        email_tokens.token_hash, email_tokens.user_id, email_tokens.kind, email_tokens.expires_at,
        oauth_states.state_hash, oauth_states.provider, oauth_states.nonce, oauth_states.verifier, oauth_states.browser_hash, oauth_states.expires_at,
        fitness_state.user_id, fitness_state.key, fitness_state.value, rate_limits.bucket, rate_limits.count, rate_limits.expires_at
        FROM users, identities, sessions, email_tokens, oauth_states, fitness_state, rate_limits LIMIT 0`,
      ).all();
    } catch (error) {
      checks.database =
        errorCode(error) === "database_not_initialized"
          ? "missing_schema"
          : "unavailable";
    }
  }
  const configured = checks.origin === "ready" && checks.database === "ready";
  return {
    configured,
    passwordRegistration: configured && mailReady(env),
    passwordRecovery: configured && mailReady(env),
    providers: { google: configured && enabledProviders(env).google },
    checks,
  };
}
