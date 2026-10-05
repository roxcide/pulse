import React from "react";
import { BookOpen, Lightbulb, CircleAlert } from "lucide-react";
import { exerciseGuides } from "./catalog";
import "./exercises.css";

export default function ExerciseDetails({ exercise, onSaveDescription }) {
  const guide = exerciseGuides[exercise.id];
  return (
    <div className="exercise-guide">
      <div className="exercise-guide-tags">
        <span>{exercise.muscle}</span>
        <span>{exercise.equipment}</span>
      </div>
      {guide ? (
        <>
          <p className="exercise-guide-summary">{guide.summary}</p>
          <h3>
            <BookOpen size={18} />
            Техника выполнения
          </h3>
          <ol className="technique-steps">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <section className="technique-mistakes">
            <h3>
              <CircleAlert size={18} />
              Частые ошибки
            </h3>
            <ul>
              {guide.mistakes.map((mistake) => (
                <li key={mistake}>{mistake}</li>
              ))}
            </ul>
          </section>
          <p className="technique-tip">
            <Lightbulb size={19} />
            {guide.tip}
          </p>
        </>
      ) : (
        <>
          <h3>
            <BookOpen size={18} />
            Твоя техника выполнения
          </h3>
          <p className="exercise-guide-summary">
            Сохрани описание от своего тренера или собственные заметки к
            упражнению.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSaveDescription(
                new FormData(event.currentTarget).get("description").trim(),
              );
            }}
          >
            <label className="form-field">
              Описание техники
              <textarea
                name="description"
                rows={7}
                maxLength={2000}
                defaultValue={exercise.description || ""}
                placeholder="Исходное положение, движение, на что обратить внимание…"
              />
            </label>
            <button className="primary-button full-width" type="submit">
              Сохранить описание
            </button>
          </form>
        </>
      )}
    </div>
  );
}
