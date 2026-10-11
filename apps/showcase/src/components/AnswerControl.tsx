import { useId } from "react";
import type { Exercise } from "../content/model";

export function AnswerControl({
  exercise,
  answer,
  change,
  locked,
}: {
  exercise: Exercise;
  answer: string;
  change: (answer: string) => void;
  locked: boolean;
}) {
  const inputId = useId();
  if (exercise.input === "single")
    return (
      <fieldset className="choice-list" disabled={locked}>
        <legend>Ваш ответ</legend>
        {exercise.options.map((option, index) => (
          <label key={index}>
            <input
              type="radio"
              name={inputId}
              checked={answer === String(index + 1)}
              onChange={() => change(String(index + 1))}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
    );
  if (["multiple", "words", "punctuation"].includes(exercise.input))
    return (
      <fieldset className="choice-list" disabled={locked}>
        <legend>Ваш ответ</legend>
        {exercise.options.map((option, index) => {
          const value = String(index + 1);
          return (
            <label key={index}>
              <input
                type="checkbox"
                checked={answer.includes(value)}
                onChange={() =>
                  change(
                    answer.includes(value)
                      ? answer.replace(value, "")
                      : answer + value,
                  )
                }
              />
              <span>{option}</span>
            </label>
          );
        })}
      </fieldset>
    );
  if (exercise.input === "matching")
    return (
      <fieldset disabled={locked}>
        <legend>Ваш ответ</legend>
        {exercise.rules?.map((rule, index) => (
          <label key={index}>
            {rule}
            <select
              value={answer[index] === "_" ? "" : (answer[index] ?? "")}
              onChange={(event) => {
                const values = Array.from(
                  { length: exercise.rules!.length },
                  (_, n) => answer[n] ?? "_",
                );
                values[index] = event.target.value || "_";
                change(values.join(""));
              }}
            >
              <option value="">Выберите предложение</option>
              {exercise.options.map((_, n) => (
                <option key={n} value={n + 1}>
                  {n + 1}
                </option>
              ))}
            </select>
          </label>
        ))}
      </fieldset>
    );
  return (
    <label className="answer-field" htmlFor={inputId}>
      Ваш ответ
      <input
        id={inputId}
        readOnly={locked}
        inputMode={
          exercise.responseKind === "digits_sequence" ? "numeric" : "text"
        }
        autoComplete="off"
        spellCheck={false}
        value={answer}
        onChange={(event) => change(event.target.value)}
        placeholder={
          exercise.responseKind === "digits_sequence"
            ? "Например, 135"
            : "Слово или словосочетание"
        }
      />
    </label>
  );
}
