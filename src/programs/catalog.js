// A compact adaptation of the linked PPL split using Pulse's existing exercises.
export const pplSource =
  "https://www.muscleandstrength.com/articles/the-ultimate-muscle-building-split-reference-guide.html";
const common = {
  tag: "Push / Pull / Legs",
  level: "Базовый сплит",
  source: pplSource,
  notes:
    "Пример недели: Пн — Push, Ср — Pull, Пт — Legs; между тренировками отдых. Перед рабочими подходами разомнись. Начинай с нижней границы повторений и подбирай вес под свою технику. Когда уверенно достигаешь верхней границы во всех подходах, немного увеличь вес. Таймер отдыха использует твои настройки.",
};
export const pplPrograms = [
  {
    ...common,
    id: "push",
    name: "Push",
    eyebrow: "ЖИМОВОЙ ДЕНЬ",
    desc: "Грудь, плечи и трицепс.",
    time: 55,
    image: "/images/push.jpg",
    exercises: ["bench", "shoulder", "incline", "raise", "triceps"],
    prescription: {
      bench: { sets: 3, reps: 8, maxReps: 12 },
      shoulder: { sets: 3, reps: 8, maxReps: 12 },
      incline: { sets: 3, reps: 8, maxReps: 12 },
      raise: { sets: 3, reps: 10, maxReps: 12 },
      triceps: { sets: 3, reps: 10, maxReps: 12 },
    },
  },
  {
    ...common,
    id: "pull",
    name: "Pull",
    eyebrow: "ТЯГОВОЙ ДЕНЬ",
    desc: "Спина, задняя дельта и бицепс.",
    time: 55,
    image: "/images/pull.jpg",
    exercises: ["pulldown", "row", "seatedrow", "reardelt", "curl"],
    prescription: {
      pulldown: { sets: 3, reps: 8, maxReps: 12 },
      row: { sets: 3, reps: 8, maxReps: 12 },
      seatedrow: { sets: 3, reps: 8, maxReps: 12 },
      reardelt: { sets: 3, reps: 12, maxReps: 15 },
      curl: { sets: 3, reps: 8, maxReps: 12 },
    },
  },
  {
    ...common,
    id: "legs",
    name: "Legs",
    eyebrow: "ОПОРА ТВОЕЙ СИЛЫ",
    desc: "Бёдра, ягодицы и икры.",
    time: 60,
    image: "/images/legs.jpg",
    exercises: ["squat", "romanian", "legpress", "legcurl", "calfraise"],
    prescription: {
      squat: { sets: 3, reps: 8, maxReps: 12 },
      romanian: { sets: 3, reps: 8, maxReps: 12 },
      legpress: { sets: 3, reps: 10, maxReps: 15 },
      legcurl: { sets: 3, reps: 10, maxReps: 15 },
      calfraise: { sets: 3, reps: 15, maxReps: 20 },
    },
  },
];

export function exercisePrescription(program, exercise) {
  return (
    program?.prescription?.[exercise.id] || { sets: 3, reps: exercise.reps }
  );
}

export function buildWorkoutExercises(ids, library, program) {
  return ids.map((id) => {
    const exercise = library.find((item) => item.id === id);
    const plan = exercisePrescription(program, exercise);
    return {
      ...exercise,
      sets: Array.from({ length: plan.sets }, () => ({
        reps: plan.reps,
        weight: exercise.weight,
        done: false,
      })),
    };
  });
}
