import React from "react";
import App from "../App";
import AuthScreen from "./AuthScreen";
import { useAuth } from "./AuthProvider";
import { UserDataProvider } from "../state/UserDataProvider";
import { LoaderCircle } from "lucide-react";
export default function AuthGate() {
  const { user, loading, error } = useAuth();
  if (loading)
    return (
      <div className="account-loading" role="status">
        <LoaderCircle className="spinning" size={28} />
        <p>Возвращаемся в твой ритм…</p>
      </div>
    );
  if (!user) return <AuthScreen initialError={error} />;
  return (
    <UserDataProvider key={user.id} user={user}>
      <App />
    </UserDataProvider>
  );
}
