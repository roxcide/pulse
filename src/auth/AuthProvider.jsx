import React, { createContext, useContext, useEffect, useState } from "react";
import { api, authError } from "./client";
const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [config, setConfig] = useState({
    configured: false,
    providers: {},
    emailAvailable: false,
  });
  async function reloadSession() {
    const result = await api("/api/auth/session");
    setUser(result.user);
  }
  async function logout() {
    await api("/api/auth/logout", {});
    setUser(null);
    window.history.replaceState({}, "", location.pathname);
  }
  useEffect(() => {
    let alive = true;
    Promise.all([api("/api/auth/config"), api("/api/auth/session")])
      .then(([settings, session]) => {
        if (alive) {
          setConfig(settings);
          setUser(session.user);
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
  }, []);
  return (
    <AuthContext.Provider
      value={{ user, loading, config, error, reloadSession, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
