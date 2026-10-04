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
