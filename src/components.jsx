import React, { useEffect, useRef } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  Dumbbell,
  Activity,
  Flame,
  Footprints,
  BicepsFlexed,
  Heart,
  Check,
} from "lucide-react";
import { dateKey, dayNames, addDays, monday } from "./data";

export function MuscleIcon({ muscle, ...props }) {
  const Icon =
    muscle === "Ноги"
      ? Footprints
      : muscle === "Спина"
        ? Activity
        : muscle === "Пресс"
          ? Flame
          : muscle === "Отдых"
            ? Heart
            : muscle === "Бицепс" || muscle === "Трицепс"
              ? BicepsFlexed
              : Dumbbell;
  return <Icon {...props} />;
}
export function SectionHeading({ eyebrow, title, action, onAction }) {
  return (
    <div className="section-heading">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      {action && (
        <button className="text-button" onClick={onAction}>
          {action}
          <ArrowUpRight size={15} />
        </button>
      )}
    </div>
  );
}
export function Modal({ title, children, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = ref.current;
    dialog.querySelector("input,select,button")?.focus();
    const handle = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = [
          ...dialog.querySelectorAll(
            'button,input,select,textarea,[tabindex="0"]',
          ),
        ].filter((el) => !el.disabled);
        const first = els[0],
          last = els.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.removeEventListener("keydown", handle);
      before?.focus();
    };
  }, [onClose]);
  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Calendar({
  month,
  setMonth,
  selected,
  onSelect,
  history,
  plans,
  compact = false,
  weekView = false,
}) {
  const first = weekView
    ? monday(new Date(selected + "T12:00:00"))
    : monday(new Date(month.getFullYear(), month.getMonth(), 1));
  const dates = Array.from({ length: weekView ? 7 : 35 }, (_, i) =>
    addDays(first, i),
  );
  if (
    !weekView &&
    dates.at(-1).getMonth() === month.getMonth() &&
    dates.at(-1).getDate() <
      new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  )
    for (let i = 0; i < 7; i++) dates.push(addDays(dates.at(-1), 1));
  function move(n) {
    if (weekView) {
      const next = addDays(new Date(selected + "T12:00:00"), n * 7);
      onSelect(dateKey(next));
      setMonth(next);
    } else setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  }
  return (
    <div className={`calendar ${compact ? "compact" : ""}`}>
      <div className="calendar-heading">
        <h3>
          {month
            .toLocaleDateString("ru-RU", { month: "long", year: "numeric" })
            .replace(" г.", "")}
        </h3>
        <div className="calendar-arrows">
          <button
            className="icon-button"
            aria-label="Назад по календарю"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Вперёд по календарю"
            onClick={() => move(1)}
          >
            <ChevronRight size={17} />
          </button>
        </div>
      </div>
      <div className="calendar-grid">
        {dayNames.map((d) => (
          <span className="calendar-weekday" key={d}>
            {d}
          </span>
        ))}
        {dates.map((d) => {
          const key = dateKey(d),
            done = history.some((h) => h.date === key),
            planned = plans.some((p) => p.date === key);
          return (
            <button
              key={key}
              onClick={() => onSelect(key)}
              aria-label={
                d.toLocaleDateString("ru-RU") +
                (done ? ", есть тренировка" : "") +
                (planned ? ", запланировано" : "")
              }
              aria-pressed={selected === key}
              className={`calendar-day ${d.getMonth() !== month.getMonth() ? "outside" : ""} ${key === dateKey(new Date()) ? "today" : ""} ${selected === key ? "selected" : ""}`}
            >
              <span>{d.getDate()}</span>
              <span className="date-dots">
                {done && <i />}
                {planned && <i className="planned-dot" />}
              </span>
            </button>
          );
        })}
      </div>
      {compact && (
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
      )}
    </div>
  );
}
export function WeekSchedule({
  split,
  history,
  onEdit,
  onStart,
  large = false,
}) {
  const start = monday(new Date());
  return (
    <div className={`week-schedule ${large ? "large" : ""}`}>
      {split.map((name, i) => {
        const date = addDays(start, i),
          today = dateKey(date) === dateKey(new Date()),
          done = history.some((h) => h.date === dateKey(date)),
          rest = ["Отдых", "Не запланировано"].includes(name);
        return (
          <button
            className={`day-card ${today ? "current" : ""} ${rest ? "rest" : ""}`}
            key={i}
            onClick={() => (large ? onEdit(i) : onStart(name, i))}
          >
            <div className="day-top">
              <span>{dayNames[i]}</span>
              <span>{date.getDate()}</span>
            </div>
            <div className="day-icon">
              <MuscleIcon
                muscle={rest ? "Отдых" : name.split(" · ")[0]}
                size={21}
              />
            </div>
            <strong>
              {name.split(" · ").map((s, j) => (
                <React.Fragment key={j}>
                  {j > 0 && <br />}
                  {s}
                </React.Fragment>
              ))}
            </strong>
            <span className="day-status">
              {today ? (
                <>
                  <i />
                  Сегодня
                </>
              ) : done ? (
                <>
                  <Check size={12} />
                  Выполнено
                </>
              ) : rest ? (
                name === "Не запланировано" ? (
                  "Добавить план"
                ) : (
                  "Восстановление"
                )
              ) : (
                "По плану"
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
