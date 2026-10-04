# Что исправить в Cloudflare для pulser.pp.ua

Причина ошибки Google подтверждена: у `pulse-db` указано **Number of tables: 0**. Привязка базы существует, но схема приложения ещё не создана.

## 1. Создать таблицы — без удаления базы

Самый быстрый способ через сайт Cloudflare:

1. Открой **Storage & databases → D1 → pulse-db → Console**.
2. Открой в проекте файл `migrations/0001_auth.sql`.
3. Скопируй его содержимое в SQL Console и выполни. Если Console принимает только одну команду, выполни SQL-операторы по очереди, разделяя по `;`.
4. Должны появиться семь таблиц приложения: `users`, `identities`, `sessions`, `email_tokens`, `oauth_states`, `fitness_state`, `rate_limits`.

SQL использует `IF NOT EXISTS`: повторное выполнение не удаляет данные. Не удаляй базу и не меняй её на новую. Если таблицы уже существуют с другой структурой, обратись к диагностике вместо удаления данных.

Альтернатива из терминала проекта: `pnpm run db:remote`. Она дополнительно ведёт журнал миграций D1.

## 2. Загрузить обновление и исправить команду деплоя

Загрузи **содержимое** `release/pulse-google-email-fix.zip` в GitHub с заменой файлов.

В настройках сборки Worker:

- **Deploy command: `pnpm run deploy`**.
- Build command можно оставить пустым.
- Дождись строки `PULSE: Worker published and D1 migrations applied.`.

Прямой `wrangler deploy` обходит наш шаг создания таблиц. В архиве обязательно должны быть папки `scripts` и `migrations`. Токен сборки должен иметь разрешение **Account → D1 → Edit** на аккаунт этой базы.

## 3. Проверить настройки Google

Значения на твоём скриншоте имеют правильные имена:

| Поле                   | Значение                                        |
| ---------------------- | ----------------------------------------------- |
| `APP_ORIGIN`           | `https://pulser.pp.ua`                          |
| `EMAIL_FROM`           | `noreply@pulser.pp.ua`                          |
| `GOOGLE_CLIENT_ID`     | Client ID веб-приложения Google, как Secret     |
| `GOOGLE_CLIENT_SECRET` | Client Secret того же OAuth-клиента, как Secret |
| D1 binding             | `DB` → `pulse-db`                               |

Содержимое Google Secrets по скриншоту проверить нельзя. В Google Cloud Console у клиента типа **Web application** укажи:

- Authorized JavaScript origins: `https://pulser.pp.ua`.
- Authorized redirect URIs: `https://pulser.pp.ua/api/auth/callback/google`.

Адрес `/api/auth/oauth/google` — начало входа, его не нужно указывать как redirect URI.

Если Google-приложение в режиме Testing и требует тестовых пользователей, добавь свой аккаунт в Audience → Test users. Для публикации следуй требованиям Google Auth Platform. Проверку возврата с настоящим Google-аккаунтом выполни после загрузки обновления; тестовые ключи из локальной проверки в production не используются.

При первом успешном входе Google создаёт аккаунт с нулевой статистикой. Apple больше не требуется.

## 4. Включить регистрацию по email

На скриншоте есть `EMAIL_FROM`, но нет **Send Email binding с именем `EMAIL`**. Переменная задаёт адрес отправителя; сам сервис отправки она не подключает.

1. Открой **Compute → Email Service → Email Sending → Onboard Domain**.
2. Выбери `pulser.pp.ua` и заверши настройку DNS/подтверждения отправителя, которую покажет Cloudflare. Нужен именно Email Sending; простая переадресация Email Routing этого не заменяет.
3. Привязка `"send_email": [{"name":"EMAIL"}]` уже записана в обновлённом `wrangler.jsonc`. После деплоя в Bindings должны присутствовать **DB** и **EMAIL**.
4. Оставь `EMAIL_FROM=noreply@pulser.pp.ua` и дождись готовности домена к отправке.
5. Зарегистрируйся со своим email, открой письмо, нажми подтверждение и войди с паролем.

Если в аккаунте ещё нет доступа к Email Sending, регистрация с подтверждением письма не сможет завершиться; Google работает независимо от отправки писем. Статус `emailAvailable: true` означает наличие binding и адреса отправителя, но фактическая доставка требует проверенного домена и доступного лимита отправки.

Документация: https://developers.cloudflare.com/email-service/get-started/send-emails/

## 5. Проверить результат

Открой `https://pulser.pp.ua/api/auth/config`. После настройки ожидается:

```json
{
  "configured": true,
  "emailAvailable": true,
  "providers": { "google": true },
  "checks": { "origin": "ready", "database": "ready", "email": "ready" }
}
```

- `database: missing_schema` → таблицы/колонки ещё не созданы.
- `email: missing_binding` → не опубликована привязка `EMAIL`.
- `email: missing_sender` → отсутствует `EMAIL_FROM`.
- `providers.google: false` при готовой базе → проверь оба Google Secrets.
- `origin: invalid` → проверь `APP_ORIGIN`, включая отсутствие `/` в конце.

Если Google по-прежнему сообщает ошибку, в Worker Logs появится событие `auth_request_failed` с идентификатором запроса и безопасным кодом. Пароли, OAuth-коды и значения секретов туда не записываются.
