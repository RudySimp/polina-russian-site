import { useState } from "react";
import {
  gradeAnswer,
  normalize,
  type Grade,
} from "../../../../src/lib/grading";
import {
  exercises,
  sectionTitle,
  topics,
  type Exercise,
} from "../content/registry";
import { createAttempt, type LocalAttempt } from "../progress";
import { nextExercise } from "../lib/recommendations";
import { examName, levelName } from "../lib/search";
import { Badge, Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { href } from "../routes";
import { NotFoundPage } from "./InfoPages";

function AnswerControl({
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
  if (exercise.input === "single")
    return (
      <fieldset className="choice-list" disabled={locked}>
        <legend>Ваш ответ</legend>
        {exercise.options.map((option, index) => (
          <label key={index}>
            <input
              type="radio"
              name="answer"
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
    <label className="answer-field" htmlFor="answer">
      Ваш ответ
      <input
        id="answer"
        readOnly={locked}
        aria-describedby="answer-instruction"
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
export function PracticePage({
  slug,
  attempts,
  save,
}: {
  slug: string;
  attempts: LocalAttempt[];
  save: (attempt: LocalAttempt) => void;
}) {
  const aliases: Record<string, string> = {
    "ege-punctuation": "ege-punctuation-1",
    "ege-stress": "ege-stress-1",
    "oge-syntax": "oge-syntax-1",
  };
  const exercise = exercises.find(
    (exercise) => exercise.slug === (aliases[slug] ?? slug),
  );
  if (!exercise) return <NotFoundPage />;
  return <Question initial={exercise} attempts={attempts} save={save} />;
}
function Question({
  initial,
  attempts,
  save,
}: {
  initial: Exercise;
  attempts: LocalAttempt[];
  save: (attempt: LocalAttempt) => void;
}) {
  const [exercise, setExercise] = useState(initial);
  const [answer, setAnswer] = useState("");
  const [grade, setGrade] = useState<Grade | null>(null);
  const [repeat, setRepeat] = useState(
    new URLSearchParams(window.location.search).has("repeat"),
  );
  const [locked, setLocked] = useState(false);
  const [returnTo] = useState(() => {
    const from = new URLSearchParams(window.location.search).get("from") ?? "";
    return /^\/practice\/(?:\?|$)/.test(from) && from.length < 1000 ? from : "";
  });
  const next = nextExercise(exercise, attempts);
  const expected = exercise.answers[0];
  const topic = topics.find((topic) => topic.id === exercise.topicId)!;
  function check() {
    const result = gradeAnswer(answer, exercise);
    setGrade(result);
    if (result.status !== "format_error" && !locked) {
      save(createAttempt(exercise, answer, repeat));
      setLocked(true);
    }
  }
  function continuePractice() {
    if (!next) return;
    setExercise(next);
    setAnswer("");
    setGrade(null);
    setLocked(false);
    setRepeat(true);
    window.history.replaceState(
      null,
      "",
      href(
        `/practice/${next.slug}/?repeat=1${returnTo ? `&from=${encodeURIComponent(returnTo)}` : ""}`,
      ),
    );
    document.getElementById("main")?.scrollIntoView({ behavior: "instant" });
  }
  return (
    <>
      <Breadcrumbs
        items={[
          {
            label: examName(exercise.exam),
            path: `/${exercise.exam.toLowerCase()}/`,
          },
          {
            label: "Практика",
            path:
              returnTo || `/practice/?exam=${exercise.exam}&topic=${topic.id}`,
          },
          {
            label: topic.title,
            path: `/theory/${topic.slug}/?exam=${exercise.exam}`,
          },
          { label: "Задание" },
        ]}
      />
      <PageHeading
        eyebrow={`${examName(exercise.exam)} · ${sectionTitle(topic.sectionId)}`}
        title={exercise.title}
        text={
          exercise.format === "learning"
            ? "Учебное упражнение для понимания правила."
            : "Тренировка в экзаменационной модели с подробным разбором."
        }
      />
      <div className="practice-meta">
        <Badge>{levelName(exercise.level)}</Badge>
        {exercise.taskLine && <Badge>Задание {exercise.taskLine}</Badge>}
        <span>
          {exercise.examModel.status === "project"
            ? `${exercise.examModel.year}: проект модели`
            : `Модель ${exercise.examModel.year}`}
        </span>
        <span>Оригинальный демонстрационный материал</span>
        {returnTo && <a href={href(returnTo)}>Вернуться к подборке</a>}
      </div>
      <div className="question-layout">
        <article className="question-card">
          <h2>Условие</h2>
          <p className="question-prompt">{exercise.prompt}</p>
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
              {exercise.options.map((option, index) => (
                <li key={index}>{option}</li>
              ))}
            </ol>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              check();
            }}
          >
            <AnswerControl
              exercise={exercise}
              answer={answer}
              locked={locked}
              change={(value) => {
                if (!locked) {
                  setAnswer(value);
                  setGrade(null);
                }
              }}
            />
            <p className="answer-instruction" id="answer-instruction">
              {exercise.instruction}
            </p>
            <button className="button" type="submit" disabled={locked}>
              Проверить ответ
            </button>
            {locked && (
              <p className="muted">
                Ответ сохранён. Продолжите подборку или начните это задание
                заново.
              </p>
            )}
          </form>
          <details className="hint">
            <summary>Нужна подсказка?</summary>
            <p>{exercise.hint}</p>
          </details>
        </article>
        <aside className="practice-guide">
          <h2>Этот навык</h2>
          <p>{topic.title}</p>
          <ol>
            {exercise.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <LinkButton
            to={`/theory/${topic.slug}/?exam=${exercise.exam}`}
            secondary
          >
            Вернуться к правилу
          </LinkButton>
          <a href={href(`/practice/?exam=${exercise.exam}&topic=${topic.id}`)}>
            Все задания по теме
          </a>
        </aside>
      </div>
      {grade && (
        <section
          className={`feedback answer-feedback ${grade.status === "correct" ? "correct" : "incorrect"}`}
          aria-live="polite"
        >
          <h2>
            {grade.status === "format_error"
              ? "Уточните формат ответа"
              : grade.status === "correct"
                ? repeat
                  ? "Повторение получилось!"
                  : "Верно! Правило работает."
                : "Разберём ответ вместе"}
          </h2>
          {grade.status === "format_error" ? (
            <>
              <p>{grade.message}</p>
              <p>
                Попытка по предметному навыку не засчитана. Исправьте ввод и
                проверьте ещё раз.
              </p>
            </>
          ) : (
            <>
              <p>
                Ваш ответ: <strong>{answer}</strong>. Правильный ответ:{" "}
                <strong>{expected}</strong>.
              </p>
              <div className="explanation-text">
                {exercise.explanation.split("\n\n").map((paragraph, index) => (
                  <p key={index}>{paragraph}</p>
                ))}
              </div>
              {exercise.optionExplanations.length > 0 && (
                <div className="option-analysis">
                  <h3>Разбор вариантов</h3>
                  {exercise.optionExplanations.map((explanation, index) => {
                    const number = String(index + 1),
                      selected = normalize(
                        answer,
                        exercise.responseKind,
                        exercise.policy,
                      ).includes(number),
                      needed = expected.includes(number);
                    return (
                      <div key={index}>
                        <h4>
                          Вариант {number}:{" "}
                          {selected && !needed
                            ? "выбран лишний вариант"
                            : !selected && needed
                              ? "верный вариант пропущен"
                              : needed
                                ? "верный вариант"
                                : "не подходит"}
                          .
                        </h4>
                        <p>{explanation.replace(/^\d\)\s*/u, "")}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="inline-actions">
                {next ? (
                  <button className="button" onClick={continuePractice}>
                    {grade.status === "correct"
                      ? "Следующее упражнение"
                      : "Похожее задание"}
                  </button>
                ) : (
                  <div className="collection-complete">
                    <h3>Подборка завершена</h3>
                    <p>
                      Вы выполнили все доступные задания этого экзамена и
                      навыка. Можно повторить правило или выбрать другую тему.
                    </p>
                    <LinkButton
                      to={`/practice/?exam=${exercise.exam}`}
                      secondary
                    >
                      Выбрать другую тему
                    </LinkButton>
                  </div>
                )}
                <LinkButton
                  to={`/theory/${topic.slug}/?exam=${exercise.exam}`}
                  secondary
                >
                  Разобрать правило
                </LinkButton>
                <button
                  className="text-button"
                  onClick={() => {
                    setAnswer("");
                    setGrade(null);
                    setLocked(false);
                    setRepeat(true);
                  }}
                >
                  Начать это задание заново
                </button>
              </div>
            </>
          )}
        </section>
      )}
      <details className="provenance-details">
        <summary>Происхождение и статус задания</summary>
        <p>
          {exercise.source.sourceTitle}
          {exercise.provenance.sourceNumber
            ? ` · вариант ${exercise.provenance.sourceNumber}`
            : ""}
          .
        </p>
        <p>
          {exercise.provenance.method === "local-original-import"
            ? "Импортировано из предоставленного оригинального каталога. Ответ и разбор проверены для демонстрационной редакции."
            : "Оригинальный пример проекта."}{" "}
          Окончательное утверждение преподавателем ожидается.
        </p>
        <p>
          Результат — самостоятельная тренировка, без начисления итоговых баллов
          ОГЭ или ЕГЭ.
        </p>
        <a href={href("/sources/")}>Источники и права</a>
      </details>
    </>
  );
}
