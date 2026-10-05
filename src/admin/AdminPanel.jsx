import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Search,
  ShieldCheck,
  Users,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Save,
  X,
} from "lucide-react";
import { api, authError } from "../auth/client";
import { useAuth } from "../auth/AuthProvider";
import { restoreAccountState } from "../state/defaults";
import { validState } from "../../shared/state";
import { Modal } from "../components";
import "./admin.css";

const sections = {
  history: "История тренировок",
  split: "Расписание на неделю",
  plans: "Запланированные тренировки",
  exercises: "Личные упражнения",
  active: "Текущая тренировка",
};
const date = (value) => new Date(value).toLocaleString("ru-RU");
const hints = {
  history: "Массив тренировок. Пустой список: [].",
  split: "Семь названий дней тренировки: с понедельника по воскресенье.",
  plans: "Массив планов с id, name и date в формате ГГГГ-ММ-ДД.",
  exercises: "Массив упражнений с id, name, muscle, equipment, weight и reps.",
  active:
    "Объект текущей тренировки. Значение null означает, что тренировка не начата.",
};

function Editor({ snapshot, adminId, onSaved, onDeleted, onClose, onReload }) {
  const original = restoreAccountState(snapshot.user, snapshot.state);
  const [name, setName] = useState(original.profile.name),
    [email, setEmail] = useState(snapshot.user.email);
  const [verified, setVerified] = useState(snapshot.user.emailVerified),
    [blocked, setBlocked] = useState(snapshot.user.blocked);
  const [password, setPassword] = useState(""),
    [goal, setGoal] = useState(original.profile.goal),
    [rest, setRest] = useState(original.profile.rest);
  const [section, setSection] = useState("history");
  const [drafts, setDrafts] = useState(() =>
    Object.fromEntries(
      Object.keys(sections).map((key) => [
        key,
        JSON.stringify(original[key], null, 2),
      ]),
    ),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false),
    [confirmation, setConfirmation] = useState(""),
    [dirty, setDirty] = useState(false);
  const protectedAccount =
    snapshot.user.isAdmin || snapshot.user.id === adminId;
  const emailChanged = email.trim().toLowerCase() !== snapshot.user.email;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const closeHandler = useRef(null);
  closeHandler.current = () => {
    if (
      !busy &&
      (!dirty || window.confirm("Закрыть без сохранения изменений?"))
    )
      onClose();
  };
  const close = useCallback(() => closeHandler.current(), []);
  async function save(event) {
    event.preventDefault();
    setError("");
    let state;
    try {
      state = Object.fromEntries(
        Object.entries(drafts).map(([key, value]) => [key, JSON.parse(value)]),
      );
    } catch {
      setError(
        "Проверь JSON: используй двойные кавычки и убери лишние запятые.",
      );
      return;
    }
    state.profile = {
      ...original.profile,
      name: name.trim(),
      goal: Number(goal),
      rest: Number(rest),
    };
    if (!validState(state)) {
      setError(
        "Данные не соответствуют формату. Проверь поля, числа и семь дней расписания.",
      );
      return;
    }
    setBusy(true);
    try {
      const next = await api(
        `/api/admin/users/${snapshot.user.id}`,
        {
          revision: snapshot.user.revision,
          account: {
            displayName: name.trim(),
            email,
            emailVerified: verified,
            blocked,
            ...(password ? { password } : {}),
          },
          state,
        },
        "PUT",
        adminId,
      );
      setDirty(false);
      setPassword("");
      onSaved(next);
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `/api/admin/users/${snapshot.user.id}`,
        {
          revision: snapshot.user.revision,
          email: confirmation,
          confirmation: "DELETE",
        },
        "DELETE",
        adminId,
      );
      setDirty(false);
      onDeleted();
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        deleting ? "Удалить аккаунт навсегда?" : "Управление пользователем"
      }
      onClose={close}
      busy={busy}
    >
      <div className="admin-editor">
        <p className="admin-account-email">{snapshot.user.email}</p>
        <p className="form-hint">
          ID: {snapshot.user.id}
          <br />
          Регистрация: {date(snapshot.user.createdAt)}
          <br />
          Вход:{" "}
          {[snapshot.user.hasPassword && "пароль", ...snapshot.providers]
            .filter(Boolean)
            .join(", ") || "не настроен"}
        </p>
        {protectedAccount && (
          <p className="admin-notice">
            Аккаунт владельца защищён от изменения и удаления в панели. Личные
            настройки доступны в обычном меню сайта.
          </p>
        )}
        {error && (
          <div role="alert" className="auth-feedback error">
            {error}
            <button
              type="button"
              className="text-button"
              disabled={busy}
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm(
                    "Загрузить данные заново? Несохранённые изменения будут потеряны.",
                  )
                )
                  onReload();
              }}
            >
              Загрузить свежие данные
            </button>
          </div>
        )}
        {deleting ? (
          <form onSubmit={remove}>
            <p className="admin-notice danger">
              Аккаунт, история, расписание и все личные данные будут удалены
              безвозвратно. Восстановить их через сайт невозможно. Пользователь
              будет выведен со всех устройств.
            </p>
            <label className="form-field">
              Email удаляемого аккаунта
              <input
                type="email"
                required
                autoComplete="off"
                value={confirmation}
                disabled={busy}
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </label>
            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={busy}
                onClick={() => setDeleting(false)}
              >
                Отмена
              </button>
              <button
                className="danger-button"
                disabled={
                  busy ||
                  confirmation.trim().toLowerCase() !== snapshot.user.email
                }
              >
                <Trash2 size={17} />
                {busy ? "Удаляем…" : "Удалить навсегда"}
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={save} onChange={() => setDirty(true)}>
            <fieldset disabled={busy || protectedAccount}>
              <div className="form-columns">
                <label className="form-field">
                  Имя пользователя
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    required
                    maxLength={24}
                  />
                </label>
                <label className="form-field">
                  Email пользователя
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setVerified(false);
                    }}
                    required
                    maxLength={254}
                  />
                </label>
              </div>
              <div className="admin-switches">
                <label>
                  <input
                    type="checkbox"
                    checked={verified && !emailChanged}
                    disabled={emailChanged}
                    onChange={(event) => setVerified(event.target.checked)}
                  />
                  Email подтверждён
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={blocked}
                    onChange={(event) => setBlocked(event.target.checked)}
                  />
                  Заблокировать вход
                </label>
              </div>
              {emailChanged && (
                <p className="admin-notice">
                  Новый email потребуется подтвердить кодом. Привязка Google
                  будет отключена. Если раньше вход был только через Google,
                  задай новый пароль.
                </p>
              )}
              <label className="form-field">
                Новый пароль
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  minLength={8}
                  maxLength={128}
                  autoComplete="new-password"
                  placeholder="Оставь пустым, чтобы не менять"
                  required={emailChanged && !snapshot.user.hasPassword}
                />
              </label>
              <div className="form-columns">
                <label className="form-field">
                  Тренировочных дней в неделю
                  <input
                    type="number"
                    value={goal}
                    min={0}
                    max={7}
                    step={1}
                    required
                    onChange={(event) => setGoal(event.target.value)}
                  />
                </label>
                <label className="form-field">
                  Отдых между подходами, сек
                  <input
                    type="number"
                    value={rest}
                    min={0}
                    max={600}
                    step={1}
                    required
                    onChange={(event) => setRest(event.target.value)}
                  />
                </label>
              </div>
              <details className="admin-data-editor">
                <summary>Все тренировочные данные · JSON</summary>
                <label className="form-field">
                  Раздел данных
                  <select
                    value={section}
                    onChange={(event) => setSection(event.target.value)}
                  >
                    {Object.entries(sections).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="form-hint">
                  {hints[section]} Изменяй структуру внимательно: этот раздел
                  заменит сохранённые данные пользователя.
                </p>
                <label className="form-field">
                  {sections[section]}
                  <textarea
                    spellCheck={false}
                    rows={15}
                    value={drafts[section]}
                    onChange={(event) =>
                      setDrafts((previous) => ({
                        ...previous,
                        [section]: event.target.value,
                      }))
                    }
                  />
                </label>
              </details>
              <p className="form-hint">
                Пользователь останется в аккаунте. Активные сессии завершатся
                только при блокировке, установке нового пароля или удалении
                аккаунта. Текущий пароль никогда не отображается.
              </p>
              <button
                type="submit"
                className="primary-button full-width"
                disabled={!dirty || busy || protectedAccount}
              >
                <Save size={17} />
                {busy ? "Сохраняем…" : "Сохранить пользователя"}
              </button>
              <div className="account-danger-zone">
                <button
                  type="button"
                  className="danger-button full-width"
                  onClick={() => {
                    setDeleting(true);
                    setError("");
                  }}
                >
                  <Trash2 size={17} />
                  Удалить пользователя
                </button>
              </div>
            </fieldset>
          </form>
        )}
      </div>
    </Modal>
  );
}

export default function AdminPanel() {
  const { user } = useAuth();
  const [query, setQuery] = useState(""),
    [search, setSearch] = useState(""),
    [page, setPage] = useState(0),
    [reload, setReload] = useState(0);
  const [result, setResult] = useState(null),
    [audit, setAudit] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [snapshot, setSnapshot] = useState(null),
    [opening, setOpening] = useState(false),
    [notice, setNotice] = useState("");
  const openingId = useRef(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError("");
    Promise.all([
      api(
        `/api/admin/users?q=${encodeURIComponent(search)}&page=${page}`,
        undefined,
        "GET",
        user.id,
      ),
      api("/api/admin/audit", undefined, "GET", user.id),
    ])
      .then(([list, log]) => {
        if (alive) {
          setResult(list);
          setAudit(log.entries);
        }
      })
      .catch((err) => {
        if (alive) {
          setError(authError(err));
          setResult(null);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [user.id, search, page, reload]);
  useEffect(
    () => () => {
      openingId.current++;
    },
    [],
  );
  async function open(id) {
    const requestId = ++openingId.current;
    setOpening(true);
    setError("");
    try {
      const next = await api(
        `/api/admin/users/${id}`,
        undefined,
        "GET",
        user.id,
      );
      if (requestId === openingId.current) setSnapshot(next);
    } catch (err) {
      if (requestId === openingId.current) setError(authError(err));
    } finally {
      if (requestId === openingId.current) setOpening(false);
    }
  }
  return (
    <div className="admin-panel">
      <div className="admin-banner">
        <ShieldCheck size={26} />
        <div>
          <h2>Панель администратора</h2>
          <p>Пользователи, доступ и тренировочные данные.</p>
        </div>
        <span>
          <Users size={18} />
          {result?.total ?? "—"}
        </span>
      </div>
      <form
        className="admin-toolbar"
        onSubmit={(event) => {
          event.preventDefault();
          setPage(0);
          setSearch(query.trim());
          setReload((v) => v + 1);
        }}
      >
        <label className="search-field">
          <Search size={18} />
          <input
            aria-label="Поиск пользователей"
            placeholder="Email или имя пользователя"
            value={query}
            maxLength={254}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <button className="primary-button" disabled={loading}>
          Найти
        </button>
        <button
          type="button"
          className="secondary-button"
          aria-label="Обновить пользователей"
          disabled={loading}
          onClick={() => setReload((v) => v + 1)}
        >
          <RefreshCw size={18} />
        </button>
      </form>
      {error && (
        <p role="alert" className="auth-feedback error">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="admin-notice">
          {notice}
          <button
            className="icon-button"
            aria-label="Закрыть сообщение администратора"
            onClick={() => setNotice("")}
          >
            <X size={16} />
          </button>
        </p>
      )}
      {loading ? (
        <p role="status" className="form-hint">
          Загружаем пользователей…
        </p>
      ) : (
        result && (
          <>
            <div className="admin-users">
              {result.users.map((account) => (
                <button
                  key={account.id}
                  className="admin-user"
                  disabled={opening}
                  onClick={() => open(account.id)}
                >
                  <span className="admin-user-avatar">
                    {account.displayName.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="admin-user-info">
                    <strong>{account.displayName}</strong>
                    <span>{account.email}</span>
                    <small>{date(account.createdAt)}</small>
                  </span>
                  <span
                    className={`admin-status ${account.blocked ? "blocked" : ""}`}
                  >
                    {account.isAdmin
                      ? "Администратор"
                      : account.blocked
                        ? "Заблокирован"
                        : account.emailVerified
                          ? "Подтверждён"
                          : "Ждёт подтверждения"}
                  </span>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
            {!result.users.length && (
              <div className="empty-state">
                <Users size={28} />
                <h3>Пользователи не найдены</h3>
                <p>Попробуй другой email или имя.</p>
              </div>
            )}
            <div className="admin-pagination">
              <button
                className="secondary-button"
                disabled={page === 0 || loading}
                onClick={() => setPage((v) => v - 1)}
              >
                <ChevronLeft size={18} />
                Назад
              </button>
              <span>
                Страница {page + 1} из{" "}
                {Math.max(1, Math.ceil(result.total / result.pageSize))}
              </span>
              <button
                className="secondary-button"
                disabled={
                  (page + 1) * result.pageSize >= result.total || loading
                }
                onClick={() => setPage((v) => v + 1)}
              >
                Далее
                <ChevronRight size={18} />
              </button>
            </div>
          </>
        )
      )}
      <details className="admin-audit">
        <summary>Журнал действий · последние 50</summary>
        {audit.length ? (
          <ul>
            {audit.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {entry.action === "delete_account"
                    ? "Удаление аккаунта"
                    : "Изменение аккаунта"}
                </strong>
                <span>{date(entry.created_at)}</span>
                <code>{entry.target_id}</code>
              </li>
            ))}
          </ul>
        ) : (
          <p className="form-hint">Действий пока нет.</p>
        )}
      </details>
      {snapshot && (
        <Editor
          key={`${snapshot.user.id}:${snapshot.user.revision}`}
          snapshot={snapshot}
          adminId={user.id}
          onClose={() => setSnapshot(null)}
          onReload={() => open(snapshot.user.id)}
          onSaved={(next) => {
            setSnapshot(next);
            setNotice(
              next.sessionsRevoked
                ? "Пользователь обновлён. Его предыдущие сессии завершены."
                : "Пользователь обновлён. Вход в аккаунт сохранён.",
            );
            setReload((v) => v + 1);
          }}
          onDeleted={() => {
            setSnapshot(null);
            setNotice("Аккаунт удалён безвозвратно.");
            setPage(0);
            setReload((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
