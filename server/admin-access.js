// Server-owned allowlist. Profile data and request payloads never grant this role.
export const ADMIN_EMAIL = "uvukostya@gmail.com";
export const isAdmin = (user) =>
  !!user &&
  user.email === ADMIN_EMAIL &&
  user.email_verified === 1 &&
  !user.blocked;
