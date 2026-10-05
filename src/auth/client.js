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
    if (/^[a-f0-9-]{36}$/i.test(result.requestId || ""))
      error.requestId = result.requestId;
    throw error;
  }
  return result;
}
export function authError(error) {
  const message =
    {
      database_not_initialized:
        "Сервис входа ещё не подготовлен. Владелец сайта должен применить миграции базы данных.",
      database_unavailable:
        "Сервис хранения данных временно недоступен. Попробуй позже.",
      server_error:
        "Не удалось завершить запрос на сервере. Попробуй снова; если ошибка повторяется, сообщи владельцу сайта.",
      account_changed:
        "В другом окне открыт другой аккаунт. Вернись в исходный аккаунт и повтори сохранение.",
      email_not_confirmed:
        "Подтверди почту перед входом. Можно запросить новое письмо ниже.",
      email_not_configured: "Отправка писем ещё не настроена. Попробуй позже.",
      email_configuration_error:
        "Письмо не отправлено. Владелец сайта должен проверить настройки Brevo. Повторить отправку можно через форму входа.",
      email_unavailable:
        "Не удалось отправить письмо. Попробуй запросить его ещё раз через минуту.",
      invalid_token:
        "Ссылка недействительна или устарела. Запроси новое письмо.",
      invalid_credentials: "Неверный email или пароль.",
      deletion_not_confirmed:
        "Для подтверждения удаления введи email своего аккаунта.",
      invalid_code:
        "Код неверный или срок его действия истёк. Проверь 6 цифр или запроси новый код.",
      verification_expired:
        "Подтверждение в этом браузере истекло. Введи email и пароль через «Войти», чтобы получить новый код.",
      invalid_email: "Проверь адрес email.",
      invalid_name: "Укажи имя до 24 символов.",
      invalid_password: "Пароль должен содержать от 8 до 128 символов.",
      rate_limit: "Слишком много попыток. Попробуй позже.",
      not_configured: "Вход пока не настроен. Попробуй позже.",
      provider_unavailable: "Этот способ входа пока недоступен.",
      account_exists:
        "Этот email уже связан с аккаунтом. Используй первоначальный способ входа.",
      google_configuration_error:
        "Google отклонил настройки входа. Сообщи владельцу сайта: нужно проверить OAuth-клиент и адрес возврата.",
      oauth_failed: "Не удалось завершить вход. Попробуй ещё раз.",
      unauthorized: "Сессия истекла. Войди снова.",
      wrong_origin: "Адрес сайта не совпадает с настройками сервера.",
      invalid_state: "Не удалось сохранить данные. Проверь значения и повтори.",
    }[error?.message] ||
    "Не удалось подключиться. Проверь соединение и попробуй снова.";
  return error?.requestId
    ? `${message} Код обращения: ${error.requestId}`
    : message;
}
