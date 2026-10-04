import { fail, hash, randomToken, origin } from "./security.js";

export const mailReady = (env) =>
  Boolean(
    env.BREVO_API_KEY?.trim() &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env.EMAIL_FROM || ""),
  );
export function requireMail(env) {
  if (!mailReady(env)) fail(503, "email_not_configured");
}
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

export async function sendAuthMail(env, user, kind) {
  requireMail(env);
  const token = randomToken(),
    tokenHash = await hash(token);
  const verify = kind === "verify";
  const title = verify ? "Подтверди почту в PULSE" : "Сброс пароля PULSE";
  const action = verify ? "Подтвердить почту" : "Создать новый пароль";
  const duration = verify ? "24 часа" : "30 минут";
  const url = `${origin(env)}/?auth=${verify ? "verify" : "recovery"}#token=${token}`;
  const instruction = verify
    ? "Введи пароль, указанный при регистрации, чтобы подтвердить свой аккаунт."
    : "Задай новый пароль. После сохранения все прежние сеансы входа завершатся.";
  await env.DB.prepare("INSERT INTO email_tokens VALUES(?,?,?,?)")
    .bind(tokenHash, user.id, kind, Date.now() + (verify ? 86400000 : 1800000))
    .run();
  try {
    let response;
    try {
      response = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        signal: AbortSignal.timeout(10000),
        headers: {
          "api-key": env.BREVO_API_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          sender: { name: "PULSE", email: env.EMAIL_FROM },
          to: [{ email: user.email }],
          subject: title,
          tags: ["pulse-auth", kind],
          textContent: `${title}\n\n${instruction}\n\n${url}\n\nСсылка действует ${duration} и используется один раз. Если ты не отправлял запрос, просто проигнорируй письмо.`,
          htmlContent: `<!doctype html><html lang="ru"><body style="margin:0;background:#111410;color:#edf1e7;font-family:Arial,sans-serif"><div style="max-width:520px;margin:32px auto;padding:32px"><p style="color:#cbf578;font-weight:bold">PULSE.</p><h1 style="font-size:28px">${title}</h1><p style="line-height:1.6">${instruction}</p><p style="margin:32px 0"><a href="${escape(url)}" style="display:inline-block;background:#cbf578;color:#17200e;padding:16px 24px;border-radius:8px;text-decoration:none;font-weight:bold">${action}</a></p><p>Ссылка действует ${duration} и используется один раз.</p><p style="color:#adb5a5;line-height:1.6">Если ты не отправлял запрос, просто проигнорируй письмо.</p><p style="font-size:12px;word-break:break-all">Не работает кнопка? Открой ссылку:<br><a style="color:#cbf578" href="${escape(url)}">${escape(url)}</a></p></div></body></html>`,
        }),
      });
    } catch {
      fail(503, "email_unavailable");
    }
    if (!response.ok)
      fail(
        503,
        [400, 401, 403].includes(response.status)
          ? "email_configuration_error"
          : "email_unavailable",
      );
  } catch (error) {
    await env.DB.prepare("DELETE FROM email_tokens WHERE token_hash = ?")
      .bind(tokenHash)
      .run();
    throw error;
  }
}
