import React from "react";
import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider } from "../src/auth/AuthProvider";
import AuthGate from "../src/auth/AuthGate";
import { newAccountState } from "../src/state/defaults";
import { ThemeProvider } from "../src/theme";

let requests, saved, session, failSave, failLoad;

beforeEach(() => {
  requests = [];
  saved = {};
  session = null;
  failSave = false;
  failLoad = false;
  window.history.replaceState({}, "", "/");
  localStorage.clear();
  vi.stubGlobal("scrollTo", () => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, options = {}) => {
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ path, body, method: options.method });
      if (path === "/api/auth/config")
        return Response.json({
          configured: true,
          passwordRegistration: true,
          providers: { google: false },
        });
      if (path === "/api/auth/session") return Response.json({ user: session });
      if (path === "/api/auth/login") {
        session = { id: "one", email: "one@example.com", displayName: "Анна" };
        return Response.json({ user: session });
      }
      if (path === "/api/auth/logout") {
        session = null;
        return Response.json({ ok: true });
      }
      if (path === "/api/state") {
        if (options.method === "PUT") {
          if (failSave)
            return Response.json({ error: "server_error" }, { status: 503 });
          Object.assign(saved, body);
          return Response.json({ ok: true });
        }
        if (failLoad)
          return Response.json({ error: "server_error" }, { status: 503 });
        return Response.json({ state: saved });
      }
      return Response.json({ ok: true });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function app() {
  return render(
    <ThemeProvider>
      <AuthProvider>
        <AuthGate />
      </AuthProvider>
    </ThemeProvider>,
  );
}
it("creates fresh independent account defaults with no invented personal data", () => {
  const a = newAccountState({ displayName: "Анна" }),
    b = newAccountState({ displayName: "Иван" });
  expect(a.history).toEqual([]);
  expect(a.plans).toEqual([]);
  expect(a.active).toBeNull();
  expect(a.profile.goal).toBe(0);
  expect(a.split).toEqual(Array(7).fill("Не запланировано"));
  expect(a.exercises.every((e) => e.weight === 0)).toBe(true);
  a.exercises[0].weight = 99;
  expect(b.exercises[0].weight).toBe(0);
});
it("logs in through the server and ignores legacy browser demo data", async () => {
  localStorage.setItem(
    "pulse-history",
    JSON.stringify([{ id: "demo", volume: 99999 }]),
  );
  const user = userEvent.setup();
  const { container } = app();
  await screen.findByRole("heading", { name: "С возвращением." });
  expect(screen.queryByRole("button", { name: /Apple/ })).toBeNull();
  expect(
    screen.getByRole("button", { name: /Продолжить с Google/ }).disabled,
  ).toBe(true);
  await user.type(screen.getByLabelText("Email"), "one@example.com");
  await user.type(
    screen.getByPlaceholderText("Введи пароль"),
    "long test password",
  );
  await user.click(screen.getByRole("button", { name: "Войти", exact: true }));
  await screen.findByText("Выбери недельную цель");
  expect(
    container.querySelector(".goal-ring").style.getPropertyValue("--progress"),
  ).toBe("0%");
  expect(container.querySelectorAll(".day-card")).toHaveLength(7);
  expect(container.textContent).not.toContain("Недельная цель достигнута");
  expect(container.textContent).not.toContain("Демо-профиль");
  expect(container.querySelector(".stats-grid").textContent).toContain(
    "Всего тренировок",
  );
  expect(
    requests.some((r) => r.path === "/api/state" && r.method === "PUT"),
  ).toBe(false);
});
it("checks matching passwords and shows server errors without a fake session", async () => {
  const original = fetch;
  const requestId = "61b93423-3600-499f-b08d-21b509ed3d93";
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, options) => {
      if (path === "/api/auth/register") {
        requests.push({ path, body: JSON.parse(options.body) });
        return Response.json(
          { error: "database_unavailable", requestId },
          { status: 503 },
        );
      }
      return original(path, options);
    }),
  );
  const user = userEvent.setup();
  app();
  await screen.findByRole("heading", { name: "С возвращением." });
  await user.click(screen.getByRole("button", { name: /Зарегистрироваться/ }));
  await user.type(screen.getByLabelText("Как тебя зовут"), "Анна");
  await user.type(screen.getByLabelText("Email"), "new@example.com");
  await user.type(
    screen.getByLabelText("Пароль", { exact: true }),
    "long password",
  );
  await user.type(screen.getByLabelText("Повтори пароль"), "wrong password");
  await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));
  expect((await screen.findByRole("alert")).textContent).toBe(
    "Пароли не совпадают.",
  );
  expect(requests.some((r) => r.path === "/api/auth/register")).toBe(false);
  await user.clear(screen.getByLabelText("Повтори пароль"));
  await user.type(screen.getByLabelText("Повтори пароль"), "long password");
  await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));
  expect((await screen.findByRole("alert")).textContent).toContain(requestId);
  expect(session).toBeNull();
  expect(requests.find((r) => r.path === "/api/auth/register").body.name).toBe(
    "Анна",
  );
});
it("does not overwrite cloud data if initial load fails", async () => {
  session = { id: "one", displayName: "Анна" };
  failLoad = true;
  app();
  await screen.findByText("Не удалось загрузить твои данные.");
  expect(requests.some((r) => r.method === "PUT")).toBe(false);
  failLoad = false;
  await userEvent.click(
    screen.getByRole("button", { name: "Попробовать снова" }),
  );
  await screen.findByText("Выбери недельную цель");
});
it("retains changes on failed save and prevents logout until retry succeeds", async () => {
  session = { id: "one", email: "one@example.com", displayName: "Анна" };
  failSave = true;
  app();
  await screen.findByText("Выбери недельную цель");
  await userEvent.click(screen.getByRole("button", { name: "Изменить цель" }));
  fireEvent.change(screen.getByLabelText("Как тебя зовут"), {
    target: { value: "Новое имя" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: /Сохранить настройки/ }),
  );
  await screen.findByRole("alert");
  await userEvent.click(screen.getByRole("button", { name: "Изменить цель" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Выйти из аккаунта" }),
  );
  expect(requests.some((r) => r.path === "/api/auth/logout")).toBe(false);
  failSave = false;
  await userEvent.click(
    screen.getByRole("button", { name: "Повторить", exact: true }),
  );
  await waitFor(() => expect(saved.profile.name).toBe("Новое имя"));
  await userEvent.click(
    screen.getByRole("button", { name: "Выйти из аккаунта" }),
  );
  await screen.findByRole("heading", { name: "С возвращением." });
});
it("registers pending and asks the user to verify their mailbox", async () => {
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, options) => {
      if (path === "/api/auth/register") {
        const data = JSON.parse(options.body);

        requests.push({ path, body: data });
        return Response.json(
          { verificationRequired: true, email: data.email, emailSent: true },
          { status: 201 },
        );
      }
      return original(path, options);
    }),
  );
  app();
  await screen.findByRole("heading", { name: "С возвращением." });
  expect(screen.queryByRole("button", { name: "Забыл пароль?" })).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: /Зарегистрироваться/ }),
  );
  expect(screen.queryByRole("button", { name: /Apple/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Создать аккаунт" }).disabled).toBe(
    false,
  );
  fireEvent.change(screen.getByLabelText("Как тебя зовут"), {
    target: { value: "Анна" },
  });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "new@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Пароль", { exact: true }), {
    target: { value: "a secure test password" },
  });
  fireEvent.change(screen.getByLabelText("Повтори пароль"), {
    target: { value: "a secure test password" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Создать аккаунт" }),
  );
  await screen.findByRole("heading", { name: "Введи код из письма." });
  expect(session).toBeNull();
  expect(
    screen.getByRole("button", { name: /Отправить код ещё раз/ }).disabled,
  ).toBe(true);
  expect(requests.filter((r) => r.path === "/api/auth/register")).toHaveLength(
    1,
  );
  expect(requests.some((r) => /verify|resend|reset/.test(r.path))).toBe(false);
});
it("retains provider configuration when session restoration fails", async () => {
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn((path, options) =>
      path === "/api/auth/config"
        ? Promise.resolve(
            Response.json({
              configured: true,
              passwordRegistration: true,
              providers: { google: true },
            }),
          )
        : path === "/api/auth/session"
          ? Promise.reject(new Error("server_error"))
          : original(path, options),
    ),
  );
  app();
  await screen.findByRole("heading", { name: "С возвращением." });
  expect(
    screen.getByRole("button", { name: /Продолжить с Google/ }).disabled,
  ).toBe(false);
  expect(screen.getByRole("alert").textContent).toContain("сервере");
});

it("persists guest settings across reloads without calling the account API", async () => {
  localStorage.setItem("pulse-guest-mode-v1", "true");
  app();
  await screen.findByText("Выбери недельную цель");
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Настройки", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Как тебя зовут"), {
    target: { value: "Локальный атлет" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: /Сохранить настройки/ }),
  );
  expect(
    JSON.parse(localStorage.getItem("pulse-guest-data-v1")).profile.name,
  ).toBe("Локальный атлет");
  cleanup();
  app();
  await screen.findByRole("heading", {
    name: "В твоём ритме, Локальный атлет.",
  });
  expect(fetch).not.toHaveBeenCalled();
  await userEvent.click(
    screen.getByRole("button", { name: "Настройки", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Войти или зарегистрироваться" }),
  );
  await screen.findByRole("heading", { name: "С возвращением." });
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "one@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Пароль", { exact: true }), {
    target: { value: "existing-password" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Войти", exact: true }),
  );
  await screen.findByRole("heading", { name: "В твоём ритме, Анна." });
  expect(saved).toEqual({});
  expect(
    JSON.parse(localStorage.getItem("pulse-guest-data-v1")).profile.name,
  ).toBe("Локальный атлет");
});
it("can enter guest mode while authentication is unavailable", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  app();
  await userEvent.click(
    screen.getByRole("button", { name: "Войти как гость" }),
  );
  await screen.findByText("Выбери недельную цель");
  expect(screen.getByText("Сохранено в браузере")).toBeTruthy();
  expect(localStorage.getItem("pulse-guest-mode-v1")).toBe("true");
});
it("keeps unsaved guest changes visible when browser storage is full", async () => {
  localStorage.setItem("pulse-guest-mode-v1", "true");
  app();
  await screen.findByText("Выбери недельную цель");
  const blocked = vi
    .spyOn(Storage.prototype, "setItem")
    .mockImplementation(() => {
      throw new Error("quota");
    });
  await userEvent.click(
    screen.getByRole("button", { name: "Настройки", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Как тебя зовут"), {
    target: { value: "Не потерять" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: /Сохранить настройки/ }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "не разрешил сохранить",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Настройки", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Войти или зарегистрироваться" }),
  );
  expect(screen.getByRole("heading", { name: "Твои настройки" })).toBeTruthy();
  blocked.mockRestore();
  await userEvent.click(
    screen.getByRole("button", { name: "Повторить", exact: true }),
  );
  expect(
    JSON.parse(localStorage.getItem("pulse-guest-data-v1")).profile.name,
  ).toBe("Не потерять");
  expect(fetch).not.toHaveBeenCalled();
});

it("requests password recovery without asking for the old password", async () => {
  app();
  await screen.findByRole("heading", { name: "С возвращением." });
  await userEvent.click(
    screen.getByRole("button", { name: "Не помню пароль" }),
  );
  expect(screen.queryByLabelText("Пароль", { exact: true })).toBeNull();
  fireEvent.change(screen.getByLabelText("Email"), {
    target: { value: "one@example.com" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Отправить ссылку" }),
  );
  expect((await screen.findByRole("status")).textContent).toContain(
    "Если для этого email",
  );
  expect(requests.find((r) => r.path === "/api/auth/reset").body.email).toBe(
    "one@example.com",
  );
});
it("opens recovery links over guest mode and preserves local workouts", async () => {
  localStorage.setItem("pulse-guest-mode-v1", "true");
  localStorage.setItem("pulse-guest-data-v1", JSON.stringify({ history: [] }));
  window.history.replaceState({}, "", "/?auth=recovery#token=test-token");
  app();
  await screen.findByRole("heading", { name: "Новый пароль." });
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Сохранить пароль" }).disabled,
    ).toBe(false),
  );
  expect(location.hash).toBe("");
  fireEvent.change(screen.getByLabelText("Пароль", { exact: true }), {
    target: { value: "new-strong-password" },
  });
  fireEvent.change(screen.getByLabelText("Повтори пароль"), {
    target: { value: "new-strong-password" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Сохранить пароль" }),
  );
  await screen.findByRole("heading", { name: "Готово." });
  expect(
    requests.find((r) => r.path === "/api/auth/update-password").body.token,
  ).toBe("test-token");
  await userEvent.click(
    screen.getByRole("button", { name: "Войти", exact: true }),
  );
  await screen.findByRole("heading", { name: "С возвращением." });
  expect(localStorage.getItem("pulse-guest-data-v1")).toBe(
    JSON.stringify({ history: [] }),
  );
});
it("restores the code form and enters the account without another password", async () => {
  const original = fetch;
  let verified = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, options) => {
      if (path === "/api/auth/session" && !verified)
        return Response.json({
          user: null,
          verification: { email: "one@example.com" },
        });
      if (path === "/api/auth/verify") {
        requests.push({ path, body: JSON.parse(options.body) });
        verified = true;
        session = { id: "one", email: "one@example.com", displayName: "Анна" };
        return Response.json({ user: session });
      }
      return original(path, options);
    }),
  );
  app();
  await screen.findByRole("heading", { name: "Введи код из письма." });
  expect(screen.queryByLabelText("Пароль", { exact: true })).toBeNull();
  const input = screen.getByLabelText("Код подтверждения");
  expect(input.autocomplete).toBe("one-time-code");
  fireEvent.change(input, { target: { value: "001234" } });
  await userEvent.click(
    screen.getByRole("button", { name: "Подтвердить и войти" }),
  );
  await screen.findByRole("heading", { name: "В твоём ритме, Анна." });
  expect(requests.find((r) => r.path === "/api/auth/verify").body.code).toBe(
    "001234",
  );
  expect(requests.some((r) => r.path === "/api/auth/login")).toBe(false);
});
