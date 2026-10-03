import { useEffect, useState } from "react";
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(`pulse-${key}`);
      return saved
        ? JSON.parse(saved)
        : typeof initial === "function"
          ? initial()
          : initial;
    } catch {
      return typeof initial === "function" ? initial() : initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`pulse-${key}`, JSON.stringify(value));
    } catch {
      /* App remains usable when browser storage is unavailable. */
    }
  }, [key, value]);
  return [value, setValue];
}
