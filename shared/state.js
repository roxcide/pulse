const number = (n, max = 1e9) => Number.isFinite(n) && n >= 0 && n <= max;
const text = (s, max = 200) => typeof s === "string" && s.length <= max;
const array = (a, max, valid) =>
  Array.isArray(a) && a.length <= max && a.every(valid);
const exercise = (e) =>
  e &&
  text(e.id) &&
  text(e.name) &&
  text(e.muscle) &&
  text(e.equipment) &&
  number(e.weight, 2000) &&
  number(e.reps, 10000) &&
  (e.description === undefined || text(e.description, 2000));
const workoutExercise = (e) =>
  e &&
  text(e.id) &&
  text(e.name) &&
  array(
    e.sets,
    100,
    (s) =>
      s &&
      number(s.weight, 2000) &&
      number(s.reps, 10000) &&
      typeof s.done === "boolean",
  );
const day = (d) => text(d, 10) && /^\d{4}-\d{2}-\d{2}$/.test(d);
const validators = {
  profile: (v) =>
    v &&
    text(v.name, 24) &&
    v.name.trim() &&
    Number.isInteger(v.goal) &&
    number(v.goal, 7) &&
    number(v.rest, 600),
  exercises: (v) => array(v, 1000, exercise),
  split: (v) =>
    Array.isArray(v) && v.length === 7 && v.every((s) => text(s, 100)),
  history: (v) =>
    array(
      v,
      10000,
      (h) =>
        h &&
        text(h.id) &&
        text(h.name) &&
        day(h.date) &&
        number(h.duration) &&
        number(h.volume) &&
        array(h.exercises, 100, workoutExercise),
    ),
  plans: (v) =>
    array(v, 10000, (p) => p && text(p.id) && text(p.name) && day(p.date)),
  active: (v) =>
    v === null ||
    (v &&
      text(v.id) &&
      text(v.name) &&
      number(v.startedAt, 1e14) &&
      (v.restEndsAt == null || number(v.restEndsAt, 1e14)) &&
      array(v.exercises, 100, workoutExercise)),
};
export function validState(data) {
  return (
    data &&
    typeof data === "object" &&
    !Array.isArray(data) &&
    Object.entries(data).every(
      ([key, value]) =>
        Object.hasOwn(validators, key) && validators[key](value),
    )
  );
}
