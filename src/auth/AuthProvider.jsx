import React, { createContext, useContext, useEffect, useState } from "react";
import { api, authError } from "./client";
const AuthContext = createContext(null);
const guestKey = "pulse-guest-mode-v1";
const guestUser = { id: "guest", displayName: "Гость", email: "" };
function readGuestMode() {
  try {
    return localStorage.getItem(guestKey) === "true";
  } catch {
    return false;
  }
}
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [emailAction, setEmailAction] = useState(() => {
    const mode = new URLSearchParams(location.search).get("auth");
    return ["verify", "recovery"].includes(mode)
      ? {
          mode,
          token: new URLSearchParams(location.hash.slice(1)).get("token") || "",
        }
      : null;
  });
  function finishEmailAction() {
    setGuest(false);
    setUser(null);
    try {
      localStorage.removeItem(guestKey);
    } catch {}
    setEmailAction(null);
    window.history.replaceState({}, "", location.pathname);
  }
  const [isGuest, setGuest] = useState(readGuestMode);
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [config, setConfig] = useState({
    configured: false,
    providers: {},
    passwordRegistration: false,
  });
  async function reloadSession() {
    const result = await api("/api/auth/session");
    setUser(result.user);
    if (result.user) {
      setGuest(false);
      try {
        localStorage.removeItem(guestKey);
      } catch {}
    }
  }
  function enterGuest() {
    setEmailAction(null);
    try {
      localStorage.setItem(guestKey, "true");
    } catch {
      /* In-memory mode remains available. */
    }
    setGuest(true);
    setError("");
    window.history.replaceState({}, "", location.pathname + "#dashboard");
  }
  async function logout() {
    if (isGuest) {
      try {
        localStorage.removeItem(guestKey);
      } catch {
        /* Storage may be disabled. */
      }
      setGuest(false);
    } else await api("/api/auth/logout", {});
    setUser(null);
    window.history.replaceState({}, "", location.pathname);
  }
  useEffect(() => {
    if (isGuest && !emailAction) {
      setLoading(false);
      return;
    }
    let alive = true;
    Promise.allSettled([api("/api/auth/config"), api("/api/auth/session")])
      .then(([settings, session]) => {
        if (alive) {
          if (settings.status === "fulfilled") setConfig(settings.value);
          else setError(authError(settings.reason));
          if (session.status === "fulfilled") setUser(session.value.user);
          else setError(authError(session.reason));
        }
      })
      .catch((err) => {
        if (alive) setError(authError(err));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isGuest, emailAction]);
  return (
    <AuthContext.Provider
      value={{
        user: isGuest ? guestUser : user,
        isGuest,
        emailAction,
        finishEmailAction,
        enterGuest,
        loading,
        config,
        error,
        reloadSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
