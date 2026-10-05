import React, { useState } from "react";
import { Camera, Check } from "lucide-react";
import { useUserData } from "../state/UserDataProvider";
import { prepareAvatar } from "./avatar";
import "./profile.css";

export default function ProfileEditor({ onBusyChange, onSaved }) {
  const { data, update } = useUserData();
  const [name, setName] = useState(data.profile.name);
  const [weight, setWeight] = useState(data.profile.weight ?? "");
  const [avatar, setAvatar] = useState(data.profile.avatar || "");
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  async function upload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    setProcessing(true);
    onBusyChange(true);
    try {
      setAvatar(await prepareAvatar(file));
    } catch (err) {
      setError(err.message);
    } finally {
      setProcessing(false);
      onBusyChange(false);
    }
  }
  function save(event) {
    event.preventDefault();
    if (processing) return;
    if (!name.trim()) {
      setError("Введи имя или ник.");
      return;
    }
    const kg = weight === "" ? null : Number(weight);
    if (kg !== null && (!Number.isFinite(kg) || kg < 1 || kg > 500)) {
      setError("Укажи вес от 1 до 500 кг или оставь поле пустым.");
      return;
    }
    update("profile", (previous) => ({
      ...previous,
      name: name.trim(),
      weight: kg,
      avatar,
    }));
    onSaved();
  }
  return (
    <form className="personal-profile" onSubmit={save}>
      <div className="profile-photo-row">
        <div className="avatar profile-photo">
          {avatar ? (
            <img src={avatar} alt="Твоя аватарка" />
          ) : (
            (name.trim()[0] || "?").toUpperCase()
          )}
        </div>
        <div className="profile-photo-controls">
          <label
            className={`secondary-button profile-upload${processing ? " is-processing" : ""}`}
          >
            <Camera size={18} />
            {processing ? "Обрабатываем…" : "Загрузить фото"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Загрузить аватарку"
              disabled={processing}
              onChange={upload}
            />
          </label>
          {avatar && (
            <button
              type="button"
              className="text-button"
              disabled={processing}
              onClick={() => setAvatar("")}
            >
              Удалить фото
            </button>
          )}
          <p className="form-hint">
            JPG, PNG или WebP, до 8 МБ. Квадратная обрезка по центру.
          </p>
        </div>
      </div>
      <label className="form-field">
        Имя или ник
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={24}
          autoComplete="nickname"
          required
          disabled={processing}
        />
      </label>
      <label className="form-field">
        Вес, кг
        <input
          type="number"
          inputMode="decimal"
          min="1"
          max="500"
          step="0.1"
          value={weight}
          onChange={(event) => setWeight(event.target.value)}
          placeholder="Не указан"
          disabled={processing}
        />
      </label>
      <p className="form-hint">Вес необязателен. Можно оставить поле пустым.</p>
      {error && (
        <p className="auth-feedback error" role="alert">
          {error}
        </p>
      )}
      <button
        className="primary-button full-width"
        type="submit"
        disabled={processing}
      >
        <Check size={17} />
        Сохранить профиль
      </button>
    </form>
  );
}
