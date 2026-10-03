# Публикация PULSE: GitHub → Cloudflare

Рекомендуемый путь: загрузить исходники в GitHub и подключить репозиторий к **Cloudflare Pages**. Cloudflare будет собирать и публиковать сайт после обновлений ветки `main`.

## Если проект уже создан как Cloudflare Worker

Если в журнале запускается `wrangler deploy`, используй подготовленную конфигурацию Workers. Пересоздавать проект для исправления ошибки `ERR_PNPM_IGNORED_BUILDS` не нужно.

В обновлённой версии:

- `pnpm-workspace.yaml` явно разрешает установочные скрипты `esbuild` и `workerd`.
- Wrangler `4.147.0` зафиксирован в `package.json` и `pnpm-lock.yaml`.
- `wrangler.jsonc` задаёт публикацию папки `dist` с обработкой SPA. Автоматическая перенастройка React-приложения Wrangler больше не требуется.
- `pnpm run deploy:check` проверяет конфигурацию без публикации и без входа в аккаунт.

Загрузи обновлённые файлы из `release/github-upload-fixed/` в корень GitHub-репозитория и задай в настройках сборки **Workers**:

| Поле           | Значение                                         |
| -------------- | ------------------------------------------------ |
| Build command  | `pnpm run build`                                 |
| Deploy command | `pnpm run deploy`                                |
| Root directory | Корень репозитория, где находится `package.json` |
| `NODE_VERSION` | `24.19.0`                                        |
| `PNPM_VERSION` | `11.25.0`                                        |

Имя в `wrangler.jsonc` сейчас `pulse`: оно должно совпадать с именем Worker в Cloudflare. Если Worker называется иначе, измени поле `name` на его фактическое имя. Затем запусти повторную сборку последнего коммита. Для Workers статические файлы уже указаны в `assets.directory`; отдельное поле Build output directory не требуется.

Для этой ошибки важна строка `workerd: true`. Строка `Lockfile passes supply-chain policies` — успешная проверка, а не причина сбоя. Интерактивный `pnpm approve-builds` на Cloudflare запускать не нужно: разрешение записано в репозитории.

Для локальной проверки:

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run deploy:check
```

Команда `pnpm run deploy` выполняет реальную публикацию в Workers и предполагает, что `dist` уже собран. Для Pages используются настройки ниже; отдельная команда deploy там не нужна.

## 1. Что куда загружать

| Артефакт                         | Назначение                                                              |
| -------------------------------- | ----------------------------------------------------------------------- |
| `release/github-upload-fixed/`   | Чистая папка исходников для загрузки в корень GitHub-репозитория        |
| `release/pulse-github-fixed.zip` | Те же исходники в архиве; перед загрузкой на GitHub распаковать         |
| `release/pulse-cloudflare.zip`   | Готовый сайт для Cloudflare Pages → Direct Upload                       |
| `dist/`                          | Результат локальной сборки; содержимое также подходит для Direct Upload |

Архивы в `release/` — снимок подготовленной версии. После изменения кода заново собери `dist` и обнови архивы. Они намеренно исключены из Git вместе с `node_modules`, скриншотами и локальными файлами окружения.

## 2. Загрузка в GitHub через браузер

1. Открой свой репозиторий `ep1aga/pulse`.
2. Выбери **Add file → Upload files**; в пустом репозитории — **uploading an existing file**.
3. Открой `release/github-upload-fixed/` или распакуй `pulse-github-fixed.zip`.
4. Перетащи **содержимое** этой папки в GitHub. `package.json`, `index.html`, `src/` и `public/` должны оказаться в корне репозитория, без дополнительной папки `pulse` или `github-upload`.
5. Проверь, что загружены также `.github/workflows/build.yml`, `.node-version`, `.gitignore`, `.gitattributes`, `pnpm-lock.yaml` и `pnpm-workspace.yaml`. При необходимости включи показ скрытых файлов в проводнике.
6. Нажми **Commit changes**, выбрав ветку `main`.

GitHub не распаковывает загруженный ZIP автоматически: загружай распакованные файлы. `node_modules/` и `dist/` для этого варианта не нужны.

Вместо браузера можно выполнить в папке проекта:

```sh
git add .
git commit -m "Prepare PULSE for Cloudflare Pages"
git push -u origin main
```

В текущей локальной копии `origin` уже настроен на `https://github.com/ep1aga/pulse.git`. Если копию проекта создали в другом месте, сначала настрой репозиторий и адрес `origin`. Если ты уже загрузил файлы через браузер, для дальнейшей работы клонируй репозиторий, чтобы не создавать независимую историю коммитов.

## 3. Подключение Cloudflare Pages к GitHub

В Cloudflare открой **Workers & Pages**, создай приложение **Pages** с подключением Git-репозитория и выбери `ep1aga/pulse`. Для этого варианта команда `wrangler deploy` не нужна. Если приложение уже создано как Worker, смотри первый раздел инструкции.

Параметры сборки:

| Поле                                | Значение                                                           |
| ----------------------------------- | ------------------------------------------------------------------ |
| Production branch                   | `main`                                                             |
| Framework preset                    | `React (Vite)`; если такого пункта нет — `None` с настройками ниже |
| Build command                       | `pnpm run build`                                                   |
| Build output directory              | `dist`                                                             |
| Root directory                      | Оставить пустым, если `package.json` в корне репозитория           |
| Environment variable `NODE_VERSION` | `24.19.0`                                                          |
| Environment variable `PNPM_VERSION` | `11.25.0`                                                          |

Укажи переменные для **Production** и **Preview**, если интерфейс разделяет окружения. Версия Node также записана в `.node-version`, но явная переменная поможет, если скрытый файл пропущен при ручной загрузке. Используй актуальную среду сборки Pages v3.

Cloudflare автоматически установит зависимости. Для приложения не требуются API-ключи, база данных и серверные переменные. Нажми **Save and Deploy**. После успешной сборки Cloudflare покажет адрес `https://<имя-проекта>.pages.dev`.

Новые коммиты в `main` будут публиковаться автоматически. GitHub Actions отдельно проверяет форматирование и сборку; сам этот workflow сайт не публикует. Если используется workflow, загруженный через интерфейс, убедись, что GitHub Actions разрешены в репозитории.

### Что уже подготовлено

- `pnpm-lock.yaml` фиксирует версии библиотек.
- `packageManager`, `.node-version` и инструкции задают версии инструментов.
- `pnpm-workspace.yaml` разрешает необходимые шаги установки `esbuild` и `workerd`.
- `public/_headers` копируется в `dist`: заголовки типов содержимого и referrer policy, долгое кеширование файлов с хешами в `/assets/`.
- Навигация использует `#dashboard`, `#workout`, `#calendar` и другие hash-маршруты: обновление страницы не требует серверного роутера.
- В корне сборки нет `404.html`, поэтому сохраняется стандартная поддержка SPA в Pages.

## 4. Прямая загрузка в Cloudflare без GitHub

Для быстрой ручной публикации создай отдельный проект **Pages → Direct Upload / Upload assets**, укажи имя и перетащи **`pulse-cloudflare.zip`** или папку `dist`. В корне загружаемого архива уже находятся `index.html`, `assets/`, `images/` и `_headers`; выполнять сборку в Cloudflare не нужно.

Если планируешь автоматические обновления из GitHub, сразу используй вариант из раздела 3. Проект Pages, созданный через Direct Upload, нельзя впоследствии переключить на Git integration — для этого придётся создать новый проект. Это ограничение Cloudflare, а не приложения.

## 5. Локальная проверка перед обновлениями

Установи Node.js версии из `.node-version`, затем:

```sh
npm install --global pnpm@11.25.0
pnpm install --frozen-lockfile
pnpm run format:check
pnpm run build
pnpm run preview
```

Локальный предпросмотр: `http://localhost:4173`. Для разработки: `pnpm run dev` и `http://localhost:5173`.

После публикации проверь запуск тренировки, таймер, сохранение подходов после обновления страницы и календарь на телефоне. Выпуск сборки проверен локально; фактический деплой и GitHub Actions требуют загрузки в твои аккаунты.

## Данные пользователей

История и настройки сохраняются в `localStorage` конкретного браузера и домена. Они не входят в исходники или архив сборки. На новом домене появится новая локальная история с демонстрационными примерами; данные с `localhost` автоматически не переносятся. Аккаунты и синхронизация между устройствами не подключены.

## Официальная документация

- [React на Cloudflare Pages](https://developers.cloudflare.com/pages/framework-guides/deploy-a-react-site/)
- [Версии Node.js и pnpm в Pages](https://developers.cloudflare.com/pages/configuration/build-image/)
- [Подключение Git](https://developers.cloudflare.com/pages/get-started/git-integration/)
- [Direct Upload и его ограничения](https://developers.cloudflare.com/pages/get-started/direct-upload/)
- [Заголовки Pages](https://developers.cloudflare.com/pages/configuration/headers/)
- [Загрузка файлов в GitHub](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
- [Разрешения установочных скриптов pnpm](https://pnpm.io/settings/build#allowbuilds)
- [Автоконфигурация Wrangler](https://developers.cloudflare.com/workers/framework-guides/automatic-configuration/)
- [Параметры сборки Workers](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
