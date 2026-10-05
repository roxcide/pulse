import { initialExercises, defaultSplit } from "../data";
export function newAccountState(user) {
  return {
    exercises: structuredClone(initialExercises),
    split: [...defaultSplit],
    history: [],
    plans: [],
    active: null,
    profile: { name: user.displayName || "Атлет", goal: 0, rest: 90 },
  };
}

export function restoreAccountState(user, saved = {}) {
  const defaults = newAccountState(user);
  const existing = saved.exercises ?? [];
  const ids = new Set(existing.map((exercise) => exercise.id));
  return {
    ...defaults,
    ...saved,
    // The library has no delete action; removing a workout exercise does not remove its catalog entry.
    // Keep user edits and custom exercises, and append only missing built-ins.
    exercises: [
      ...existing,
      ...defaults.exercises.filter((exercise) => !ids.has(exercise.id)),
    ],
  };
}
