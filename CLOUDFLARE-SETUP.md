# PULSE — регистрация без Email Sending

## 1. Обновить приложение

Загрузи содержимое release/pulse-no-email.zip в корень GitHub-репозитория (не сам ZIP). Deploy command в Cloudflare: **pnpm run deploy**. Сборка и миграции выполняются автоматически. Базу pulse-db не удаляй.

Этот вариант убирает Email Sending, подтверждение email и восстановление через письмо. Регистрация сразу создаёт аккаунт и открывает главную страницу с нулевой статистикой. Если предыдущая попытка уже сохранила аккаунт, используй **Войти** с тем же email и первоначальным паролем.

## 2. Настройки Cloudflare

| Поле                 | Значение                                    |
| -------------------- | ------------------------------------------- |
| APP_ORIGIN           | https://pulser.pp.ua (без / в конце)        |
| GOOGLE_CLIENT_ID     | Secret: Client ID веб-приложения Google     |
| GOOGLE_CLIENT_SECRET | Secret: Client Secret того же OAuth-клиента |
| DB                   | D1 binding → pulse-db                       |

EMAIL_FROM больше не нужен — его можно удалить. Привязка send_email удалена из wrangler.jsonc и не должна присутствовать после публикации. Email Sending подключать или оплачивать для этого варианта не нужно.

**Отдельно про Workers:** хеширование паролей scrypt требует больше CPU, чем лимит Workers Free в 10 мс. Для текущего серверного входа по паролю планируй Workers Paid (от $5/месяц); удаление отправки почты не отменяет вычисления при регистрации и входе. Стоимость: https://developers.cloudflare.com/workers/platform/pricing/ . Лимиты: https://developers.cloudflare.com/workers/platform/limits/ .

## 3. Google

В Google Cloud Console для OAuth-клиента типа Web application:

- Authorized JavaScript origins: https://pulser.pp.ua
- Authorized redirect URIs: https://pulser.pp.ua/api/auth/callback/google

Вход Google не зависит от почтового сервиса. Аккаунты разных способов входа автоматически не объединяются: при занятом адресе используй первоначальный способ. Это предотвращает доступ к чужим тренировкам через совпадение неподтверждённого email.

## 4. Проверить публикацию

Открой https://pulser.pp.ua/api/auth/config . Ожидаемый ответ:

```json
{
  "configured": true,
  "passwordRegistration": true,
  "providers": { "google": true },
  "checks": { "origin": "ready", "database": "ready" }
}
```

Если вместо passwordRegistration виден emailAvailable, опубликована старая версия. Проверь последний успешный deployment и обнови страницу.

1. Зарегистрируй новый аккаунт: главная должна открыться сразу, все личные показатели — 0.
2. Выйди и войди с тем же паролем.
3. Проверь Google со своим аккаунтом.
4. Старые аккаунты, ожидавшие письма, могут входить с первоначальным паролем.

Email в регистрации используется как логин, без проверки владения почтовым ящиком. Сохрани пароль: самостоятельного восстановления по почте больше нет. Для Google восстановление остаётся на стороне Google.

## 5. Если есть ошибка

- database: missing_schema — выполни миграции через pnpm run db:remote или содержимое migrations/0001_auth.sql в D1 → pulse-db → Console. Это не удаляет записи.
- origin: invalid — проверь APP_ORIGIN.
- providers.google: false — проверь оба Google Secrets.
- email_unavailable — запрос дошёл до старого Worker: новая версия не отправляет писем и не возвращает этот код.
- При другом сбое смотри DevTools → Network → запрос → Response: error и requestId. По идентификатору найди auth_request_failed в Worker Logs. Если вместо JSON пришла HTML-страница, проверь исключения и лимиты CPU Worker.

CSP исправлен в public/_headers: разрешены домены Cloudflare Web Analytics. Ошибка загрузки beacon.min.js не вызывает 503 регистрации. Изменение заголовка применяется после сборки и публикации.
