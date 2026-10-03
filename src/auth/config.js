export function validateAuthConfig(env) {
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();
  if (key.startsWith('sb_secret_')) throw new Error('Use a Supabase publishable key, never a secret key, in VITE_SUPABASE_PUBLISHABLE_KEY.');
  if (key && !key.startsWith('sb_publishable_')) {
    // Legacy anon JWTs are supported; service_role JWTs must never reach a bundle.
    try {
      const payload = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (payload.role !== 'anon') throw new Error();
    } catch { throw new Error('VITE_SUPABASE_PUBLISHABLE_KEY must be a publishable key or legacy anon key.'); }
  }
  if (url) {
    let parsed;
    try { parsed = new URL(url); } catch { throw new Error('VITE_SUPABASE_URL must be a valid project URL.'); }
    if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && ['localhost','127.0.0.1'].includes(parsed.hostname))) throw new Error('Supabase must use HTTPS.');
  }
  return {url,key,configured:Boolean(url && key)};
}
