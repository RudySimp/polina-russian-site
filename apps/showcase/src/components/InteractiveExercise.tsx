import { useState } from "react";
import type { Interactive } from "../content/registry";
import { Badge } from "./ui";

export function InteractiveExercise({ data }: { data: Interactive }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number[]>([]);
  const [checked, setChecked] = useState(false);
  const example = data.examples[index];
  const correct =
    selected.length === example.expected.length &&
    selected.every((item) => example.expected.includes(item));
  function choose(position: number, single = false) {
    setSelected(
      single
        ? [position]
        : selected.includes(position)
          ? selected.filter((item) => item !== position)
          : [...selected, position],
    );
    setChecked(false);
  }
  function reset() {
    setSelected([]);
    setChecked(false);
  }
  return (
    <div className="interactive-card">
      <div className="interactive-heading">
        <h3>{data.title}</h3>
        <Badge>Учебный интерактив</Badge>
      </div>
      <p>{data.instruction}</p>
      <div className="segmented" role="group" aria-label="Примеры">
        {data.examples.map((item, n) => (
          <button
            key={n}
            className={index === n ? "selected" : ""}
            aria-pressed={index === n}
            onClick={() => {
              setIndex(n);
              reset();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {data.kind === "punctuation" ? (
        <div className="lab-sentence">
          {example.tokens?.map((token, n) => (
            <span key={n}>
              <span>{token}</span>
              {n < example.tokens!.length - 1 && (
                <button
                  className="comma-slot"
                  aria-label={`Запятая после «${token}»`}
                  aria-pressed={selected.includes(n + 1)}
                  onClick={() => choose(n + 1)}
                >
                  {selected.includes(n + 1) ? "," : "·"}
                </button>
              )}
            </span>
          ))}
          .
        </div>
      ) : data.kind === "foundation" ? (
        <div
          className="word-buttons"
          role="group"
          aria-label="Слова предложения"
        >
          {example.tokens?.map((token, n) => (
            <button
              key={n}
              aria-pressed={selected.includes(n + 1)}
              onClick={() => choose(n + 1)}
            >
              {token}
            </button>
          ))}
        </div>
      ) : data.kind === "stress" ? (
        <div
          className="stress-word"
          role="group"
          aria-label="Выбор ударной гласной"
        >
          {[...example.text].map((letter, n) =>
            /[аеёиоуыэюя]/iu.test(letter) ? (
              <button
                key={n}
                aria-label={`Ударение на ${letter}, буква ${n + 1}`}
                aria-pressed={selected.includes(n + 1)}
                onClick={() => choose(n + 1, true)}
              >
                {letter}
              </button>
            ) : (
              <span key={n}>{letter}</span>
            ),
          )}
        </div>
      ) : (
        <p className="lab-sentence">{example.text}</p>
      )}
      {example.options && (
        <fieldset className="choice-list">
          <legend className="sr-only">Ваш выбор</legend>
          {example.options.map((option, n) => (
            <label key={n}>
              <input
                type="radio"
                name={`${data.title}-${index}`}
                checked={selected.includes(n + 1)}
                onChange={() => choose(n + 1, true)}
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>
      )}
      <div className="inline-actions">
        <button className="button" onClick={() => setChecked(true)}>
          Проверить
        </button>
        <button className="button secondary" onClick={reset}>
          Начать заново
        </button>
      </div>
      {checked && (
        <div
          className={`feedback ${correct ? "correct" : "incorrect"}`}
          role="status"
        >
          <h4>
            {correct
              ? "Верно — разберём почему"
              : "Посмотрим на правило ещё раз"}
          </h4>
          <p>{example.explanation}</p>
          {example.subject && (
            <p>
              <strong>Подлежащее:</strong> {example.subject}
            </p>
          )}
          {example.predicate && (
            <p>
              <strong>{example.subject ? "Сказуемое" : "Главный член"}:</strong>{" "}
              {example.predicate}
            </p>
          )}
          {data.kind === "foundation" && (
            <p>
              Основа:{" "}
              {example.expected.map((n) => example.tokens![n - 1]).join(" ")}.
            </p>
          )}
          {data.kind === "stress" && (
            <p>
              Норма:{" "}
              {[...example.text]
                .map((letter, n) =>
                  example.expected.includes(n + 1)
                    ? letter.toLocaleUpperCase("ru")
                    : letter,
                )
                .join("")}
              .
            </p>
          )}
          {data.kind === "punctuation" && (
            <p>
              Правильная запись:{" "}
              {example.tokens
                ?.map(
                  (token, n) =>
                    `${token}${example.expected.includes(n + 1) ? "," : ""}`,
                )
                .join(" ")}
              .
            </p>
          )}
          {example.options && (
            <p>
              Правильный выбор:{" "}
              {example.expected.map((n) => example.options![n - 1]).join("; ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
