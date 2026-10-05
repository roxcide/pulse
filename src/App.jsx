import React, { useCallback, useEffect, useState } from "react";
import {
  BookOpen,
  ShieldCheck,
  Activity,
  LayoutDashboard,
  Dumbbell,
  CalendarDays,
  CalendarRange,
  Layers,
  Settings,
  ArrowUpRight,
  ArrowRight,
  Play,
  Plus,
  Flame,
  Clock3,
  Target,
  TrendingUp,
  ChevronRight,
  Check,
  Search,
  SlidersHorizontal,
  X,
  Timer,
  Pause,
  RotateCcw,
  Trash2,
  Trophy,
  Zap,
  CircleHelp,
  LogOut,
  CheckCheck,
} from "lucide-react";
import { useAuth } from "./auth/AuthProvider";
import AccountPanel from "./account/AccountPanel";
import ExerciseDetails from "./exercises/ExerciseDetails";
import AdminPanel from "./admin/AdminPanel";
import { ThemePicker } from "./theme";
import { useUserData } from "./state/UserDataProvider";
import { useStoredState } from "./hooks";
import {
  programs,
  muscles,
  equipment,
  splitExercises,
  splitOptions,
  dateKey,
  monday,
  addDays,
  fullDayNames,
} from "./data";
import {
  Modal,
  SectionHeading,
  Calendar,
  WeekSchedule,
  MuscleIcon,
} from "./components";

const navItems = [
  ["dashboard", "Обзор", LayoutDashboard],
  ["workout", "Тренировка", Dumbbell],
  ["exercises", "Упражнения", Layers],
  ["calendar", "Календарь", CalendarDays],
  ["schedule", "Моё расписание", CalendarRange],
];
const titles = {
  admin: "Администрирование",
  dashboard: "Обзор",
  workout: "Тренировка",
  exercises: "Библиотека упражнений",
  calendar: "Календарь и история",
  schedule: "Моё расписание",
  programs: "Программы тренировок",
};
const formatTime = (seconds) =>
  `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, "0")}:${String(Math.max(0, seconds) % 60).padStart(2, "0")}`;

export default function App() {
  const { user, isGuest } = useAuth();
  const { status } = useUserData();
  const [page, setPage] = useState(() => {
    const hash = location.hash.slice(1);
    return titles[hash] ? hash : "dashboard";
  });
  const [exercises, setExercises] = useStoredState("exercises");
  const [split, setSplit] = useStoredState("split");
  const [history, setHistory] = useStoredState("history");
  const [plans, setPlans] = useStoredState("plans", []);
  const [active, setActive] = useStoredState("active", null);
  const [profile, setProfile] = useStoredState("profile");
  const [modal, setModal] = useState(null),
    [toast, setToast] = useState("");
  const [accountBusy, setAccountBusy] = useState(false);
  const closeModal = useCallback(() => {
    if (!accountBusy) setModal(null);
  }, [accountBusy]);
  const [month, setMonth] = useState(new Date()),
    [selected, setSelected] = useState(dateKey(new Date()));
  const [weekView, setWeekView] = useState(false),
    [query, setQuery] = useState(""),
    [muscle, setMuscle] = useState("Все группы"),
    [gear, setGear] = useState("Любое оборудование");
  const [now, setNow] = useState(Date.now());
  const today = dateKey(new Date()),
    dayIndex = (new Date().getDay() + 6) % 7;
  const todayName =
    plans.find((p) => p.date === today)?.name || split[dayIndex];
  const weekHistory = history.filter(
    (h) => h.date >= dateKey(monday(new Date())) && h.date <= today,
  );
  const monthHistory = history.filter(
    (h) => h.date.slice(0, 7) === today.slice(0, 7),
  );
  const weekDays = new Set(weekHistory.map((h) => h.date)).size;
  const elapsed = active ? Math.floor((now - active.startedAt) / 1000) : 0;
  const restLeft = active?.restEndsAt
    ? Math.max(0, Math.ceil((active.restEndsAt - Date.now()) / 1000))
    : 0;
  const completed =
    active?.exercises.reduce(
      (sum, e) => sum + e.sets.filter((s) => s.done).length,
      0,
    ) || 0;
  const totalSets =
    active?.exercises.reduce((sum, e) => sum + e.sets.length, 0) || 0;

  useEffect(() => {
    const handle = () => {
      const key = location.hash.slice(1);
      if (titles[key]) setPage(key);
    };
    window.addEventListener("hashchange", handle);
    return () => window.removeEventListener("hashchange", handle);
  }, []);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [!!active]);
  useEffect(() => {
    if (active?.restEndsAt && restLeft === 0) {
      setActive((a) => ({ ...a, restEndsAt: null }));
      notify("Отдых завершён. К следующему подходу!");
    }
  }, [restLeft, active?.restEndsAt]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(id);
  }, [toast]);
  function navigate(next) {
    setPage(next);
    location.hash = next;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function notify(message) {
    setToast(message);
  }
  function startWorkout(name, ids) {
    if (active) {
      navigate("workout");
      notify("Продолжаем текущую тренировку");
      return;
    }
    if (name === "Не запланировано") {
      navigate("programs");
      return;
    }
    if (name === "Отдых") {
      setModal({ type: "rest" });
      return;
    }
    const list = ids || splitExercises[name] || programs[0].exercises;
    setNow(Date.now());
    setActive({
      id: crypto.randomUUID(),
      name,
      date: today,
      startedAt: Date.now(),
      restEndsAt: null,
      exercises: list.map((id) => {
        const e = exercises.find((e) => e.id === id);
        return {
          ...e,
          sets: Array.from({ length: 3 }, () => ({
            reps: e.reps,
            weight: e.weight,
            done: false,
          })),
        };
      }),
    });
    navigate("workout");
    setModal(null);
  }
  function updateSet(ei, si, field, value) {
    setActive((a) => ({
      ...a,
      exercises: a.exercises.map((e, i) =>
        i === ei
          ? {
              ...e,
              sets: e.sets.map((s, j) =>
                j === si ? { ...s, [field]: value } : s,
              ),
            }
          : e,
      ),
    }));
  }
  function removeSet(ei, si) {
    setActive((workout) => ({
      ...workout,
      exercises: workout.exercises.map((exercise, index) =>
        index === ei
          ? {
              ...exercise,
              sets: exercise.sets.filter((_, setIndex) => setIndex !== si),
            }
          : exercise,
      ),
    }));
  }
  function toggleSet(ei, si) {
    const value = !active.exercises[ei].sets[si].done;
    setActive((a) => ({
      ...a,
      restEndsAt: value ? Date.now() + profile.rest * 1000 : a.restEndsAt,
      restPaused: null,
      exercises: a.exercises.map((e, i) =>
        i === ei
          ? {
              ...e,
              sets: e.sets.map((s, j) =>
                j === si ? { ...s, done: value } : s,
              ),
            }
          : e,
      ),
    }));
  }
  function finishWorkout() {
    const entry = {
      id: active.id,
      date: active.date,
      name: active.name,
      duration: Math.max(1, Math.round(elapsed / 60)),
      sets: completed,
      volume: active.exercises.reduce(
        (sum, e) =>
          sum +
          e.sets
            .filter((s) => s.done)
            .reduce((n, s) => n + Number(s.weight) * Number(s.reps), 0),
        0,
      ),
      exercises: active.exercises,
    };
    setHistory((h) => [entry, ...h]);
    setPlans((p) =>
      p.filter((p) => !(p.date === active.date && p.name === active.name)),
    );
    setActive(null);
    setModal(null);
    navigate("calendar");
    setSelected(entry.date);
    setMonth(new Date(entry.date + "T12:00:00"));
    notify("Тренировка сохранена. Отличная работа!");
  }
  function weeklyBars(metric) {
    const values = Array.from({ length: 7 }, (_, i) => {
      const records = history.filter(
        (h) => h.date === dateKey(addDays(new Date(), i - 6)),
      );
      return metric === "count"
        ? records.length
        : records.reduce((sum, h) => sum + h[metric], 0);
    });
    const max = Math.max(1, ...values);
    return values.map((value) => Math.round((value / max) * 38));
  }
  function selectDate(key) {
    setMonth(new Date(key + "T12:00:00"));
    setSelected(key);
  }
  const filtered = exercises.filter(
    (e) =>
      e.name.toLowerCase().includes(query.toLowerCase()) &&
      (muscle === "Все группы" || e.muscle === muscle) &&
      (gear === "Любое оборудование" || e.equipment === gear),
  );

  function ProgramCards() {
    return (
      <div className="program-grid">
        {programs.map((p, i) => (
          <button
            className="program-card"
            key={p.id}
            onClick={() => setModal({ type: "program", program: p })}
          >
            <div
              className="program-photo"
              style={{ backgroundImage: `url(${p.image})` }}
            >
              <span className={`program-tag tag-${i}`}>{p.tag}</span>
              <span className="program-open">
                <ArrowUpRight size={19} />
              </span>
            </div>
            <div className="program-content">
              <span className="eyebrow">{p.eyebrow}</span>
              <h3>{p.name}</h3>
              <p>{p.desc}</p>
              <div className="program-meta">
                <span>
                  <Clock3 size={13} />
                  {p.time} мин
                </span>
                <span>
                  <Activity size={13} />
                  {p.level}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  }
  function Hero() {
    return (
      <section className="workout-hero">
        <div className="hero-content">
          <div className="hero-eyebrow">
            <span className="live-dot" />
            ТВОЯ СЛЕДУЮЩАЯ ПОБЕДА
          </div>
          <h2>
            {active
              ? "Продолжай\nв своём ритме."
              : todayName === "Отдых"
                ? "Восстановление —\nтоже прогресс."
                : todayName === "Не запланировано"
                  ? "Твоя история\nначинается здесь."
                  : "Сильнее\nс каждым днём."}
          </h2>
          <p>
            {todayName === "Отдых"
              ? "Дай телу отдохнуть. Завтра — новый шаг вперёд."
              : todayName === "Не запланировано"
                ? "Выбери программу и начни первую тренировку."
                : "Не нужно быть идеальным. Просто продолжай."}
          </p>
          <div className="hero-workout">
            <div className="hero-workout-icon">
              <Dumbbell size={23} />
            </div>
            <div>
              <strong>{active?.name || todayName}</strong>
              <span>
                {todayName === "Отдых"
                  ? "Твой день восстановления"
                  : todayName === "Не запланировано"
                    ? "План на сегодня пока пуст"
                    : `${(splitExercises[todayName] || programs[0].exercises).length} упражнений`}
                <i />
                {todayName === "Отдых"
                  ? "Без спешки"
                  : todayName === "Не запланировано"
                    ? "В твоём темпе"
                    : "≈ 50 минут"}
              </span>
            </div>
          </div>
          <button
            className="primary-button"
            onClick={() =>
              active ? navigate("workout") : startWorkout(todayName)
            }
          >
            <Play size={17} fill="currentColor" />
            {active
              ? "Продолжить тренировку"
              : todayName === "Отдых"
                ? "Выбрать тренировку"
                : todayName === "Не запланировано"
                  ? "Выбрать тренировку"
                  : "Начать тренировку"}
            <ArrowRight size={18} />
          </button>
        </div>
        <div className="hero-corner">
          SHOW UP. <span>LEVEL UP.</span>
        </div>
        <div className="hero-image-credit">ТВОЙ РИТМ. ТВОЙ ПРОГРЕСС.</div>
      </section>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button
          className="brand"
          aria-label="PULSE — на главную"
          onClick={() => navigate("dashboard")}
        >
          <span className="brand-symbol">
            <Activity size={26} strokeWidth={2.5} />
          </span>
          PULSE<span className="brand-period">.</span>
        </button>
        <div className="workspace-label">ТВОЁ ПРОСТРАНСТВО</div>
        <nav aria-label="Основная навигация">
          {navItems.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={19} />
              <span>{label}</span>
              {id === "workout" && active ? (
                <span className="nav-live" />
              ) : page === id ? (
                <span className="nav-active-dot" />
              ) : null}
            </button>
          ))}
        </nav>
        <div className="sidebar-divider" />
        <button
          className={`nav-item ${page === "programs" ? "active" : ""}`}
          onClick={() => navigate("programs")}
        >
          <Zap size={19} />
          <span>Готовые программы</span>
        </button>
        <div className="sidebar-bottom">
          <div className="motivation-card">
            <div className="motivation-icon">
              <Flame size={20} />
            </div>
            <h3>
              Маленькие шаги.
              <br />
              Большие перемены.
            </h3>
            <p>
              Твой единственный соперник —<br />
              ты вчерашний.
            </p>
            <div className="motivation-line" />
          </div>
          <button
            className="nav-item"
            onClick={() => setModal({ type: "settings" })}
          >
            <Settings size={18} />
            <span>Настройки</span>
          </button>
          <button
            className="profile"
            aria-label="Открыть аккаунт"
            onClick={() => setModal({ type: "account" })}
          >
            <div className="avatar">
              {profile.name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{profile.name}</strong>
              <span>{isGuest ? "Гостевой режим" : "Личный профиль"}</span>
            </div>
            <ChevronRight size={16} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            Моё пространство
            <ChevronRight size={13} />
            <span>{titles[page]}</span>
          </div>
          <div className="topbar-right">
            {user.isAdmin && !isGuest && (
              <button
                className="icon-button"
                aria-label="Админ-панель"
                onClick={() => navigate("admin")}
              >
                <ShieldCheck size={20} />
              </button>
            )}
            <span className="demo-label">
              <span />
              {status === "saving"
                ? "Сохраняем…"
                : status === "error"
                  ? "Не сохранено"
                  : isGuest
                    ? "Сохранено в браузере"
                    : "Сохранено в облаке"}
            </span>
            <button
              className="icon-button help-button"
              aria-label="О приложении"
              onClick={() => setModal({ type: "help" })}
            >
              <CircleHelp size={19} />
            </button>
            <button
              className="icon-button"
              aria-label="Настройки профиля"
              onClick={() => setModal({ type: "settings" })}
            >
              <Settings size={19} />
            </button>
            <button
              className="avatar small"
              aria-label="Аккаунт"
              onClick={() => setModal({ type: "account" })}
            >
              {profile.name.slice(0, 1).toUpperCase()}
            </button>
          </div>
        </header>
        <main key={page} className="main-content">
          <div className="page-heading">
            <div>
              <div className="eyebrow greeting-eyebrow">
                {page === "dashboard"
                  ? "КАЖДЫЙ ДЕНЬ — НОВАЯ ВОЗМОЖНОСТЬ"
                  : "ТВОЙ РИТМ. ТВОЙ ПРОГРЕСС."}
              </div>
              <h1>
                {page === "dashboard" ? (
                  <>
                    В твоём ритме, {profile.name}
                    <span className="greeting-dot">.</span>
                  </>
                ) : (
                  titles[page]
                )}
              </h1>
              <p>
                {
                  {
                    dashboard:
                      "Тренируйся осознанно. Следи за прогрессом. Становись сильнее.",
                    workout: active
                      ? "Сконцентрируйся на движении. Мы позаботимся о цифрах."
                      : "Хорошая тренировка начинается с первого подхода.",
                    exercises: "Найди своё движение и добавь его в тренировку.",
                    calendar: "Каждая тренировка — часть твоей истории.",
                    schedule: "Создай ритм, который подходит именно тебе.",
                    programs: "Меньше планирования. Больше движения.",
                  }[page]
                }
              </p>
            </div>
            <div className="heading-date">
              <CalendarDays size={16} />
              {new Date()
                .toLocaleDateString("ru-RU", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })
                .replace(" г.", "")}
              <span className="date-day">
                {new Date().toLocaleDateString("ru-RU", { weekday: "short" })}
              </span>
            </div>
          </div>

          {page === "admin" &&
            (user.isAdmin && !isGuest ? (
              <AdminPanel />
            ) : (
              <div className="empty-state">
                <ShieldCheck size={30} />
                <h3>Раздел доступен только администратору</h3>
                <button
                  className="secondary-button"
                  onClick={() => navigate("dashboard")}
                >
                  На главную
                </button>
              </div>
            ))}
          {page === "dashboard" && (
            <>
              <div className="dashboard-top">
                <Hero />
                <section className="panel week-goal">
                  <div className="panel-heading">
                    <h3>Твоя неделя</h3>
                    <span className="subtle-tag">
                      {monday(new Date())
                        .toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                        })
                        .replace(".", "")}{" "}
                      –{" "}
                      {addDays(monday(new Date()), 6)
                        .toLocaleDateString("ru-RU", {
                          day: "numeric",
                          month: "short",
                        })
                        .replace(".", "")}
                    </span>
                  </div>
                  <div
                    className="goal-ring"
                    style={{
                      "--progress": `${Math.min(100, profile.goal ? (weekDays / profile.goal) * 100 : 0)}%`,
                    }}
                  >
                    <div>
                      <strong>
                        {weekDays}
                        <span> / {profile.goal || "—"}</span>
                      </strong>
                      <span>тренировки</span>
                    </div>
                  </div>
                  <div className="goal-message">
                    <span className="lime">
                      <TrendingUp size={16} />
                    </span>
                    {!profile.goal
                      ? "Выбери недельную цель"
                      : weekDays >= profile.goal
                        ? "Недельная цель достигнута!"
                        : `Ещё ${Math.max(0, profile.goal - weekDays)} до недельной цели`}
                  </div>
                  <p>Стабильность важнее совершенства.</p>
                  <button
                    className="text-button"
                    onClick={() => setModal({ type: "goal" })}
                  >
                    Изменить цель
                    <ArrowUpRight size={14} />
                  </button>
                </section>
              </div>
              <div className="stats-grid">
                {[
                  {
                    icon: Dumbbell,
                    value: history.length,
                    label: "Всего тренировок",
                    note: `+${monthHistory.length} в этом месяце`,
                    graph: weeklyBars("count"),
                  },
                  {
                    icon: Clock3,
                    value: (
                      history.reduce((s, h) => s + h.duration, 0) / 60
                    ).toFixed(1),
                    unit: "ч",
                    label: "Время в зале",
                    note: "Каждая минута в дело",
                    graph: weeklyBars("duration"),
                  },
                  {
                    icon: Flame,
                    value: (
                      history.reduce((s, h) => s + h.volume, 0) / 1000
                    ).toFixed(1),
                    unit: "т",
                    label: "Поднятый вес",
                    note: "Твоя накопленная сила",
                    graph: weeklyBars("volume"),
                  },
                  {
                    icon: Target,
                    value: weekDays,
                    unit: `/ ${profile.goal || "—"}`,
                    label: "Тренировок за неделю",
                    note: !profile.goal
                      ? "Цель пока не задана"
                      : weekDays >= profile.goal
                        ? "Цель выполнена"
                        : "Держи свой темп",
                    graph: weeklyBars("count"),
                  },
                ].map((s, i) => (
                  <div className="stat-card" key={s.label}>
                    <div className="stat-top">
                      <span>{s.label}</span>
                      <s.icon size={17} />
                    </div>
                    <div className="stat-main">
                      <strong>
                        {s.value}
                        <small>{s.unit}</small>
                      </strong>
                      <div
                        className={`sparkline spark-${i}`}
                        role="img"
                        aria-label="Активность за последние 7 дней"
                      >
                        {s.graph.map((h, j) => (
                          <i key={j} style={{ height: h }} />
                        ))}
                      </div>
                    </div>
                    <div className="stat-note">
                      {i === 0 && <TrendingUp size={12} />} {s.note}
                    </div>
                  </div>
                ))}
              </div>
              <section className="schedule-section">
                <SectionHeading
                  title="Твой план на неделю"
                  action="Настроить расписание"
                  onAction={() => navigate("schedule")}
                />
                <WeekSchedule
                  split={split}
                  history={history}
                  onStart={(name, i) => {
                    setSelected(dateKey(addDays(monday(new Date()), i)));
                    setMonth(new Date());
                    navigate("calendar");
                  }}
                />
              </section>
              <div className="dashboard-bottom">
                <section className="program-section">
                  <SectionHeading
                    title="Найди свою программу"
                    action="Все программы"
                    onAction={() => navigate("programs")}
                  />
                  <ProgramCards />
                </section>
                <section className="mini-calendar-section">
                  <SectionHeading
                    title="Календарь"
                    action="История"
                    onAction={() => navigate("calendar")}
                  />
                  <div className="panel">
                    <Calendar
                      month={month}
                      setMonth={setMonth}
                      selected={selected}
                      onSelect={(key) => {
                        selectDate(key);
                        navigate("calendar");
                      }}
                      history={history}
                      plans={plans}
                      compact
                    />
                  </div>
                </section>
              </div>
              <footer className="page-footer">
                <span>
                  <Activity size={14} />
                  Создавай привычку. Результат придёт.
                </span>
                <span>PULSE © {new Date().getFullYear()}</span>
              </footer>
            </>
          )}

          {page === "programs" && (
            <>
              <div className="program-banner">
                <Zap size={25} />
                <div>
                  <h3>План есть. Осталось начать.</h3>
                  <p>
                    Выбери программу — упражнения и подходы уже подготовлены.
                  </p>
                </div>
              </div>
              <ProgramCards />
            </>
          )}

          {page === "exercises" && (
            <>
              <div className="library-toolbar">
                <label className="search-field">
                  <Search size={19} />
                  <input
                    aria-label="Поиск упражнений"
                    placeholder="Найти упражнение…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      className="icon-button"
                      aria-label="Очистить поиск"
                      onClick={() => setQuery("")}
                    >
                      <X size={16} />
                    </button>
                  )}
                </label>
                <label className="select-field">
                  <SlidersHorizontal size={17} />
                  <select
                    aria-label="Оборудование"
                    value={gear}
                    onChange={(e) => setGear(e.target.value)}
                  >
                    {equipment.map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <button
                  className="primary-button"
                  onClick={() => setModal({ type: "exercise" })}
                >
                  <Plus size={18} />
                  Своё упражнение
                </button>
              </div>
              <div className="filter-chips">
                {muscles.map((m) => (
                  <button
                    className={m === muscle ? "active" : ""}
                    key={m}
                    onClick={() => setMuscle(m)}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <div className="result-count">
                Найдено упражнений: {filtered.length}
              </div>
              <div className="exercise-library">
                {filtered.map((e) => (
                  <article className="exercise-card" key={e.id}>
                    <button
                      className="exercise-details-trigger"
                      aria-label={`Техника: ${e.name}`}
                      onClick={() =>
                        setModal({ type: "exerciseDetails", exercise: e })
                      }
                    >
                      <span className="exercise-symbol">
                        <MuscleIcon muscle={e.muscle} size={28} />
                      </span>
                      <span className="exercise-card-copy">
                        <span className="eyebrow">{e.muscle}</span>
                        <span className="exercise-card-name">{e.name}</span>
                        <span className="exercise-card-meta">
                          {e.equipment} <span>·</span> 3 × {e.reps} повторений
                        </span>
                        <span className="exercise-technique-link">
                          Техника выполнения <ChevronRight size={14} />
                        </span>
                      </span>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={`Добавить ${e.name} в тренировку`}
                      onClick={() => {
                        if (active) {
                          if (active.exercises.some((x) => x.id === e.id)) {
                            notify("Это упражнение уже есть в тренировке");
                            return;
                          }
                          setActive((a) => ({
                            ...a,
                            exercises: [
                              ...a.exercises,
                              {
                                ...e,
                                sets: Array.from({ length: 3 }, () => ({
                                  reps: e.reps,
                                  weight: e.weight,
                                  done: false,
                                })),
                              },
                            ],
                          }));
                          notify("Упражнение добавлено в тренировку");
                        } else startWorkout("Своя тренировка", [e.id]);
                      }}
                    >
                      <Plus size={21} />
                    </button>
                  </article>
                ))}
              </div>
              {filtered.length === 0 && (
                <div className="empty-state">
                  <Search size={30} />
                  <h3>Ничего не нашлось</h3>
                  <p>Попробуй другое название или сбрось фильтры.</p>
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setQuery("");
                      setMuscle(muscles[0]);
                      setGear(equipment[0]);
                    }}
                  >
                    Сбросить фильтры
                  </button>
                </div>
              )}
            </>
          )}

          {page === "schedule" && (
            <>
              <div className="section-heading">
                <h2>Твоя идеальная неделя</h2>
                <span className="subtle-tag">
                  {
                    split.filter(
                      (s) => !["Отдых", "Не запланировано"].includes(s),
                    ).length
                  }{" "}
                  тренировок в неделю
                </span>
              </div>
              <WeekSchedule
                split={split}
                history={history}
                large
                onEdit={(i) => setModal({ type: "split", day: i })}
              />
              <div className="info-note">
                <CalendarRange size={21} />
                <div>
                  <strong>Расписание, которое работает на тебя</strong>
                  <p>
                    Нажми на любой день, чтобы выбрать группы мышц. Недельный
                    сплит повторяется автоматически. Для разовой тренировки
                    выбери дату в календаре.
                  </p>
                </div>
              </div>
              <SectionHeading title="Готов начать?" />
              <div className="schedule-hero">
                <Hero />
              </div>
            </>
          )}

          {page === "calendar" && (
            <>
              <div className="calendar-toolbar">
                <div className="segmented-control">
                  <button
                    className={!weekView ? "active" : ""}
                    onClick={() => setWeekView(false)}
                  >
                    Месяц
                  </button>
                  <button
                    className={weekView ? "active" : ""}
                    onClick={() => {
                      setWeekView(true);
                      setMonth(new Date(selected + "T12:00:00"));
                    }}
                  >
                    Неделя
                  </button>
                </div>
                <div className="inline-actions">
                  <button
                    className="secondary-button"
                    onClick={() => {
                      setMonth(new Date());
                      setSelected(today);
                    }}
                  >
                    Сегодня
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => setModal({ type: "plan", date: selected })}
                  >
                    <Plus size={17} />
                    Запланировать
                  </button>
                </div>
              </div>
              <div className="history-layout">
                <section className="panel full-calendar">
                  <Calendar
                    month={month}
                    setMonth={setMonth}
                    selected={selected}
                    onSelect={selectDate}
                    history={history}
                    plans={plans}
                    weekView={weekView}
                  />
                  <div className="calendar-legend">
                    <span>
                      <i />
                      Выполнено
                    </span>
                    <span>
                      <i className="planned-dot" />
                      Запланировано
                    </span>
                  </div>
                </section>
                <section className="panel selected-day">
                  <span className="eyebrow">ТВОЙ ДЕНЬ</span>
                  <h2>
                    {new Date(selected + "T12:00:00").toLocaleDateString(
                      "ru-RU",
                      { day: "numeric", month: "long" },
                    )}
                  </h2>
                  <p className="muted">
                    {new Date(selected + "T12:00:00").toLocaleDateString(
                      "ru-RU",
                      { weekday: "long" },
                    )}
                  </p>
                  {history
                    .filter((h) => h.date === selected)
                    .map((h) => (
                      <button
                        className="day-workout"
                        key={h.id}
                        onClick={() => setModal({ type: "history", entry: h })}
                      >
                        <span className="completed-label">
                          <CheckCheck size={15} />
                          Выполнено
                        </span>
                        <h3>{h.name}</h3>
                        <p>
                          {h.duration} мин <span>·</span> {h.sets} подходов
                        </p>
                        <span className="text-button">
                          Посмотреть
                          <ArrowUpRight size={14} />
                        </span>
                      </button>
                    ))}
                  {plans
                    .filter((p) => p.date === selected)
                    .map((p) => (
                      <div className="day-workout planned" key={p.id}>
                        <div className="panel-heading">
                          <span className="planned-label">Запланировано</span>
                          <button
                            className="icon-button"
                            aria-label="Удалить план"
                            onClick={() =>
                              setPlans((all) =>
                                all.filter((item) => item.id !== p.id),
                              )
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <h3>{p.name}</h3>
                        <button
                          className="text-button"
                          onClick={() => startWorkout(p.name)}
                        >
                          Начать сейчас
                          <Play size={13} />
                        </button>
                      </div>
                    ))}
                  {!history.some((h) => h.date === selected) &&
                    !plans.some((p) => p.date === selected) && (
                      <div className="day-empty">
                        <CalendarDays size={28} />
                        <p>
                          {selected < today
                            ? "Тренировок не записано"
                            : "Пока никаких планов"}
                        </p>
                        <span>
                          {selected < today
                            ? "Каждый новый день — возможность начать."
                            : `По сплиту: ${split[(new Date(selected + "T12:00:00").getDay() + 6) % 7]}`}
                        </span>
                      </div>
                    )}
                  <button
                    className="secondary-button full-width"
                    onClick={() => setModal({ type: "plan", date: selected })}
                  >
                    <Plus size={16} />
                    Добавить тренировку
                  </button>
                </section>
              </div>
              <SectionHeading title="Последние тренировки" />
              <div className="history-list">
                {[...history]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 10)
                  .map((h) => (
                    <button
                      className="history-row"
                      key={h.id}
                      onClick={() => setModal({ type: "history", entry: h })}
                    >
                      <span className="history-icon">
                        <Dumbbell size={21} />
                      </span>
                      <div>
                        <strong>{h.name}</strong>
                        <span>
                          {new Date(h.date + "T12:00:00").toLocaleDateString(
                            "ru-RU",
                            { day: "numeric", month: "long" },
                          )}
                        </span>
                      </div>
                      <span>
                        <Clock3 size={14} />
                        {h.duration} мин
                      </span>
                      <span>{h.sets} подходов</span>
                      <span className="history-volume">
                        {h.volume.toLocaleString("ru-RU")} кг
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                {history.length === 0 && (
                  <p className="muted">
                    Здесь появятся твои завершённые тренировки.
                  </p>
                )}
              </div>
            </>
          )}

          {page === "workout" &&
            (active ? (
              <>
                <div className="workout-status panel">
                  <div>
                    <span className="eyebrow">
                      <span className="live-dot" />
                      ТРЕНИРОВКА ИДЁТ
                    </span>
                    <h2>{active.name}</h2>
                  </div>
                  <div className="elapsed">
                    <Clock3 size={19} />
                    {formatTime(elapsed)}
                  </div>
                  <button
                    className="primary-button"
                    disabled={!completed}
                    onClick={() => setModal({ type: "finish" })}
                  >
                    <Check size={17} />
                    Завершить
                  </button>
                </div>
                <div className="workout-progress">
                  <div>
                    <span>Твой прогресс</span>
                    <strong>
                      {completed} / {totalSets} подходов
                    </strong>
                  </div>
                  <div className="progress-track">
                    <div
                      style={{
                        width: `${totalSets ? (completed / totalSets) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="workout-layout">
                  <div className="active-exercises">
                    {active.exercises.map((e, ei) => (
                      <section
                        className="panel active-exercise"
                        key={`${e.id}-${ei}`}
                      >
                        <div className="active-exercise-heading">
                          <span className="exercise-number">
                            {String(ei + 1).padStart(2, "0")}
                          </span>
                          <div>
                            <h3>
                              <button
                                className="exercise-name-button"
                                aria-label={`Техника: ${e.name}`}
                                onClick={() =>
                                  setModal({
                                    type: "exerciseDetails",
                                    exercise:
                                      exercises.find(
                                        (item) => item.id === e.id,
                                      ) || e,
                                  })
                                }
                              >
                                {e.name}
                                <BookOpen size={16} />
                              </button>
                            </h3>
                            <span>
                              {e.muscle} <i>·</i> {e.equipment}
                            </span>
                          </div>
                          <button
                            className="icon-button"
                            aria-label={`Удалить ${e.name}`}
                            onClick={() =>
                              setModal({
                                type: "removeExercise",
                                index: ei,
                                name: e.name,
                              })
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <div className="set-header">
                          <span>Подход</span>
                          <span>Вес, кг</span>
                          <span>Повторения</span>
                          <span>Готово</span>
                          <span aria-hidden="true" />
                        </div>
                        {e.sets.map((s, si) => (
                          <div
                            className={`set-row ${s.done ? "done" : ""}`}
                            key={si}
                          >
                            <span>{si + 1}</span>
                            <input
                              type="number"
                              min="0"
                              max="1000"
                              step="0.5"
                              aria-label={`Вес, ${e.name}, подход ${si + 1}`}
                              value={s.weight}
                              disabled={s.done}
                              onChange={(ev) =>
                                updateSet(
                                  ei,
                                  si,
                                  "weight",
                                  Math.max(
                                    0,
                                    Math.min(1000, Number(ev.target.value)),
                                  ),
                                )
                              }
                            />
                            <input
                              type="number"
                              min="1"
                              max="500"
                              aria-label={`Повторения, ${e.name}, подход ${si + 1}`}
                              value={s.reps}
                              disabled={s.done}
                              onChange={(ev) =>
                                updateSet(
                                  ei,
                                  si,
                                  "reps",
                                  Math.max(
                                    1,
                                    Math.min(
                                      500,
                                      Math.floor(Number(ev.target.value)),
                                    ),
                                  ),
                                )
                              }
                            />
                            <button
                              className="set-check"
                              aria-label={`Завершить подход ${si + 1}, ${e.name}`}
                              aria-pressed={s.done}
                              onClick={() => toggleSet(ei, si)}
                            >
                              <Check size={20} />
                            </button>
                            <button
                              className="icon-button remove-set"
                              aria-label={`Удалить подход ${si + 1}, ${e.name}`}
                              onClick={() => removeSet(ei, si)}
                            >
                              <Trash2 size={17} />
                            </button>
                          </div>
                        ))}
                        {e.sets.length === 0 && (
                          <p className="no-sets">
                            Подходов пока нет. Добавь первый, когда будешь
                            готов.
                          </p>
                        )}
                        <button
                          className="text-button add-set"
                          onClick={() =>
                            setActive((a) => ({
                              ...a,
                              exercises: a.exercises.map((item, i) =>
                                i === ei
                                  ? {
                                      ...item,
                                      sets: [
                                        ...item.sets,
                                        {
                                          weight:
                                            item.sets.at(-1)?.weight ??
                                            item.weight ??
                                            0,
                                          reps:
                                            item.sets.at(-1)?.reps ??
                                            item.reps ??
                                            10,
                                          done: false,
                                        },
                                      ],
                                    }
                                  : item,
                              ),
                            }))
                          }
                        >
                          <Plus size={15} />
                          Добавить подход
                        </button>
                      </section>
                    ))}
                    <button
                      className="secondary-button full-width"
                      onClick={() => navigate("exercises")}
                    >
                      <Plus size={17} />
                      Добавить упражнение
                    </button>
                  </div>
                  <aside className="workout-side">
                    <section className="panel rest-timer">
                      <div className="panel-heading">
                        <h3>Время на отдых</h3>
                        <Timer size={19} />
                      </div>
                      <div
                        className={`timer-display ${restLeft > 0 ? "running" : ""}`}
                      >
                        {formatTime(active.restPaused ?? restLeft)}
                      </div>
                      <p aria-live="polite">
                        {restLeft > 0
                          ? "Вдохни. Выдохни. Ты отлично справляешься."
                          : active.restPaused
                            ? "Таймер на паузе"
                            : "Таймер запускается после подхода"}
                      </p>
                      <div className="timer-presets">
                        {[60, 90, 120].map((t) => (
                          <button
                            className={profile.rest === t ? "active" : ""}
                            key={t}
                            onClick={() => {
                              setProfile((p) => ({ ...p, rest: t }));
                              setActive((a) => ({
                                ...a,
                                restEndsAt: Date.now() + t * 1000,
                                restPaused: null,
                              }));
                            }}
                          >
                            {t} сек
                          </button>
                        ))}
                      </div>
                      <div className="timer-controls">
                        <button
                          className="secondary-button"
                          aria-label="Перезапустить таймер"
                          onClick={() =>
                            setActive((a) => ({
                              ...a,
                              restEndsAt: Date.now() + profile.rest * 1000,
                              restPaused: null,
                            }))
                          }
                        >
                          <RotateCcw size={17} />
                        </button>
                        <button
                          className="primary-button"
                          onClick={() =>
                            setActive((a) => ({
                              ...a,
                              restEndsAt: restLeft
                                ? null
                                : Date.now() +
                                  (a.restPaused || profile.rest) * 1000,
                              restPaused: restLeft || null,
                            }))
                          }
                        >
                          {restLeft ? <Pause size={17} /> : <Play size={17} />}{" "}
                          {restLeft
                            ? "Пауза"
                            : active.restPaused
                              ? "Продолжить"
                              : "Начать"}
                        </button>
                        <button
                          className="secondary-button"
                          aria-label="Пропустить отдых"
                          onClick={() =>
                            setActive((a) => ({
                              ...a,
                              restEndsAt: null,
                              restPaused: null,
                            }))
                          }
                        >
                          <Check size={17} />
                        </button>
                      </div>
                    </section>
                    <div className="workout-tip">
                      <Zap size={20} />
                      <p>
                        Техника важнее цифр.
                        <br />
                        <span>
                          Выбирай вес, с которым контролируешь каждое
                          повторение.
                        </span>
                      </p>
                    </div>
                    <button
                      className="text-button danger"
                      onClick={() => setModal({ type: "cancelWorkout" })}
                    >
                      <LogOut size={15} />
                      Отменить тренировку
                    </button>
                  </aside>
                </div>
              </>
            ) : (
              <>
                <div className="workout-empty-grid">
                  <Hero />
                  <div className="panel empty-workout-panel">
                    <Dumbbell size={44} />
                    <h2>
                      Твоя тренировка.
                      <br />
                      Твои правила.
                    </h2>
                    <p>
                      Начни с программы или собери свою тренировку из библиотеки
                      упражнений.
                    </p>
                    <button
                      className="secondary-button"
                      onClick={() => navigate("exercises")}
                    >
                      <Plus size={17} />
                      Собрать тренировку
                    </button>
                  </div>
                </div>
                <SectionHeading title="Или попробуй готовую программу" />
                <ProgramCards />
              </>
            ))}
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {navItems.map(([id, label, Icon]) => (
          <button
            key={id}
            className={page === id ? "active" : ""}
            onClick={() => navigate(id)}
          >
            <Icon size={21} />
            <span>
              {id === "schedule"
                ? "План"
                : id === "exercises"
                  ? "Библиотека"
                  : label}
            </span>
            {id === "workout" && active && <i />}
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <span>
            <Check size={17} />
          </span>
          {toast}
          <button
            className="icon-button"
            aria-label="Закрыть уведомление"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {modal && (
        <Modal
          title={
            {
              settings: "Твои настройки",
              goal: "Твоя недельная цель",
              account: "Твой аккаунт",
              exercise: "Новое упражнение",
              exerciseDetails: modal.exercise?.name,
              split: fullDayNames[modal.day],
              plan: "План на тренировку",
              program: modal.program?.name,
              finish: "Отличная работа!",
              cancelWorkout: "Отменить тренировку?",
              removeExercise: "Убрать упражнение?",
              rest: "Сегодня — день восстановления",
              help: "Добро пожаловать в PULSE",
              history: modal.entry?.name,
            }[modal.type]
          }
          onClose={closeModal}
          busy={accountBusy}
        >
          {modal.type === "exerciseDetails" && (
            <ExerciseDetails
              exercise={modal.exercise}
              onSaveDescription={(description) => {
                setExercises((list) =>
                  list.map((exercise) =>
                    exercise.id === modal.exercise.id
                      ? { ...exercise, description }
                      : exercise,
                  ),
                );
                setModal(null);
                notify("Описание сохранено");
              }}
            />
          )}
          {modal.type === "account" && (
            <AccountPanel onBusyChange={setAccountBusy} />
          )}
          {modal.type === "settings" && (
            <>
              <ThemePicker />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  setProfile((previous) => ({
                    ...previous,
                    name: data.get("name").trim() || "Атлет",
                    rest: Number(data.get("rest")),
                  }));
                  setModal(null);
                  notify("Настройки сохранены");
                }}
              >
                <label className="form-field">
                  Как тебя зовут
                  <input
                    name="name"
                    defaultValue={profile.name}
                    maxLength="24"
                    required
                  />
                </label>
                <label className="form-field">
                  Отдых между подходами
                  <select name="rest" defaultValue={profile.rest}>
                    {[30, 60, 90, 120, 180].map((n) => (
                      <option key={n} value={n}>
                        {n} секунд
                      </option>
                    ))}
                  </select>
                </label>
                <button className="primary-button full-width" type="submit">
                  Сохранить настройки
                  <Check size={17} />
                </button>
              </form>
            </>
          )}
          {modal.type === "goal" && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const goal = Number(
                  new FormData(event.currentTarget).get("goal"),
                );
                setProfile((previous) => ({ ...previous, goal }));
                setModal(null);
                notify("Недельная цель сохранена");
              }}
            >
              <label className="form-field">
                Цель: тренировочных дней в неделю
                <select name="goal" defaultValue={profile.goal}>
                  <option value={0}>Не задана</option>
                  {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>

              <button className="primary-button full-width" type="submit">
                Сохранить цель
                <Check size={17} />
              </button>
            </form>
          )}
          {modal.type === "exercise" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget);
                const name = data.get("name").trim();
                if (!name) return;
                setExercises((list) => [
                  ...list,
                  {
                    id: crypto.randomUUID(),
                    name,
                    muscle: data.get("muscle"),
                    equipment: data.get("equipment"),
                    weight: Number(data.get("weight")),
                    reps: Number(data.get("reps")),
                    description: data.get("description").trim(),
                  },
                ]);
                setModal(null);
                setQuery("");
                setMuscle(muscles[0]);
                setGear(equipment[0]);
                notify("Новое упражнение в твоей библиотеке");
              }}
            >
              <label className="form-field">
                Название
                <input
                  name="name"
                  placeholder="Например, тяга гантели в наклоне"
                  maxLength="70"
                  required
                />
              </label>
              <div className="form-columns">
                <label className="form-field">
                  Группа мышц
                  <select name="muscle">
                    {muscles.slice(1).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="form-field">
                  Оборудование
                  <select name="equipment">
                    {equipment.slice(1).map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="form-columns">
                <label className="form-field">
                  Начальный вес, кг
                  <input
                    type="number"
                    name="weight"
                    defaultValue="0"
                    min="0"
                    max="1000"
                    step="0.5"
                    required
                  />
                </label>
                <label className="form-field">
                  Повторения
                  <input
                    type="number"
                    name="reps"
                    defaultValue="10"
                    min="1"
                    max="500"
                    required
                  />
                </label>
              </div>
              <label className="form-field">
                Описание техники
                <textarea
                  name="description"
                  rows={4}
                  maxLength={2000}
                  placeholder="Исходное положение, движение, подсказки тренера…"
                />
              </label>
              <button className="primary-button full-width" type="submit">
                <Plus size={17} />
                Добавить упражнение
              </button>
            </form>
          )}
          {modal.type === "split" && (
            <div className="split-choices">
              {splitOptions.map((s) => (
                <button
                  className={`split-choice ${split[modal.day] === s ? "selected" : ""}`}
                  key={s}
                  onClick={() => {
                    setSplit((all) =>
                      all.map((item, i) => (i === modal.day ? s : item)),
                    );
                    setModal(null);
                    notify("Расписание обновлено");
                  }}
                >
                  <MuscleIcon muscle={s.split(" · ")[0]} size={21} />
                  <span>{s}</span>
                  {split[modal.day] === s ? (
                    <Check size={19} />
                  ) : (
                    <ChevronRight size={16} />
                  )}
                </button>
              ))}
            </div>
          )}
          {modal.type === "plan" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const data = new FormData(e.currentTarget),
                  date = data.get("date"),
                  name = data.get("name");
                if (plans.some((p) => p.date === date && p.name === name)) {
                  notify("Эта тренировка уже запланирована");
                  return;
                }
                setPlans((p) => [
                  ...p,
                  { id: crypto.randomUUID(), date, name },
                ]);
                setSelected(date);
                setMonth(new Date(date + "T12:00:00"));
                setModal(null);
                notify("Тренировка добавлена в календарь");
              }}
            >
              <label className="form-field">
                Дата
                <input
                  name="date"
                  type="date"
                  defaultValue={modal.date < today ? today : modal.date}
                  min={today}
                  required
                />
              </label>
              <label className="form-field">
                Тренировка
                <select name="name">
                  {splitOptions.slice(1).map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </label>
              <p className="form-hint">
                Разовая тренировка появится в календаре. Регулярный план можно
                изменить в разделе «Моё расписание».
              </p>
              <button type="submit" className="primary-button full-width">
                <CalendarDays size={17} />
                Запланировать
              </button>
            </form>
          )}
          {modal.type === "program" && (
            <>
              <div
                className="program-modal-image"
                style={{ backgroundImage: `url(${modal.program.image})` }}
              />
              <p className="muted">
                {modal.program.desc} {modal.program.time} минут ·{" "}
                {modal.program.level}
              </p>
              <div className="program-exercise-list">
                {modal.program.exercises.map((id, i) => (
                  <div key={id}>
                    <span>{String(i + 1).padStart(2, "0")}</span>
                    <strong>{exercises.find((e) => e.id === id)?.name}</strong>
                    <span>3 × {exercises.find((e) => e.id === id)?.reps}</span>
                  </div>
                ))}
              </div>
              <button
                className="primary-button full-width"
                onClick={() =>
                  startWorkout(modal.program.name, modal.program.exercises)
                }
              >
                <Play size={17} fill="currentColor" />
                {active ? "Продолжить текущую тренировку" : "Начать программу"}
              </button>
            </>
          )}
          {modal.type === "finish" && (
            <>
              <div className="finish-icon">
                <Trophy size={40} />
              </div>
              <p className="modal-copy">
                Выполнено {completed} из {totalSets} подходов за{" "}
                {formatTime(elapsed)}. Сохраним тренировку в твою историю?
              </p>
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={() => setModal(null)}
                >
                  Продолжить
                </button>
                <button className="primary-button" onClick={finishWorkout}>
                  <Check size={17} />
                  Сохранить
                </button>
              </div>
            </>
          )}
          {modal.type === "cancelWorkout" && (
            <>
              <p className="modal-copy">
                Текущие подходы не попадут в историю. Это действие нельзя
                отменить.
              </p>
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={() => setModal(null)}
                >
                  Остаться
                </button>
                <button
                  className="danger-button"
                  onClick={() => {
                    setActive(null);
                    setModal(null);
                    navigate("dashboard");
                    notify("Тренировка отменена");
                  }}
                >
                  Отменить тренировку
                </button>
              </div>
            </>
          )}
          {modal.type === "removeExercise" && (
            <>
              <p className="modal-copy">
                «{modal.name}» и записанные для него подходы будут удалены из
                текущей тренировки.
              </p>
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={() => setModal(null)}
                >
                  Оставить
                </button>
                <button
                  className="danger-button"
                  onClick={() => {
                    setActive((a) => ({
                      ...a,
                      exercises: a.exercises.filter(
                        (_, i) => i !== modal.index,
                      ),
                    }));
                    setModal(null);
                  }}
                >
                  Убрать
                </button>
              </div>
            </>
          )}
          {modal.type === "rest" && (
            <>
              <div className="finish-icon">
                <Activity size={37} />
              </div>
              <p className="modal-copy">
                В твоём расписании сегодня отдых. Если чувствуешь силы и хочешь
                позаниматься, выбери подходящую программу.
              </p>
              <button
                className="primary-button full-width"
                onClick={() => {
                  setModal(null);
                  navigate("programs");
                }}
              >
                Выбрать программу
                <ArrowRight size={17} />
              </button>
            </>
          )}
          {modal.type === "help" && (
            <>
              <p className="modal-copy">
                Твоё пространство для тренировок: планируй неделю, записывай
                подходы и следи за прогрессом.
              </p>
              <div className="help-steps">
                <div>
                  <span>01</span>
                  <p>Выбери готовую программу или настрой недельный сплит.</p>
                </div>
                <div>
                  <span>02</span>
                  <p>
                    Вводи вес и повторения. Отмечай подходы — таймер отдыха
                    запустится автоматически.
                  </p>
                </div>
                <div>
                  <span>03</span>
                  <p>
                    Заверши тренировку, чтобы сохранить результат в календаре.
                  </p>
                </div>
              </div>
              <p className="form-hint">
                Твои записи сохраняются в аккаунте. Перед закрытием страницы
                дождись статуса «
                {isGuest ? "Сохранено в браузере" : "Сохранено в облаке"}».
              </p>
            </>
          )}
          {modal.type === "history" && (
            <>
              <span className="completed-label">
                <CheckCheck size={17} />
                Тренировка завершена
              </span>
              <div className="history-detail-stats">
                <div>
                  <strong>{modal.entry.duration}</strong>
                  <span>минут</span>
                </div>
                <div>
                  <strong>{modal.entry.sets}</strong>
                  <span>подходов</span>
                </div>
                <div>
                  <strong>{modal.entry.volume.toLocaleString("ru-RU")}</strong>
                  <span>кг объёма</span>
                </div>
              </div>
              {modal.entry.exercises?.map((e, i) => (
                <div className="detail-exercise" key={i}>
                  <strong>{e.name}</strong>
                  <p>
                    {e.sets
                      .filter((s) => s.done)
                      .map((s) => `${s.weight} кг × ${s.reps}`)
                      .join(" · ") || "Без выполненных подходов"}
                  </p>
                </div>
              ))}
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
