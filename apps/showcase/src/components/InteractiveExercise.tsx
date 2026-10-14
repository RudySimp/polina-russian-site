import { useLessonState } from "../lib/lesson-state";
import type { Interactive } from "../content/registry";
import { Badge } from "./ui";

type CaseState = { selected: number[]; checked: boolean; checks: number };
type InteractiveState = { index: number; cases: Record<string, CaseState> };
export function InteractiveExercise({
  data,
  scope = data.title,
}: {
  data: Interactive;
  scope?: string;
}) {
  const [state, updateState, saveError] = useLessonState<InteractiveState>(
    scope,
    { index: 0, cases: {} },
    (v): v is InteractiveState => {
      if (!v || typeof v !== "object") return false;
      const value = v as InteractiveState;
      return (
        Number.isInteger(value.index) &&
        value.index >= 0 &&
        value.index < data.examples.length &&
        !!value.cases &&
        typeof value.cases === "object" &&
        Object.values(value.cases).every(
          (c) =>
            Array.isArray(c.selected) &&
            c.selected.every((n) => Number.isInteger(n) && n > 0 && n <= 100) &&
            typeof c.checked === "boolean" &&
            Number.isInteger(c.checks) &&
            c.checks >= 0,
        )
      );
    },
  );
  const index = state.index,
    current = state.cases[index] ?? { selected: [], checked: false, checks: 0 },
    selected = current.selected,
    checked = current.checked;
  const setSelected = (selected: number[]) =>
    updateState({
      ...state,
      cases: {
        ...state.cases,
        [index]: { ...current, selected, checked: false },
      },
    });
  const setChecked = (checked: boolean) =>
    updateState({
      ...state,
      cases: {
        ...state.cases,
        [index]: {
          ...current,
          checked,
          checks: current.checks + (checked ? 1 : 0),
        },
      },
    });
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
  }
  function reset() {
    updateState({
      ...state,
      cases: {
        ...state.cases,
        [index]: { selected: [], checked: false, checks: current.checks },
      },
    });
  }
  return (
    <div className="interactive-card">
      <div className="interactive-heading">
        <h3>{data.title}</h3>
        <Badge>Учебный интерактив</Badge>
      </div>
      <p>{data.instruction}</p>
      {saveError && (
        <p role="status">
          Не удалось сохранить учебное действие. Оно доступно до закрытия
          страницы.
        </p>
      )}
      <div className="segmented" role="group" aria-label="Примеры">
        {data.examples.map((item, n) => (
          <button
            key={n}
            className={index === n ? "selected" : ""}
            aria-pressed={index === n}
            onClick={() => {
              updateState({ ...state, index: n });
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
          <p>
            {current.checks === 1
              ? "Первая самостоятельная проверка."
              : "Проверка после предыдущего разбора."}
          </p>
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
