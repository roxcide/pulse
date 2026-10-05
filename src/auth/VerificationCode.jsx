import React, { useRef, useState } from "react";
import { Check, CircleAlert } from "lucide-react";
import "./VerificationCode.css";

export default function VerificationCode({ value, onChange, status }) {
  const input = useRef(null);
  const [focused, setFocused] = useState(false);
  const [position, setPosition] = useState(0);
  function selectCell(index) {
    if (input.current.matches(":disabled")) return;
    const start = Math.min(index, value.length);
    input.current.focus();
    input.current.setSelectionRange(start, Math.min(start + 1, value.length));
    setPosition(Math.min(start, 5));
  }
  return (
    <div className={`verification-field is-${status}`}>
      <label className="verification-label" htmlFor="verification-code">
        Код подтверждения
      </label>
      <div className="verification-cells">
        {/* One native input preserves mobile autofill, paste and keyboard editing. */}
        <input
          ref={input}
          id="verification-code"
          className="verification-native"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          autoFocus
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
          value={value}
          aria-invalid={status === "error"}
          aria-describedby="code-help"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onSelect={(event) =>
            setPosition(Math.min(event.currentTarget.selectionStart || 0, 5))
          }
          onChange={(event) =>
            onChange(event.target.value.replace(/[^0-9]/g, "").slice(0, 6))
          }
          onPaste={(event) => {
            const digits = event.clipboardData
              .getData("text")
              .replace(/[^0-9]/g, "");
            if (digits.length >= 6) {
              event.preventDefault();
              onChange(digits.slice(0, 6));
              setPosition(5);
            }
          }}
        />
        {Array.from({ length: 6 }, (_, index) => (
          <span
            key={index}
            aria-hidden="true"
            className={`verification-cell${value[index] ? " is-filled" : ""}${focused && position === index ? " is-active" : ""}`}
            style={{ "--digit-index": index }}
            onClick={() => selectCell(index)}
          >
            {value[index] || (
              <span className="verification-placeholder">·</span>
            )}
          </span>
        ))}
      </div>
      <div
        className="verification-hint"
        id="code-help"
        role="status"
        aria-live="polite"
      >
        {status === "success" ? (
          <>
            <Check size={16} />
            Код верный. Открываем твой аккаунт…
          </>
        ) : status === "error" ? (
          <>
            <CircleAlert size={16} />
            Проверь код и попробуй ещё раз.
          </>
        ) : status === "checking" ? (
          "Проверяем код…"
        ) : (
          "Введи 6 цифр или вставь код целиком."
        )}
      </div>
    </div>
  );
}
