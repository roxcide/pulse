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
import * as avatarTools from "../src/account/avatar";
import { pplPrograms, buildWorkoutExercises } from "../src/programs/catalog";
import {
  splitOptions,
  splitExercises,
  programs,
  initialExercises,
} from "../src/data";

let requests, saved, session, failSave, failLoad;

it.each(pplPrograms)(
  "starts $name with the displayed prescription and preserves personal weights",
  async (program) => {
    localStorage.setItem("pulse-guest-mode-v1", "true");
    const state = newAccountState({ displayName: "Тест" });
    state.exercises.find((e) => e.id === program.exercises[0]).weight = 20;
    localStorage.setItem("pulse-guest-data-v1", JSON.stringify(state));
    window.history.replaceState({}, "", "/#programs");
    app();
    await userEvent.click(
      await screen.findByRole("button", {
        name: new RegExp(`${program.eyebrow} ${program.name} `),
      }),
    );
    await screen.findByRole("dialog", { name: program.name });
    const preview = screen.getByRole("dialog", { name: program.name });
    for (const id of program.exercises) {
      const plan = program.prescription[id];
      expect(preview.textContent).toContain(
        `${plan.sets} × ${plan.reps}–${plan.maxReps}`,
      );
    }
    await userEvent.click(
      screen.getByRole("button", { name: "Начать программу" }),
    );
    const saved = JSON.parse(localStorage.getItem("pulse-guest-data-v1"));
    expect(saved.active.name).toBe(program.name);
    expect(saved.active.exercises.map((e) => e.id)).toEqual(program.exercises);
    for (const exercise of saved.active.exercises) {
      const plan = program.prescription[exercise.id];
      expect(exercise.sets).toHaveLength(plan.sets);
      expect(exercise.sets.every((s) => s.reps === plan.reps && !s.done)).toBe(
        true,
      );
    }
    expect(saved.active.exercises[0].sets[0].weight).toBe(20);
    expect(saved.history).toEqual([]);
    expect(saved.exercises).toEqual(state.exercises);
    cleanup();
    app();
    await screen.findByRole("heading", { name: program.name, exact: true });
    expect(
      JSON.parse(localStorage.getItem("pulse-guest-data-v1")).active,
    ).toEqual(saved.active);
  },
);

it("resolves PPL from schedule names and keeps old templates compatible", () => {
  for (const program of pplPrograms) {
    expect(splitOptions).toContain(program.name);
    const resolved = programs.find((p) => p.name === program.name);
    expect(
      buildWorkoutExercises(
        splitExercises[program.name],
        initialExercises,
        resolved,
      ),
    ).toEqual(
      buildWorkoutExercises(program.exercises, initialExercises, program),
    );
  }
  expect(
    buildWorkoutExercises(["bench"], initialExercises, programs[0])[0].sets,
  ).toEqual(
    Array.from({ length: 3 }, () => ({ reps: 10, weight: 0, done: false })),
  );
});

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

it("saves profile weight and avatar, restores them and can remove the photo", async () => {
  session = { id: "one", email: "one@example.com", displayName: "Анна" };
  const avatar = "data:image/jpeg;base64,/9j/AAAA";
  const prepare = vi
    .spyOn(avatarTools, "prepareAvatar")
    .mockResolvedValue(avatar);
  try {
    app();
    await screen.findByText("Выбери недельную цель");
    await userEvent.click(
      screen.getByRole("button", { name: "Аккаунт", exact: true }),
    );
    fireEvent.change(screen.getByLabelText("Имя или ник"), {
      target: { value: "Новый ник" },
    });
    fireEvent.change(screen.getByLabelText("Вес, кг"), {
      target: { value: "72.5" },
    });
    await userEvent.upload(
      screen.getByLabelText("Загрузить аватарку"),
      new File(["photo"], "me.png", { type: "image/png" }),
    );
    await screen.findByAltText("Твоя аватарка");
    await userEvent.click(
      screen.getByRole("button", { name: "Сохранить профиль" }),
    );
    await waitFor(() =>
      expect(saved.profile).toEqual({
        name: "Новый ник",
        weight: 72.5,
        avatar,
        rest: 90,
        goal: 0,
      }),
    );
    expect(session.id).toBe("one");
    cleanup();
    app();
    await screen.findByText("Выбери недельную цель");
    expect(
      document.querySelector(".topbar .avatar img").getAttribute("src"),
    ).toBe(avatar);
    await userEvent.click(
      screen.getByRole("button", { name: "Аккаунт", exact: true }),
    );
    expect(screen.getByLabelText("Вес, кг").value).toBe("72.5");
    await userEvent.click(screen.getByRole("button", { name: "Удалить фото" }));
    fireEvent.change(screen.getByLabelText("Вес, кг"), {
      target: { value: "" },
    });
    await userEvent.click(
      screen.getByRole("button", { name: "Сохранить профиль" }),
    );
    await waitFor(() => expect(saved.profile.avatar).toBe(""));
    expect(saved.profile.weight).toBeNull();
    expect(document.querySelector(".topbar .avatar img")).toBeNull();
  } finally {
    prepare.mockRestore();
  }
});

it("rejects unsupported and oversized photos before decoding", async () => {
  await expect(
    avatarTools.prepareAvatar(
      new File(["<svg/>"], "x.svg", { type: "image/svg+xml" }),
    ),
  ).rejects.toThrow("JPG");
  await expect(
    avatarTools.prepareAvatar({ type: "image/jpeg", size: 9 * 1024 * 1024 }),
  ).rejects.toThrow("8 МБ");
});
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
  await userEvent.click(
    screen.getByRole("button", { name: "Аккаунт", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Имя или ник"), {
    target: { value: "Новое имя" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: /Сохранить профиль/ }),
  );
  await screen.findByRole("alert");
  await userEvent.click(
    screen.getByRole("button", { name: "Настройки", exact: true }),
  );
  if (!screen.queryByRole("dialog", { name: "Личный профиль" })) {
    await userEvent.click(
      screen.getByRole("button", { name: "Закрыть", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Аккаунт", exact: true }),
    );
  }
  await userEvent.click(
    screen.getByRole("button", { name: "Выйти из аккаунта" }),
  );
  expect(requests.some((r) => r.path === "/api/auth/logout")).toBe(false);
  failSave = false;
  await userEvent.click(
    screen.getByRole("button", { name: "Повторить", exact: true }),
  );
  await waitFor(() => expect(saved.profile.name).toBe("Новое имя"));
  if (!screen.queryByRole("dialog", { name: "Личный профиль" })) {
    await userEvent.click(
      screen.getByRole("button", { name: "Закрыть", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Аккаунт", exact: true }),
    );
  }
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
    screen.getByRole("button", { name: "Аккаунт", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Имя или ник"), {
    target: { value: "Локальный атлет" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: /Сохранить профиль/ }),
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
  if (!screen.queryByRole("dialog", { name: "Личный профиль" })) {
    await userEvent.click(
      screen.getByRole("button", { name: "Закрыть", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Аккаунт", exact: true }),
    );
  }
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
    screen.getByRole("button", { name: "Аккаунт", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Имя или ник"), {
    target: { value: "Не потерять" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: /Сохранить профиль/ }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "не разрешил сохранить",
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Настройки", exact: true }),
  );
  if (!screen.queryByRole("dialog", { name: "Личный профиль" })) {
    await userEvent.click(
      screen.getByRole("button", { name: "Закрыть", exact: true }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Аккаунт", exact: true }),
    );
  }
  await userEvent.click(
    screen.getByRole("button", { name: "Войти или зарегистрироваться" }),
  );
  expect(screen.getByRole("heading", { name: "Личный профиль" })).toBeTruthy();
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
        if (JSON.parse(options.body).code !== "001234")
          return Response.json({ error: "invalid_code" }, { status: 400 });
        verified = true;
        session = { id: "one", email: "one@example.com", displayName: "Анна" };
        return Response.json({ user: session });
      }
      return original(path, options);
    }),
  );
  const { container } = app();
  await screen.findByRole("heading", { name: "Введи код из письма." });
  expect(screen.queryByLabelText("Пароль", { exact: true })).toBeNull();
  const input = screen.getByLabelText("Код подтверждения");
  expect(input.autocomplete).toBe("one-time-code");
  const cells = container.querySelectorAll(".verification-cell");
  expect(cells).toHaveLength(6);
  fireEvent.change(input, { target: { value: "001234" } });
  await userEvent.click(cells[2]);
  await userEvent.keyboard("9");
  expect(input.value).toBe("009234");
  await userEvent.click(
    screen.getByRole("button", { name: "Подтвердить и войти" }),
  );
  await screen.findByText("Проверь код и попробуй ещё раз.");
  expect(container.querySelector(".verification-field.is-error")).toBeTruthy();
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(
    screen.queryByRole("heading", { name: "В твоём ритме, Анна." }),
  ).toBeNull();
  fireEvent.paste(input, { clipboardData: { getData: () => "001 234" } });
  expect(input.value).toBe("001234");
  expect(container.querySelector(".verification-field.is-error")).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Подтвердить и войти" }),
  );
  await screen.findByText("Код верный. Открываем твой аккаунт…");
  expect(
    container.querySelectorAll(
      ".verification-field.is-success .verification-cell",
    ),
  ).toHaveLength(6);
  expect(
    screen
      .getByRole("button", { name: "Почта подтверждена" })
      .matches(":disabled"),
  ).toBe(true);
  await screen.findByRole(
    "heading",
    { name: "В твоём ритме, Анна." },
    { timeout: 2000 },
  );
  expect(
    requests.filter((r) => r.path === "/api/auth/verify").at(-1).body.code,
  ).toBe("001234");
  expect(requests.some((r) => r.path === "/api/auth/login")).toBe(false);
});

it("edits goals separately from settings and preserves unrelated fields", async () => {
  localStorage.setItem("pulse-guest-mode-v1", "true");
  app();
  await screen.findByText("Выбери недельную цель");
  await userEvent.click(screen.getByRole("button", { name: "Изменить цель" }));
  expect(screen.queryByLabelText("Как тебя зовут")).toBeNull();
  expect(screen.queryByLabelText("Отдых между подходами")).toBeNull();
  fireEvent.change(screen.getByLabelText("Цель: тренировочных дней в неделю"), {
    target: { value: "4" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Сохранить цель" }));
  await userEvent.click(
    screen.getByRole("button", { name: "Настройки", exact: true }),
  );
  expect(
    screen.queryByLabelText("Цель: тренировочных дней в неделю"),
  ).toBeNull();
  expect(screen.queryByLabelText("Имя или ник")).toBeNull();
  fireEvent.change(screen.getByLabelText("Отдых между подходами"), {
    target: { value: "120" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Сохранить настройки" }),
  );
  expect(
    JSON.parse(localStorage.getItem("pulse-guest-data-v1")).profile,
  ).toEqual({ name: "Гость", rest: 120, goal: 4 });
  await userEvent.click(screen.getByRole("button", { name: "Изменить цель" }));
  fireEvent.change(screen.getByLabelText("Цель: тренировочных дней в неделю"), {
    target: { value: "2" },
  });
  await userEvent.click(screen.getByRole("button", { name: "Сохранить цель" }));
  expect(
    JSON.parse(localStorage.getItem("pulse-guest-data-v1")).profile,
  ).toEqual({ name: "Гость", rest: 120, goal: 2 });
});
it("requires deletion confirmation and retains the account after failure", async () => {
  session = { id: "one", email: "one@example.com", displayName: "Анна" };
  let failDelete = true;
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, options) => {
      if (path === "/api/auth/account") {
        requests.push({
          path,
          body: JSON.parse(options.body),
          method: options.method,
        });
        expect(options.headers["X-Pulse-Account"]).toBe("one");
        if (failDelete)
          return Response.json({ error: "server_error" }, { status: 503 });
        session = null;
        return Response.json({ ok: true });
      }
      return original(path, options);
    }),
  );
  app();
  await screen.findByText("Выбери недельную цель");
  await userEvent.click(
    screen.getByRole("button", { name: "Аккаунт", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Удалить аккаунт", exact: true }),
  );
  expect(
    screen.getByText(/Восстановить аккаунт и прогресс будет невозможно/),
  ).toBeTruthy();
  expect(
    screen.getByRole("button", { name: "Удалить навсегда" }).disabled,
  ).toBe(true);
  await userEvent.click(screen.getByRole("button", { name: "Отмена" }));
  expect(requests.some((r) => r.method === "DELETE")).toBe(false);
  await userEvent.click(
    screen.getByRole("button", { name: "Удалить аккаунт", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Введи email для подтверждения"), {
    target: { value: "one@example.com" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Удалить навсегда" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain("сервере");
  expect(session).not.toBeNull();
  failDelete = false;
  await userEvent.click(
    screen.getByRole("button", { name: "Удалить навсегда" }),
  );
  await screen.findByRole("heading", { name: "С возвращением." });
  expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(2);
});
it("does not offer account deletion to guests", async () => {
  localStorage.setItem("pulse-guest-mode-v1", "true");
  app();
  await screen.findByText("Выбери недельную цель");
  await userEvent.click(
    screen.getByRole("button", { name: "Аккаунт", exact: true }),
  );
  expect(
    screen.queryByRole("button", { name: "Удалить аккаунт", exact: true }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Войти или зарегистрироваться" }),
  ).toBeTruthy();
});

it("waits for an in-flight save before deletion even when that save fails", async () => {
  session = { id: "one", email: "one@example.com", displayName: "Анна" };
  let finishSave;
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, options) => {
      if (path === "/api/state" && options.method === "PUT") {
        requests.push({ path, method: "PUT" });
        return new Promise((resolve) => {
          finishSave = () =>
            resolve(Response.json({ error: "server_error" }, { status: 503 }));
        });
      }
      if (path === "/api/auth/account") {
        requests.push({ path, method: "DELETE" });
        session = null;
        return Response.json({ ok: true });
      }
      return original(path, options);
    }),
  );
  app();
  await screen.findByText("Выбери недельную цель");
  await userEvent.click(
    screen.getByRole("button", { name: "Аккаунт", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Имя или ник"), {
    target: { value: "Новое имя" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Сохранить профиль" }),
  );
  await waitFor(() => expect(finishSave).toBeTypeOf("function"));
  await userEvent.click(
    screen.getByRole("button", { name: "Аккаунт", exact: true }),
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Удалить аккаунт", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Введи email для подтверждения"), {
    target: { value: "one@example.com" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Удалить навсегда" }),
  );
  expect(requests.some((r) => r.method === "DELETE")).toBe(false);
  expect(
    screen.getByRole("button", { name: "Закрыть", exact: true }).disabled,
  ).toBe(true);
  finishSave();
  await screen.findByRole("heading", { name: "С возвращением." });
  expect(requests.filter((r) => r.method === "PUT")).toHaveLength(1);
  expect(requests.filter((r) => r.method === "DELETE")).toHaveLength(1);
});

it("provides a guide for every built-in and merges old catalogs without losing user data", async () => {
  const { initialExercises } = await import("../src/data");
  const { exerciseGuides } = await import("../src/exercises/catalog");
  const { restoreAccountState } = await import("../src/state/defaults");
  const { validState } = await import("../shared/state");
  expect(initialExercises).toHaveLength(35);
  expect(new Set(initialExercises.map((e) => e.id)).size).toBe(35);
  for (const exercise of initialExercises) {
    expect(exerciseGuides[exercise.id].steps).toHaveLength(4);
    expect(exerciseGuides[exercise.id].mistakes.length).toBeGreaterThan(0);
  }
  const original = newAccountState({ displayName: "Анна" });
  original.exercises = [
    { ...original.exercises[0], weight: 55, reps: 7 },
    {
      id: "custom",
      name: "Моё упражнение",
      muscle: "Спина",
      equipment: "Гантели",
      weight: 8,
      reps: 12,
      description: "Своя техника",
    },
  ];
  const snapshot = structuredClone(original);
  const restored = restoreAccountState({ displayName: "Анна" }, original);
  expect(restored.exercises).toHaveLength(36);
  expect(restored.exercises.slice(0, 2)).toEqual(original.exercises);
  expect(restored.history).toEqual([]);
  expect(original).toEqual(snapshot);
  expect(restoreAccountState({ displayName: "Анна" }, restored)).toEqual(
    restored,
  );
  expect(validState(restored)).toBe(true);
  expect(
    validState({
      exercises: [{ ...original.exercises[1], description: "a".repeat(2001) }],
    }),
  ).toBe(false);
});

it("opens techniques from filtered library and workout without starting or changing sets", async () => {
  session = { id: "one", displayName: "Анна" };
  saved = {
    exercises: [
      {
        id: "bench",
        name: "Жим штанги лёжа",
        muscle: "Грудь",
        equipment: "Штанга",
        weight: 55,
        reps: 7,
      },
    ],
  };
  window.history.replaceState({}, "", "/#exercises");
  const user = userEvent.setup();
  const { container } = app();
  await screen.findByText("Найдено упражнений: 35");
  await user.selectOptions(screen.getByLabelText("Оборудование"), "Свой вес");
  await user.type(screen.getByLabelText("Поиск упражнений"), "подтягивания");
  expect(container.querySelectorAll(".exercise-card")).toHaveLength(2);
  await user.click(
    screen.getByRole("button", { name: "Техника: Подтягивания прямым хватом" }),
  );
  expect(
    screen.getByRole("dialog", { name: "Подтягивания прямым хватом" })
      .textContent,
  ).toContain("Частые ошибки");
  expect(saved.active).toBeUndefined();
  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.activeElement).toBe(
    screen.getByRole("button", { name: "Техника: Подтягивания прямым хватом" }),
  );
  await user.click(
    screen.getByRole("button", {
      name: "Добавить Подтягивания прямым хватом в тренировку",
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Техника: Подтягивания прямым хватом" }),
  );
  expect(container.querySelectorAll(".set-row")).toHaveLength(3);
  await user.click(
    screen.getByRole("button", { name: "Закрыть", exact: true }),
  );
  await waitFor(() => expect(saved.active?.exercises[0].id).toBe("pullups"));
  expect(saved.active.exercises[0].sets.every((s) => !s.done)).toBe(true);
});

it("saves and edits custom technique descriptions in guest storage", async () => {
  localStorage.setItem("pulse-guest-mode-v1", "true");
  window.history.replaceState({}, "", "/#exercises");
  const user = userEvent.setup();
  app();
  await user.click(
    await screen.findByRole("button", { name: "Своё упражнение" }),
  );
  await user.type(screen.getByLabelText("Название"), "Упражнение тренера");
  await user.type(
    screen.getByLabelText("Описание техники"),
    "Контролируй движение.",
  );
  await user.click(
    screen.getByRole("button", { name: "Добавить упражнение", exact: true }),
  );
  await user.click(
    screen.getByRole("button", { name: "Техника: Упражнение тренера" }),
  );
  expect(screen.getByLabelText("Описание техники").value).toBe(
    "Контролируй движение.",
  );
  await user.clear(screen.getByLabelText("Описание техники"));
  await user.type(
    screen.getByLabelText("Описание техники"),
    "Новая заметка тренера.",
  );
  await user.click(screen.getByRole("button", { name: "Сохранить описание" }));
  const state = JSON.parse(localStorage.getItem("pulse-guest-data-v1"));
  expect(
    state.exercises.find((e) => e.name === "Упражнение тренера").description,
  ).toBe("Новая заметка тренера.");
  expect(state.history).toEqual([]);
});

it("deletes any set, recalculates progress, persists deletions and can add after the last set", async () => {
  localStorage.setItem("pulse-guest-mode-v1", "true");
  window.history.replaceState({}, "", "/#exercises");
  const user = userEvent.setup();
  const { container, unmount } = app();
  await user.click(
    await screen.findByRole("button", {
      name: "Добавить Жим штанги лёжа в тренировку",
    }),
  );
  fireEvent.change(screen.getByLabelText("Вес, Жим штанги лёжа, подход 1"), {
    target: { value: "30" },
  });
  fireEvent.change(screen.getByLabelText("Вес, Жим штанги лёжа, подход 3"), {
    target: { value: "50" },
  });
  await user.click(
    screen.getByRole("button", { name: "Завершить подход 1, Жим штанги лёжа" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Удалить подход 2, Жим штанги лёжа" }),
  );
  expect(container.querySelector(".workout-progress").textContent).toContain(
    "1 / 2",
  );
  expect(screen.getByLabelText("Вес, Жим штанги лёжа, подход 2").value).toBe(
    "50",
  );
  await user.click(
    screen.getByRole("button", { name: "Удалить подход 1, Жим штанги лёжа" }),
  );
  expect(container.querySelector(".workout-progress").textContent).toContain(
    "0 / 1",
  );
  expect(
    screen.getByRole("button", { name: "Завершить", exact: true }).disabled,
  ).toBe(true);
  unmount();
  const next = app();
  await screen.findByLabelText("Вес, Жим штанги лёжа, подход 1");
  expect(next.container.querySelectorAll(".set-row")).toHaveLength(1);
  expect(screen.getByLabelText("Вес, Жим штанги лёжа, подход 1").value).toBe(
    "50",
  );
  await user.click(
    screen.getByRole("button", { name: "Удалить подход 1, Жим штанги лёжа" }),
  );
  expect(
    next.container.querySelector(".progress-track > div").style.width,
  ).toBe("0%");
  expect(screen.getByText(/Подходов пока нет/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Добавить подход" }));
  expect(next.container.querySelectorAll(".set-row")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Вес, Жим штанги лёжа, подход 1"), {
    target: { value: "20" },
  });
  await user.click(
    screen.getByRole("button", { name: "Завершить подход 1, Жим штанги лёжа" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Завершить", exact: true }),
  );
  // The summary must exclude the deleted completed 30 kg set.
  const stored = JSON.parse(localStorage.getItem("pulse-guest-data-v1"));
  expect(stored.active.exercises[0].sets).toEqual([
    { weight: 20, reps: 10, done: true },
  ]);
  expect(stored.history).toEqual([]);
  await user.click(
    screen.getByRole("button", { name: "Сохранить", exact: true }),
  );
  const finished = JSON.parse(localStorage.getItem("pulse-guest-data-v1"));
  expect(finished.active).toBeNull();
  expect(finished.history[0].sets).toBe(1);
  expect(finished.history[0].volume).toBe(200);
});

it("hides administration and never requests admin data for ordinary users and guests", async () => {
  session = {
    id: "one",
    email: "uvukostya@gmail.com",
    displayName: "Анна",
    isAdmin: false,
  };
  window.history.replaceState({}, "", "/#admin");
  const first = app();
  await screen.findByText("Раздел доступен только администратору");
  expect(screen.queryByRole("button", { name: "Админ-панель" })).toBeNull();
  expect(requests.some((r) => r.path.startsWith("/api/admin/"))).toBe(false);
  first.unmount();
  session = null;
  localStorage.setItem("pulse-guest-mode-v1", "true");
  app();
  await screen.findByText("Раздел доступен только администратору");
  expect(requests.some((r) => r.path.startsWith("/api/admin/"))).toBe(false);
});

it("admin searches, validates and saves edits, then requires exact email confirmation for deletion", async () => {
  session = {
    id: "admin",
    email: "uvukostya@gmail.com",
    displayName: "Админ",
    isAdmin: true,
  };
  let person = {
    id: "person",
    email: "person@example.com",
    displayName: "Анна",
    emailVerified: true,
    blocked: false,
    createdAt: Date.now(),
    revision: 0,
    hasPassword: true,
    isAdmin: false,
  };
  let personState = {};
  const original = fetch;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path, options = {}) => {
      if (!path.startsWith("/api/admin/")) return original(path, options);
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({
        path,
        method: options.method,
        body,
        headers: options.headers,
      });
      if (path.startsWith("/api/admin/users?"))
        return Response.json({
          users: person ? [person] : [],
          total: person ? 1 : 0,
          page: 0,
          pageSize: 25,
        });
      if (path === "/api/admin/audit") return Response.json({ entries: [] });
      if (path === "/api/admin/users/person") {
        if (options.method === "PUT") {
          person = {
            ...person,
            ...body.account,
            revision: person.revision + 1,
          };
          personState = body.state;
        }
        if (options.method === "DELETE") {
          person = null;
          return Response.json({ ok: true });
        }
        return Response.json({
          user: person,
          state: personState,
          providers: [],
        });
      }
      return Response.json({ error: "not_found" }, { status: 404 });
    }),
  );
  const user = userEvent.setup();
  app();
  await user.click(await screen.findByRole("button", { name: "Админ-панель" }));
  await screen.findByRole("button", { name: /person@example.com/ });
  await user.type(
    screen.getByLabelText("Поиск пользователей"),
    "person@example.com",
  );
  await user.click(screen.getByRole("button", { name: "Найти", exact: true }));
  await waitFor(() =>
    expect(
      requests.some((r) => r.path.includes("q=person%40example.com")),
    ).toBe(true),
  );
  await user.click(
    await screen.findByRole("button", { name: /person@example.com/ }),
  );
  await screen.findByRole("dialog", { name: "Управление пользователем" });
  await user.clear(screen.getByLabelText("Имя пользователя"));
  await user.type(screen.getByLabelText("Имя пользователя"), "Мария");
  // Typing should not lose focus to the modal close button.
  expect(screen.getByLabelText("Имя пользователя").value).toBe("Мария");
  fireEvent.change(screen.getByLabelText("Тренировочных дней в неделю"), {
    target: { value: "4" },
  });
  await user.click(screen.getByText("Все тренировочные данные · JSON"));
  fireEvent.change(screen.getByLabelText("История тренировок"), {
    target: { value: "invalid JSON" },
  });
  await user.click(
    screen.getByRole("button", { name: "Сохранить пользователя" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "Проверь JSON",
  );
  expect(
    requests.some(
      (r) => r.method === "PUT" && r.path.startsWith("/api/admin/"),
    ),
  ).toBe(false);
  fireEvent.change(screen.getByLabelText("История тренировок"), {
    target: { value: "[]" },
  });
  await user.click(
    screen.getByRole("button", { name: "Сохранить пользователя" }),
  );
  await screen.findByText("Пользователь обновлён. Вход в аккаунт сохранён.");
  expect(personState.profile).toEqual({ name: "Мария", goal: 4, rest: 90 });
  const request = requests.find(
    (r) => r.path === "/api/admin/users/person" && r.method === "PUT",
  );
  expect(request.headers["X-Pulse-Account"]).toBe("admin");
  expect(request.body.account).not.toHaveProperty("password");
  await user.click(
    screen.getByRole("button", { name: "Удалить пользователя" }),
  );
  expect(
    screen.getByText(/Восстановить их через сайт невозможно/),
  ).toBeTruthy();
  await user.type(
    screen.getByLabelText("Email удаляемого аккаунта"),
    "wrong@example.com",
  );
  expect(
    screen.getByRole("button", { name: "Удалить навсегда" }).disabled,
  ).toBe(true);
  await user.clear(screen.getByLabelText("Email удаляемого аккаунта"));
  await user.type(
    screen.getByLabelText("Email удаляемого аккаунта"),
    "person@example.com",
  );
  await user.click(screen.getByRole("button", { name: "Удалить навсегда" }));
  await screen.findByText("Аккаунт удалён безвозвратно.");
  expect(person).toBeNull();
  expect(requests.find((r) => r.method === "DELETE").body).toEqual({
    revision: 1,
    email: "person@example.com",
    confirmation: "DELETE",
  });
});
