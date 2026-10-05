import React, { useState } from "react";
import { Trash2, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { useUserData } from "../state/UserDataProvider";
import { authError } from "../auth/client";

export default function AccountPanel({ onBusyChange }) {
  const { user, isGuest } = useAuth();
  const { signOut, removeAccount } = useUserData();
  const [confirming, setConfirming] = useState(false);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault();
    if (busy || email.trim().toLowerCase() !== user.email) return;
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      await removeAccount(email.trim());
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  if (confirming)
    return (
      <form onSubmit={submit} className="account-panel">
        <h3>Ты уверен, что хочешь удалить аккаунт?</h3>
        <p className="account-warning">
          Аккаунт будет удалён безвозвратно вместе с историей тренировок,
          расписанием, упражнениями и личными настройками. Восстановить аккаунт
          и прогресс будет невозможно. Вход на всех устройствах завершится.
        </p>
        <p className="form-hint">
          Новая регистрация с этим email создаст пустой аккаунт.
        </p>
        <label className="form-field">
          Введи email для подтверждения
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder={user.email}
            autoComplete="off"
            required
            disabled={busy}
            maxLength={254}
          />
        </label>
        {error && (
          <p className="auth-feedback error" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={busy}
            onClick={() => {
              setConfirming(false);
              setEmail("");
              setError("");
            }}
          >
            Отмена
          </button>
          <button
            type="submit"
            className="danger-button"
            disabled={busy || email.trim().toLowerCase() !== user.email}
          >
            <Trash2 size={17} />
            {busy ? "Удаляем…" : "Удалить навсегда"}
          </button>
        </div>
      </form>
    );
  return (
    <div className="account-panel">
      <p className="form-hint">
        {isGuest
          ? "Гостевой прогресс хранится в этом браузере. Выход не удалит его и не перенесёт в аккаунт."
          : user.email}
      </p>
      <button
        type="button"
        className="secondary-button full-width"
        onClick={signOut}
      >
        <LogOut size={17} />
        {isGuest ? "Войти или зарегистрироваться" : "Выйти из аккаунта"}
      </button>
      {!isGuest && (
        <div className="account-danger-zone">
          <h3>Удаление аккаунта</h3>
          <p className="form-hint">
            Удалить аккаунт и весь сохранённый в нём прогресс без возможности
            восстановления.
          </p>
          <button
            type="button"
            className="danger-button full-width"
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={17} />
            Удалить аккаунт
          </button>
        </div>
      )}
    </div>
  );
}
