import React from "react";
import App from "../App";
import AuthScreen from "./AuthScreen";
import { useAuth } from "./AuthProvider";
import { UserDataProvider, GuestDataProvider } from "../state/UserDataProvider";
import { LoaderCircle } from "lucide-react";
export default function AuthGate() {
  const { user, isGuest, loading, error, enterGuest, emailAction } = useAuth();
  if (emailAction) return <AuthScreen initialError={error} />;
  if (isGuest)
    return (
      <GuestDataProvider user={user}>
        <App />
      </GuestDataProvider>
    );
  if (loading)
    return (
      <div className="account-loading" role="status">
        <LoaderCircle className="spinning" size={28} />
        <p>Возвращаемся в твой ритм…</p>
        <button className="secondary-button" onClick={enterGuest}>
          Войти как гость
        </button>
      </div>
    );
  if (!user) return <AuthScreen initialError={error} />;
  return (
    <UserDataProvider key={user.id} user={user}>
      <App />
    </UserDataProvider>
  );
}
