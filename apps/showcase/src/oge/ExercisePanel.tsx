import { useState } from "react";
import type { Exercise } from "../content/model";
import subskills from "../content/subskills.json";
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
export function answerDifference(exercise: Exercise, answer: string) {
  const value = answer.replace(/[ ,]/gu, "").trim(),
    expected = exercise.answers[0] ?? "";
  if (exercise.responseKind !== "digits_sequence") return [];
  if (exercise.input === "matching")
    return [...expected].flatMap((digit, n) =>
      value[n] === digit
        ? []
        : [
            {
              position: Number(digit),
              title: "Правило " + String.fromCharCode(1040 + n),
              detail:
                "Вы выбрали предложение " +
                (value[n] ?? "—") +
                "; правило объясняет предложение " +
                digit +
                ".",
            },
          ],
    );
  const given = new Set([...value]),
    wanted = new Set([...expected]);
  return [...new Set([...value, ...expected])]
    .filter((d) => given.has(d) !== wanted.has(d))
    .map((d) => ({
      position: Number(d),
      title: (wanted.has(d) ? "Пропущена" : "Лишняя") + " позиция " + d,
      detail:
        exercise.optionExplanations[Number(d) - 1] ??
        [
          ...exercise.explanation.matchAll(
            /(?:^|\n)(?:\((\d+)\)|(\d+)\))\s*([^\n]+)/gu,
          ),
        ].find((row) => Number(row[1] ?? row[2]) === Number(d))?.[3] ??
        "Проверьте условие выбора и правило для этой позиции.",
    }));
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
  const grade = gradeExercise(answer, exercise),
    differences = answerDifference(exercise, answer);
  const paths = [
    ...new Set(
      differences.flatMap(
        (d) =>
          exercise.elements?.find((e) => e.position === d.position)?.rulePath ??
          [],
      ),
    ),
  ];
  if (!paths.length)
    paths.push(
      ...(exercise.rulePaths?.slice(0, 2) ?? [
        "/theory/" + exercise.topicSlug + "/?exam=OGE#algorithm",
      ]),
    );
  const errorSkill =
    differences.flatMap(
      (d) =>
        exercise.elements?.find((e) => e.position === d.position)?.skillIds ??
        [],
    )[0] ?? exercise.skillIds?.find((s) => s !== exercise.skillId);
  return (
    <section
      className={
        "feedback " + (grade.status === "correct" ? "correct" : "incorrect")
      }
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
            Ваш ответ: <strong>{answer || "не дан"}</strong>. Эталон:{" "}
            <strong>{exercise.answers.join(" / ")}</strong>.
          </p>
          {differences.length > 0 && (
            <ul className="oge-answer-difference">
              {differences.map((d) => (
                <li key={d.title}>
                  <strong>{d.title}.</strong> {d.detail}
                  {exercise.input === "matching" && (
                    <p>{exercise.optionExplanations[d.position - 1]}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
          {exercise.responseKind === "short_text" &&
            grade.status !== "correct" && (
              <p>
                {exercise.taskLine === 9
                  ? "Проверьте вид связи, зависимое слово и сохранение исходного смысла."
                  : exercise.taskLine === 8
                    ? "Проверьте падеж, число, время или степень сравнения, заданные контекстом."
                    : "Проверьте значение слова именно в данном фрагменте."}{" "}
                Принимаются перечисленные варианты эталона; произвольные
                синонимы автоматически не оцениваются.
              </p>
            )}
          <details open={grade.status === "correct"}>
            <summary>Полный разбор задания</summary>
            {!exercise.optionExplanations.length &&
              exercise.explanation
                .split("\n\n")
                .map((p, n) => <p key={n}>{p}</p>)}
            {exercise.optionExplanations.length > 0 && (
              <ol>
                {exercise.optionExplanations.map((p, n) => (
                  <li key={n}>{p.replace(/^\d\)\s*/u, "")}</li>
                ))}
              </ol>
            )}
          </details>
          <div className="inline-actions">
            {paths.slice(0, 3).map((path) => (
              <a key={path} href={href(path)}>
                {"Повторить: " +
                  (subskills.find((skill) => skill.rulePath === path)?.title ??
                    exercise.topicTitle)}
              </a>
            ))}
            {grade.status === "incorrect" && (
              <a
                href={href(
                  "/oge/bank/" +
                    (exercise.taskLine ?? "") +
                    "/?status=new" +
                    (errorSkill
                      ? "&skill=" + encodeURIComponent(errorSkill)
                      : ""),
                )}
              >
                Новая задача на этот навык
              </a>
            )}
          </div>
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
