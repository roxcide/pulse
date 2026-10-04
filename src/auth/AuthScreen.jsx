import React, { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Check,
  LoaderCircle,
} from "lucide-react";
import { api, authError } from "./client";
import { useAuth } from "./AuthProvider";

function ProviderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.59 4.59 0 0 1-2 3.01v2.5h3.23c1.89-1.74 2.99-4.3 2.99-7.34Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.96-.9 6.61-2.43l-3.23-2.5c-.9.6-2.05.97-3.38.97-2.6 0-4.81-1.76-5.6-4.12H3.06v2.59A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.4 13.92a6 6 0 0 1 0-3.84V7.49H3.06a10 10 0 0 0 0 9.02l3.34-2.59Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.96c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59A5.99 5.99 0 0 1 12 5.96Z"
      />
    </svg>
  );
}

export default function AuthScreen({ initialError = "" }) {
  const { config, reloadSession } = useAuth();
  const [mode, setMode] = useState("login");
  const [busy, setBusy] = useState(false),
    [visible, setVisible] = useState(false);
  const [error, setError] = useState(initialError),
    [email, setEmail] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("error");
    if (code) setError(authError(new Error(code)));
    if (["verify", "recovery"].includes(params.get("auth"))) {
      setError(
        "Ссылки из писем больше не используются. Войди с паролем своего аккаунта.",
      );
      window.history.replaceState({}, "", location.pathname);
    }
  }, []);
  const changeMode = (next) => {
    setMode(next);
    setError("");
    setVisible(false);
    window.history.replaceState({}, "", location.pathname);
  };
  async function submit(event) {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    if (mode === "register" && password !== form.get("confirm")) {
      setError("Пароли не совпадают.");
      return;
    }
    setBusy(true);
    try {
      await api(
        mode === "register" ? "/api/auth/register" : "/api/auth/login",
        {
          email,
          password,
          ...(mode === "register" ? { name: form.get("name") } : {}),
        },
      );
      window.history.replaceState({}, "", location.pathname + "#dashboard");
      await reloadSession();
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }
  const titles = { login: "С возвращением.", register: "Твой первый шаг." };
  const subtitles = {
    login: "Войди, чтобы продолжить свой путь к цели.",
    register: "Создай аккаунт. Твоя история начинается с тебя.",
  };
  const allowed =
    config.configured && (mode === "login" || config.passwordRegistration);
  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="auth-brand">
          <span className="brand-symbol">
            <Activity size={25} />
          </span>
          PULSE<span>.</span>
        </div>
        <div className="auth-story-content">
          <span className="hero-eyebrow">
            <span className="live-dot" />
            ТВОЙ РИТМ. ТВОЙ ПРОГРЕСС.
          </span>
          <h1>
            Большие перемены
            <br />
            начинаются
            <br />
            <span>с первого шага.</span>
          </h1>
          <p>
            Планируй тренировки, отмечай победы
            <br />и становись сильнее в своём темпе.
          </p>
          <div className="auth-story-features">
            <span>
              <Check size={15} />
              Твой план
            </span>
            <span>
              <Check size={15} />
              Твоя история
            </span>
            <span>
              <Check size={15} />
              Твой прогресс
            </span>
          </div>
        </div>
        <span className="auth-story-footer">SHOW UP. LEVEL UP.</span>
      </section>
      <main className="auth-main">
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <Activity size={23} />
            PULSE.
          </div>
          <span className="eyebrow">ТВОЁ ЛИЧНОЕ ПРОСТРАНСТВО</span>
          <h2>{titles[mode]}</h2>
          <p className="auth-subtitle">{subtitles[mode]}</p>
          {!config.configured && (
            <div className="auth-notice" role="status">
              {config.checks?.database === "missing_schema"
                ? "Сервис входа ещё не подготовлен. Владелец сайта должен завершить настройку базы."
                : "Не удалось подключить сервис входа. Обнови страницу или попробуй позже."}
            </div>
          )}
          {error && (
            <div className="auth-feedback error" role="alert">
              {error}
            </div>
          )}
          {["login", "register"].includes(mode) && (
            <>
              <div className="oauth-buttons">
                <button
                  className="oauth-button"
                  disabled={busy || !config.providers.google}
                  onClick={() => {
                    window.location.assign("/api/auth/oauth/google");
                  }}
                >
                  <ProviderIcon />
                  <span>
                    Продолжить с Google
                    {!config.providers.google && <small>Пока недоступно</small>}
                  </span>
                </button>
              </div>
              <div className="auth-divider">
                <span>или по email</span>
              </div>
            </>
          )}
          <form key={mode} onSubmit={submit} className="auth-form">
            <fieldset disabled={busy}>
              {mode === "register" && (
                <label className="form-field">
                  Как тебя зовут
                  <input
                    name="name"
                    autoComplete="given-name"
                    placeholder="Твоё имя"
                    maxLength={24}
                    required
                  />
                </label>
              )}
              <label className="form-field">
                Email
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={254}
                />
              </label>

              <label className="form-field">
                <span className="password-label">Пароль</span>
                <div className="password-field">
                  <input
                    name="password"
                    aria-label="Пароль"
                    type={visible ? "text" : "password"}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    placeholder={
                      mode === "login" ? "Введи пароль" : "Не менее 10 символов"
                    }
                    minLength={mode === "login" ? 1 : 10}
                    maxLength={128}
                    required
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={visible ? "Скрыть пароль" : "Показать пароль"}
                    aria-pressed={visible}
                    onClick={() => setVisible((v) => !v)}
                  >
                    {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </label>
              {mode !== "login" && (
                <label className="form-field">
                  Повтори пароль
                  <input
                    name="confirm"
                    type={visible ? "text" : "password"}
                    autoComplete="new-password"
                    placeholder="Ещё раз, чтобы не ошибиться"
                    minLength={10}
                    maxLength={128}
                    required
                  />
                </label>
              )}
              <button
                className="primary-button auth-submit"
                disabled={!allowed}
                type="submit"
              >
                {busy ? <LoaderCircle size={18} className="spinning" /> : null}
                {mode === "login" ? "Войти" : "Создать аккаунт"}
                {!busy && <ArrowRight size={18} />}
              </button>
            </fieldset>
          </form>
          {mode === "login" ? (
            <p className="auth-switch">
              Ещё нет аккаунта?{" "}
              <button disabled={busy} onClick={() => changeMode("register")}>
                Зарегистрироваться
                <ArrowRight size={13} />
              </button>
            </p>
          ) : (
            <p className="auth-switch">
              Уже с нами?{" "}
              <button disabled={busy} onClick={() => changeMode("login")}>
                Войти
              </button>
            </p>
          )}
          {mode === "register" && (
            <p className="auth-privacy">
              Сохрани пароль: восстановление по почте недоступно.
            </p>
          )}
          <p className="auth-privacy">
            <LockKeyhole size={13} />
            Твои тренировки доступны только тебе.
          </p>
        </div>
        <footer className="auth-footer">
          PULSE © {new Date().getFullYear()}
          <span>Каждый день — новая возможность.</span>
        </footer>
      </main>
    </div>
  );
}
