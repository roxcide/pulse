export async function api(path, data, method = "POST", accountId) {
  const response = await fetch(path, {
    method: data === undefined ? "GET" : method,
    credentials: "same-origin",
    signal: AbortSignal.timeout(20000),
    headers: {
      ...(data === undefined ? {} : { "Content-Type": "application/json" }),
      ...(accountId ? { "X-Pulse-Account": accountId } : {}),
    },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error("connection_error");
  }
  if (!response.ok) {
    const error = new Error(result.error || "server_error");
    error.status = response.status;
    throw error;
  }
  return result;
}
export function authError(error) {
  return (
    {
      account_changed:
        "В другом окне открыт другой аккаунт. Вернись в исходный аккаунт и повтори сохранение.",
      invalid_credentials: "Неверный email или пароль.",
      email_not_confirmed:
        "Сначала подтверди email. Письмо можно отправить повторно.",
      invalid_email: "Проверь адрес email.",
      invalid_name: "Укажи имя до 24 символов.",
      invalid_password: "Пароль должен содержать от 10 до 128 символов.",
      invalid_token:
        "Ссылка недействительна или уже использована. Запроси новую.",
      rate_limit: "Слишком много попыток. Попробуй позже.",
      email_unavailable: "Отправка писем пока недоступна. Попробуй позже.",
      not_configured: "Вход пока не настроен. Попробуй позже.",
      provider_unavailable: "Этот способ входа пока недоступен.",
      account_exists:
        "Этот email уже связан с аккаунтом. Используй первоначальный способ входа.",
      oauth_failed: "Не удалось завершить вход. Попробуй ещё раз.",
      unauthorized: "Сессия истекла. Войди снова.",
      wrong_origin: "Адрес сайта не совпадает с настройками сервера.",
      invalid_state: "Не удалось сохранить данные. Проверь значения и повтори.",
    }[error?.message] ||
    "Не удалось подключиться. Проверь соединение и попробуй снова."
  );
}
