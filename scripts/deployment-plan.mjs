// Check required tables and columns before replacing the Worker, without reading user data.
export const schemaCheck = `
SELECT users.id, users.email, users.display_name, users.password_hash,
users.email_verified, users.created_at, users.blocked, users.revision,
identities.provider, identities.subject, identities.user_id,
sessions.token_hash, sessions.user_id, sessions.expires_at,
email_tokens.token_hash, email_tokens.user_id, email_tokens.kind, email_tokens.expires_at,
oauth_states.state_hash, oauth_states.provider, oauth_states.nonce,
oauth_states.verifier, oauth_states.browser_hash, oauth_states.expires_at,
fitness_state.user_id, fitness_state.key, fitness_state.value,
rate_limits.bucket, rate_limits.count, rate_limits.expires_at,
admin_audit.id, admin_audit.actor_id, admin_audit.target_id, admin_audit.action, admin_audit.created_at
FROM users, identities, sessions, email_tokens, oauth_states, fitness_state, rate_limits, admin_audit
LIMIT 0;
`;

export function deploySteps(dryRun = false) {
  if (dryRun) return [["deploy", "--dry-run"]];
  return [
    ["d1", "migrations", "apply", "DB", "--remote"],
    ["d1", "execute", "DB", "--remote", "--command", schemaCheck, "--yes"],
    ["deploy"],
  ];
}

export function runDeployment(run, dryRun = false) {
  for (const command of deploySteps(dryRun)) run(command);
}
