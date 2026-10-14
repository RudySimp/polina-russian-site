import { LoadRecovery } from "../components/LoadRecovery";
import { ExerciseFeedback } from "../oge/ExercisePanel";
import { use, useState } from "react";
import { normalize, type Grade } from "../../../../src/lib/grading";
import {
  exerciseIndex as exercises,
  sectionTitle,
  topics,
  type Exercise,
} from "../content/catalog";
import { loadExercise } from "../content/load";
import { createAttempt, type LocalAttempt } from "../progress";
import { nextExercise } from "../lib/recommendations";
import { examName, levelName } from "../lib/search";
import { Badge, Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { href } from "../routes";
import { NotFoundPage } from "./InfoPages";

import { AnswerControl } from "../components/AnswerControl";
import { gradeExercise } from "../oge/engine";
import { SourcePassage } from "../oge/ExercisePanel";
import { loadOriginals } from "../oge/materials";

function OriginalPassage({ id }: { id: string }) {
  const text = use(loadOriginals()).texts.find((t) => t.id === id);
  return text ? (
    <SourcePassage text={text} />
  ) : (
    <p role="alert">Исходный текст задания не найден.</p>
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
  const summary = exercises.find(
    (exercise) => exercise.slug === (aliases[slug] ?? slug),
  );
  if (!summary) return <NotFoundPage />;
  const exercise = use(loadExercise(summary.id));
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
  const [loadingNext, setLoadingNext] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [returnTo] = useState(() => {
    const from = new URLSearchParams(window.location.search).get("from") ?? "";
    return /^\/(?:practice\/(?:\?|$)|oge\/bank\/(?:\d+\/)?(?:\?|$)|oge\/results\/(?:\?|$))/.test(
      from,
    ) && from.length < 1000
      ? from
      : "";
  });
  const next = nextExercise(exercise, attempts);
  const expected = exercise.answers[0];
  const topic = topics.find((topic) => topic.id === exercise.topicId)!;
  function check() {
    const result = gradeExercise(answer, exercise);
    setGrade(result);
    if (result.status !== "format_error" && !locked) {
      save(createAttempt(exercise, answer, repeat));
      setLocked(true);
    }
  }
  async function continuePractice() {
    if (!next || loadingNext) return;
    setLoadingNext(true);
    setLoadError("");
    let loaded;
    try {
      loaded = await loadExercise(next.id);
      if (!loaded) throw new Error("Задание не найдено.");
    } catch {
      setLoadError(
        "Следующее задание не загрузилось. Сохранённый ответ доступен; перезагрузите страницу для повторной загрузки.",
      );
      setLoadingNext(false);
      return;
    }
    setExercise(loaded);
    setAnswer("");
    setGrade(null);
    setLocked(false);
    setRepeat(true);
    setLoadingNext(false);
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
              returnTo ||
              (exercise.exam === "OGE"
                ? `/oge/bank/${exercise.taskLine ?? ""}/?topic=${topic.id}`
                : `/practice/?exam=${exercise.exam}&topic=${topic.id}`),
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
          {exercise.sourceTextId && (
            <OriginalPassage id={exercise.sourceTextId} />
          )}
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
          <a
            href={href(
              exercise.exam === "OGE"
                ? `/oge/bank/${exercise.taskLine ?? ""}/?topic=${topic.id}`
                : `/practice/?exam=${exercise.exam}&topic=${topic.id}`,
            )}
          >
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
              {exercise.exam === "OGE" ? (
                <ExerciseFeedback exercise={exercise} answer={answer} />
              ) : (
                <>
                  <p>
                    Ваш ответ: <strong>{answer}</strong>. Правильный ответ:{" "}
                    <strong>{expected}</strong>.
                  </p>
                  <div className="explanation-text">
                    {exercise.explanation
                      .split("\n\n")
                      .map((paragraph, index) => (
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
                              {exercise.input === "matching"
                                ? "разбор предложения"
                                : selected && !needed
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
                </>
              )}
              <div className="inline-actions">
                {next ? (
                  <button
                    className="button"
                    onClick={continuePractice}
                    disabled={loadingNext}
                  >
                    {loadingNext
                      ? "Загружаем задание…"
                      : grade.status === "correct"
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
                      to={
                        exercise.exam === "OGE"
                          ? "/oge/bank/"
                          : `/practice/?exam=${exercise.exam}`
                      }
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
              {loadError && <LoadRecovery message={loadError} />}
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
