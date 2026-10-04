import React, {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
} from "react";
import { Check } from "lucide-react";

export const themes = [
  {
    id: "pulse",
    name: "PULSE",
    description: "Графит · лайм",
    colors: ["#c5f578", "#111211", "#efefed"],
    background: "#111211",
  },
  {
    id: "dualshot",
    name: "Dualshot",
    description: "Серый · цветные иконки",
    colors: ["#737373", "#aaaaaa", "#212222"],
    background: "#737373",
  },
  {
    id: "alduin",
    name: "Alduin",
    description: "Уголь · тёплый кремовый",
    colors: ["#dfd7af", "#444444", "#f5f3ed"],
    background: "#1c1c1c",
  },
  {
    id: "80s-after-dark",
    name: "80s After Dark",
    description: "Ночной синий · розовый · голубой",
    colors: ["#fca6d1", "#99d6ea", "#e1e7ec"],
    background: "#1b1d36",
  },
  {
    id: "8008",
    name: "8008",
    description: "Серо-синий · яркий розовый",
    colors: ["#f44c7f", "#939eae", "#333a45"],
    background: "#333a45",
  },
];
const key = "pulse-appearance-v1";
const valid = (id) => themes.some((theme) => theme.id === id);
const ThemeContext = createContext({ theme: "pulse", setTheme: () => {} });

export function ThemeProvider({ children }) {
  const [theme, updateTheme] = useState(() => {
    try {
      const saved = localStorage.getItem(key);
      return valid(saved) ? saved : "pulse";
    } catch {
      return "pulse";
    }
  });
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute(
        "content",
        themes.find((item) => item.id === theme).background,
      );
  }, [theme]);
  function setTheme(next) {
    if (!valid(next)) return;
    updateTheme(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      /* Theme still works if storage is unavailable. */
    }
  }
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useContext(ThemeContext);
  return (
    <fieldset className="theme-picker">
      <legend>Тема оформления</legend>
      <p>Применяется сразу · сохраняется в этом браузере</p>
      <div className="theme-options">
        {themes.map((item) => (
          <label className="theme-option" key={item.id}>
            <input
              type="radio"
              name="appearance"
              value={item.id}
              checked={theme === item.id}
              onChange={() => setTheme(item.id)}
            />
            <span className="theme-option-content">
              <span className="theme-check" aria-hidden="true">
                {theme === item.id && <Check size={16} />}
              </span>
              <span className="theme-name">
                <strong>{item.name}</strong>
                <small>{item.description}</small>
              </span>
              <span className="theme-swatches" aria-hidden="true">
                {item.colors.map((color) => (
                  <i key={color} style={{ backgroundColor: color }} />
                ))}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
