export const muscles = [
  "Все группы",
  "Грудь",
  "Спина",
  "Ноги",
  "Плечи",
  "Бицепс",
  "Трицепс",
  "Пресс",
];
export const equipment = [
  "Любое оборудование",
  "Штанга",
  "Гантели",
  "Тренажёр",
  "Свой вес",
];
export const initialExercises = [
  {
    id: "bench",
    name: "Жим штанги лёжа",
    muscle: "Грудь",
    equipment: "Штанга",
    weight: 0,
    reps: 10,
  },
  {
    id: "incline",
    name: "Жим гантелей на наклонной",
    muscle: "Грудь",
    equipment: "Гантели",
    weight: 0,
    reps: 12,
  },
  {
    id: "fly",
    name: "Сведение рук в кроссовере",
    muscle: "Грудь",
    equipment: "Тренажёр",
    weight: 0,
    reps: 12,
  },
  {
    id: "triceps",
    name: "Разгибание рук на блоке",
    muscle: "Трицепс",
    equipment: "Тренажёр",
    weight: 0,
    reps: 12,
  },
  {
    id: "pushups",
    name: "Отжимания от пола",
    muscle: "Грудь",
    equipment: "Свой вес",
    weight: 0,
    reps: 15,
  },
  {
    id: "squat",
    name: "Приседания со штангой",
    muscle: "Ноги",
    equipment: "Штанга",
    weight: 0,
    reps: 10,
  },
  {
    id: "legpress",
    name: "Жим ногами",
    muscle: "Ноги",
    equipment: "Тренажёр",
    weight: 0,
    reps: 12,
  },
  {
    id: "lunge",
    name: "Выпады с гантелями",
    muscle: "Ноги",
    equipment: "Гантели",
    weight: 0,
    reps: 12,
  },
  {
    id: "shoulder",
    name: "Жим гантелей сидя",
    muscle: "Плечи",
    equipment: "Гантели",
    weight: 0,
    reps: 10,
  },
  {
    id: "raise",
    name: "Махи гантелями в стороны",
    muscle: "Плечи",
    equipment: "Гантели",
    weight: 0,
    reps: 15,
  },
  {
    id: "pulldown",
    name: "Тяга верхнего блока",
    muscle: "Спина",
    equipment: "Тренажёр",
    weight: 0,
    reps: 12,
  },
  {
    id: "row",
    name: "Тяга штанги в наклоне",
    muscle: "Спина",
    equipment: "Штанга",
    weight: 0,
    reps: 10,
  },
  {
    id: "curl",
    name: "Подъём гантелей на бицепс",
    muscle: "Бицепс",
    equipment: "Гантели",
    weight: 0,
    reps: 12,
  },
  {
    id: "crunch",
    name: "Скручивания",
    muscle: "Пресс",
    equipment: "Свой вес",
    weight: 0,
    reps: 20,
  },
];
export const programs = [
  {
    id: "full",
    name: "Full Body",
    eyebrow: "КРЕПКАЯ ОСНОВА",
    desc: "Всё тело. Одна тренировка.",
    tag: "Для новичков",
    time: 45,
    level: "Начальный",
    image: "/images/fullbody.jpg",
    exercises: ["squat", "bench", "pulldown", "shoulder", "crunch"],
  },
  {
    id: "mass",
    name: "Сила и масса",
    eyebrow: "СТАНЬ СИЛЬНЕЕ",
    desc: "Больше силы с каждым подходом.",
    tag: "Набор массы",
    time: 60,
    level: "Средний",
    image: "/images/strength.jpg",
    exercises: ["bench", "incline", "fly", "triceps", "pushups"],
  },
  {
    id: "burn",
    name: "Энергия движения",
    eyebrow: "В ТВОЁМ ТЕМПЕ",
    desc: "Двигайся больше. Чувствуй себя лучше.",
    tag: "Снижение веса",
    time: 35,
    level: "Любой уровень",
    image: "/images/cardio.jpg",
    exercises: ["lunge", "pushups", "squat", "crunch"],
  },
];
export const splitOptions = [
  "Не запланировано",
  "Отдых",
  "Ноги · Плечи",
  "Спина · Бицепс",
  "Грудь · Трицепс",
  "Full Body",
];
export const defaultSplit = Array(7).fill("Не запланировано");
export const splitExercises = {
  "Ноги · Плечи": ["squat", "legpress", "lunge", "shoulder", "raise"],
  "Спина · Бицепс": ["pulldown", "row", "curl", "crunch"],
  "Грудь · Трицепс": ["bench", "incline", "fly", "triceps", "pushups"],
  "Full Body": programs[0].exercises,
};
export const dayNames = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const fullDayNames = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
];
export function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function monday(d) {
  const date = new Date(d);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
  date.setHours(0, 0, 0, 0);
  return date;
}
export function addDays(d, n) {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}
