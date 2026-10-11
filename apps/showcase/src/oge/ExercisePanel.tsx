import { useState } from "react";
import type { Exercise } from "../content/model";
import { AnswerControl } from "../components/AnswerControl";
import { href } from "../routes";
import { gradeExercise } from "./engine";
import type { SourceText } from "./model";

export function SourcePassage({ text }: { text: SourceText }) {
  return (
    <section
      className="oge-source"
      aria-label={`Исходный текст: ${text.title}`}
    >
      <h3>{text.title}</h3>
      {text.paragraphs.map((paragraph, n) => (
        <p key={n}>{paragraph}</p>
      ))}
      <p className="muted">{text.authorship}</p>
    </section>
  );
}
export function ExerciseStatement({
  exercise,
  text,
}: {
  exercise: Exercise;
  text?: SourceText;
}) {
  return (
    <>
      <p className="question-prompt">{exercise.prompt}</p>
      {text && <SourcePassage text={text} />}
      {exercise.text && <div className="source-text">{exercise.text}</div>}
      {exercise.rules && (
        <ul className="rules-list">
          {exercise.rules.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ul>
      )}
      {exercise.options.length > 0 && exercise.input !== "single" && (
        <ol className="answer-options">
          {exercise.options.map((option, n) => (
            <li key={n}>{option}</li>
          ))}
        </ol>
      )}
    </>
  );
}
export function ExerciseFeedback({
  exercise,
  answer,
  revealKey = false,
}: {
  exercise: Exercise;
  answer: string;
  revealKey?: boolean;
}) {
  const grade = gradeExercise(answer, exercise);
  return (
    <section
      className={`feedback ${grade.status === "correct" ? "correct" : "incorrect"}`}
      aria-live="polite"
    >
      <h3>
        {grade.status === "correct"
          ? "Верно"
          : grade.status === "format_error"
            ? "Уточните формат"
            : "Разберём ошибку"}
      </h3>
      {grade.status === "format_error" && (
        <p>{grade.message} Ошибка ввода не учитывается как ошибка по теме.</p>
      )}
      {(grade.status !== "format_error" || revealKey) && (
        <>
          <p>
            Ваш ответ: <strong>{answer}</strong>. Эталон:{" "}
            <strong>{exercise.answers.join(" / ")}</strong>.
          </p>
          {exercise.explanation.split("\n\n").map((p, n) => (
            <p key={n}>{p}</p>
          ))}
          {exercise.optionExplanations.length > 0 && (
            <details>
              <summary>Разбор каждого варианта</summary>
              <ol>
                {exercise.optionExplanations.map((p, n) => (
                  <li key={n}>{p.replace(/^\d\)\s*/u, "")}</li>
                ))}
              </ol>
            </details>
          )}
          <a href={href(`/theory/${exercise.topicSlug}/?exam=OGE`)}>
            Повторить правило: {exercise.topicTitle}
          </a>
        </>
      )}
    </section>
  );
}
export function InlineExercise({
  exercise,
  text,
  checked,
}: {
  exercise: Exercise;
  text?: SourceText;
  checked: (exercise: Exercise, answer: string) => void;
}) {
  const [answer, setAnswer] = useState(""),
    [submitted, setSubmitted] = useState(false);
  const [formatError, setFormatError] = useState("");
  return (
    <article className="question-card oge-inline">
      <h3>{exercise.title}</h3>
      <ExerciseStatement exercise={exercise} text={text} />
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const result = gradeExercise(answer, exercise);
          if (result.status === "format_error") setFormatError(result.message);
          else {
            setFormatError("");
            setSubmitted(true);
            checked(exercise, answer);
          }
        }}
      >
        <AnswerControl
          exercise={exercise}
          answer={answer}
          change={(value) => {
            setAnswer(value);
            setFormatError("");
          }}
          locked={submitted}
        />
        <p className="answer-instruction">{exercise.instruction}</p>
        <button className="button" disabled={submitted}>
          Проверить ответ
        </button>
        {formatError && <p role="alert">{formatError}</p>}
      </form>
      <details className="hint">
        <summary>Подсказка</summary>
        <p>{exercise.hint}</p>
      </details>
      {submitted && (
        <>
          <ExerciseFeedback exercise={exercise} answer={answer} />
          <button
            className="button secondary"
            onClick={() => {
              setSubmitted(false);
              setAnswer("");
            }}
          >
            Повторить упражнение
          </button>
        </>
      )}
    </article>
  );
}
