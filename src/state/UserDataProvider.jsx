import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { LoaderCircle } from "lucide-react";
import { api, authError } from "../auth/client";
import { useAuth } from "../auth/AuthProvider";
import { newAccountState } from "./defaults";
import { validState } from "../../shared/state";
const DataContext = createContext(null);
export const useUserData = () => useContext(DataContext);

const guestStorageKey = "pulse-guest-data-v1";
function loadGuest(user) {
  const defaults = newAccountState(user);
  try {
    const raw = localStorage.getItem(guestStorageKey);
    if (!raw) return { data: defaults, error: "" };
    const saved = JSON.parse(raw);
    if (!validState(saved)) throw new Error("invalid_guest_data");
    return { data: { ...defaults, ...saved }, error: "" };
  } catch {
    return {
      data: defaults,
      error:
        "Не удалось прочитать данные гостя. Хранилище браузера недоступно или повреждено.",
    };
  }
}

export function GuestDataProvider({ user, children }) {
  const { logout } = useAuth();
  const [initial] = useState(() => loadGuest(user));
  const [data, setData] = useState(initial.data);
  const current = useRef(data);
  const [status, setStatus] = useState(initial.error ? "error" : "saved");
  const [error, setError] = useState(initial.error);
  const [dirty, setDirty] = useState(false);
  function persist(next) {
    try {
      localStorage.setItem(guestStorageKey, JSON.stringify(next));
      setStatus("saved");
      setError("");
      setDirty(false);
      return true;
    } catch {
      setStatus("error");
      setError(
        "Браузер не разрешил сохранить прогресс. Проверь доступ к локальному хранилищу и свободное место.",
      );
      return false;
    }
  }
  function update(key, value) {
    const next = {
      ...current.current,
      [key]: typeof value === "function" ? value(current.current[key]) : value,
    };
    current.current = next;
    setData(next);
    setDirty(true);
    persist(next);
  }
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  function signOut() {
    if (!dirty || persist(current.current)) logout();
  }
  return (
    <DataContext.Provider value={{ data, update, status, signOut }}>
      {status === "error" && (
        <div className="sync-error" role="alert">
          <span>{error} Изменения остаются в открытой вкладке.</span>
          <button onClick={() => persist(current.current)}>Повторить</button>
        </div>
      )}
      {children}
    </DataContext.Provider>
  );
}

export function UserDataProvider({ user, children }) {
  const { logout } = useAuth();
  const [data, setData] = useState(null),
    [loadError, setLoadError] = useState(""),
    [status, setStatus] = useState("saved"),
    [error, setError] = useState("");
  const current = useRef(null),
    dirty = useRef({}),
    running = useRef(null),
    timer = useRef(null),
    alive = useRef(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    alive.current = true;
    let cancelled = false;
    api("/api/state", undefined, "GET", user.id)
      .then((result) => {
        if (cancelled) return;
        current.current = { ...newAccountState(user), ...result.state };
        setData(current.current);
        setLoadError("");
      })
      .catch((err) => {
        if (!cancelled) setLoadError(authError(err));
      });
    return () => {
      cancelled = true;
      alive.current = false;
      clearTimeout(timer.current);
    };
  }, [user.id, attempt]);
  useEffect(() => {
    const warn = (event) => {
      if (Object.keys(dirty.current).length || running.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);
  async function flush() {
    clearTimeout(timer.current);
    if (running.current) {
      await running.current;
      if (Object.keys(dirty.current).length) return flush();
      return;
    }
    if (!Object.keys(dirty.current).length) return;
    const snapshot = dirty.current;
    dirty.current = {};
    setStatus("saving");
    setError("");
    const request = api("/api/state", snapshot, "PUT", user.id);
    running.current = request;
    try {
      await request;
      if (alive.current) setStatus("saved");
    } catch (err) {
      dirty.current = { ...snapshot, ...dirty.current };
      if (alive.current) {
        setStatus("error");
        setError(authError(err));
      }
      throw err;
    } finally {
      running.current = null;
    }
    if (Object.keys(dirty.current).length && alive.current) return flush();
  }
  function update(key, value) {
    const next =
      typeof value === "function" ? value(current.current[key]) : value;
    current.current = { ...current.current, [key]: next };
    dirty.current[key] = next;
    setData(current.current);
    setStatus("saving");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      flush().catch(() => {});
    }, 400);
  }
  async function signOut() {
    try {
      await flush();
      await logout();
    } catch (err) {
      setStatus("error");
      setError(authError(err));
    }
  }
  if (loadError)
    return (
      <div className="account-loading" role="alert">
        <p>Не удалось загрузить твои данные.</p>
        <p>{loadError}</p>
        <button
          className="primary-button"
          onClick={() => setAttempt((n) => n + 1)}
        >
          Попробовать снова
        </button>
        <button
          className="text-button"
          onClick={() => logout().catch((err) => setLoadError(authError(err)))}
        >
          Выйти
        </button>
      </div>
    );
  if (!data)
    return (
      <div className="account-loading" role="status">
        <LoaderCircle className="spinning" />
        <p>Загружаем твой прогресс…</p>
      </div>
    );
  return (
    <DataContext.Provider value={{ data, update, status, signOut }}>
      {status === "error" && (
        <div className="sync-error" role="alert">
          <span>
            Изменения ещё не сохранены. {error} Оставь страницу открытой.
          </span>
          <button onClick={() => flush().catch(() => {})}>Повторить</button>
        </div>
      )}
      {children}
    </DataContext.Provider>
  );
}
