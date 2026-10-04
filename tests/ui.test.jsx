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
          emailAvailable: true,
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
    <AuthProvider>
      <AuthGate />
    </AuthProvider>,
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
it("checks matching passwords and submits registration without a fake session", async () => {
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
  await user.clear(screen.getByLabelText("Повтори пароль"));
  await user.type(screen.getByLabelText("Повтори пароль"), "long password");
  await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));
  await screen.findByRole("heading", { name: "Проверь свою почту." });
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
it("requires an explicit click to consume an email verification token", async () => {
  window.history.replaceState({}, "", "/?auth=verify#token=test-token");
  app();
  await screen.findByRole("heading", { name: "Подтверди email." });
  expect(requests.some((r) => r.path === "/api/auth/verify")).toBe(false);
  await userEvent.click(
    screen.getByRole("button", { name: "Подтвердить email" }),
  );
  await screen.findByText("Email подтверждён. Теперь можно войти.");
  expect(requests.find((r) => r.path === "/api/auth/verify").body).toEqual({
    token: "test-token",
  });
  expect(location.hash).toBe("");
});

it("keeps Google available when only password email delivery is missing", async () => {
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn((path, options) =>
      path === "/api/auth/config"
        ? Promise.resolve(
            Response.json({
              configured: true,
              emailAvailable: false,
              providers: { google: true },
              checks: {
                database: "ready",
                origin: "ready",
                email: "missing_binding",
              },
            }),
          )
        : original(path, options),
    ),
  );
  app();
  await screen.findByRole("heading", { name: "С возвращением." });
  await userEvent.click(
    screen.getByRole("button", { name: /Зарегистрироваться/ }),
  );
  expect(screen.queryByRole("button", { name: /Apple/ })).toBeNull();
  expect(
    screen.getByRole("button", { name: /Продолжить с Google/ }).disabled,
  ).toBe(false);
  expect(screen.getByRole("button", { name: "Создать аккаунт" }).disabled).toBe(
    true,
  );
  expect(screen.getByRole("status").textContent).toContain(
    "Создать аккаунт и войти можно через Google",
  );
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
              emailAvailable: true,
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
