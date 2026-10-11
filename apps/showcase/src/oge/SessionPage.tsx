import { useEffect, useRef, useState } from "react";
import { AnswerControl } from "../components/AnswerControl";
import { Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { href } from "../routes";
import { createAttempt, type LocalAttempt } from "../progress";
import { ExerciseFeedback, ExerciseStatement } from "./ExercisePanel";
import { advanceSession, readSession, saveSession } from "./storage";
import {
  gradeExercise,
  itemId,
  itemLine,
  remainingSeconds,
  resultsFor,
  wordCount,
} from "./engine";
import { specification } from "./specification";
import type { PracticeSession, WritingAssignment } from "./model";

function initialWork(): PracticeSession | undefined {
  try {
    return readSession(
      window.localStorage,
      new URLSearchParams(window.location.search).get("id") ?? "",
    );
  } catch {
    return undefined;
  }
}
function WritingCriteria({ writing }: { writing: WritingAssignment }) {
  return (
    <details className="oge-criteria" open>
      <summary>Критерии и самопроверка</summary>
      <p>
        Минимум — 70 слов. Счётчик помогает проверить объём; содержание, логику,
        речевые и языковые ошибки оценивает эксперт.
      </p>
      <table>
        <caption>
          Проект ОГЭ-2027: {writing.line === 1 ? "изложение" : "сочинение"}
        </caption>
        <thead>
          <tr>
            <th scope="col">Критерий</th>
            <th scope="col">Максимум</th>
          </tr>
        </thead>
        <tbody>
          {(writing.line === 1
            ? [
                ["ИК1 · Сохранение микротем", "2"],
                ["ИК2 · Приёмы сжатия", "2"],
                ["ИК3 · Логика", "2"],
              ]
            : [
                ["СК1 · Ответ на вопрос", "1"],
                ["СК2 · Два примера из текста и пояснение каждого", "4"],
                ["СК3 · Логика", "2"],
                ["СК4 · Композиция", "1"],
              ]
          ).map(([label, score]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              <td>{score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul>
        {writing.checklist.map((item) => (
          <li key={item}>
            <label>
              <input type="checkbox" /> {item}
            </label>
          </li>
        ))}
      </ul>
      <p>
        Грамотность и фактическая точность проверяются совместно по двум
        письменным ответам, максимум — 13 баллов. Для этой проверки нужны
        суммарные 140 слов; если зачтена только одна работа, в ней самой должно
        быть не менее 140.
      </p>
      <a href={specification.sourceUrl} target="_blank" rel="noreferrer">
        Документы ФИПИ: модель и критерии
      </a>
    </details>
  );
}
function SummaryAudio({
  session,
  writing,
  update,
}: {
  session: PracticeSession;
  writing: WritingAssignment;
  update: (patch: Partial<PracticeSession>) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null),
    lastSaved = useRef(0);
  const [playing, setPlaying] = useState(false),
    [error, setError] = useState(""),
    [now, setNow] = useState(() => Date.now());
  const material = session.audio.find((a) => a.id === writing.audioId);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  if (!material)
    return (
      <p role="alert">
        Аудиозапись отсутствует. Работа не может считаться полным вариантом.
      </p>
    );
  const completed = session.audioCompletedPlays[material.id] ?? 0,
    started = session.audioPlays[material.id] ?? 0;
  const waiting =
    session.mode === "control" && completed === 1
      ? Math.max(
          0,
          Math.ceil(
            (Date.parse(session.audioLastEndedAt[material.id] ?? "") +
              specification.writing.pauseMinutes * 60000 -
              now) /
              1000,
          ),
        )
      : 0;
  const limit = session.mode === "control" && completed >= 2;
  return (
    <section className="oge-audio">
      <h3>Аудиотекст изложения</h3>
      <p>
        {material.attribution}. Продолжительность:{" "}
        {Math.ceil(material.durationSeconds / 60)} мин.
      </p>
      <audio
        ref={audio}
        src={href(material.path)}
        preload="metadata"
        onLoadedMetadata={() => {
          if (audio.current)
            audio.current.currentTime =
              session.audioPositions[material.id] ?? 0;
        }}
        onTimeUpdate={() => {
          const position = audio.current?.currentTime ?? 0;
          if (Math.abs(position - lastSaved.current) >= 5) {
            lastSaved.current = position;
            update({
              audioPositions: {
                ...session.audioPositions,
                [material.id]: position,
              },
            });
          }
        }}
        onEnded={() => {
          setPlaying(false);
          lastSaved.current = 0;
          update({
            audioCompletedPlays: {
              ...session.audioCompletedPlays,
              [material.id]: completed + 1,
            },
            audioPositions: { ...session.audioPositions, [material.id]: 0 },
            audioLastEndedAt: {
              ...session.audioLastEndedAt,
              [material.id]: new Date().toISOString(),
            },
          });
        }}
        onError={() => {
          setError(
            "Не удалось открыть аудиозапись. Проверьте подключение и повторите воспроизведение.",
          );
          setPlaying(false);
        }}
      />
      <button
        className="button secondary"
        disabled={limit || waiting > 0 || !!session.completedAt}
        onClick={async () => {
          setError("");
          if (!audio.current) return;
          if (playing) {
            audio.current.pause();
            setPlaying(false);
          } else {
            try {
              await audio.current.play();
              setPlaying(true);
              if (started === completed)
                update({
                  audioPlays: {
                    ...session.audioPlays,
                    [material.id]: started + 1,
                  },
                });
            } catch {
              setError("Браузер не начал воспроизведение. Повторите нажатие.");
            }
          }
        }}
      >
        {playing
          ? "Пауза"
          : started > completed
            ? "Продолжить прослушивание"
            : "Слушать текст"}
      </button>
      <p role="status">
        {session.mode === "control"
          ? `Завершено прослушиваний: ${completed} из 2. Между ними — пауза 5 минут.`
          : "Учебный режим: можно слушать повторно."}
        {waiting > 0 &&
          ` До второго прослушивания ${Math.floor(waiting / 60)}:${String(waiting % 60).padStart(2, "0")}.`}
      </p>
      {error && <p role="alert">{error}</p>}
      {(session.mode === "learn" || session.completedAt) && (
        <details>
          <summary>Текст и микротемы для разбора</summary>
          {material.transcript.split("\n\n").map((p, n) => (
            <p key={n}>{p}</p>
          ))}
          <ol>
            {writing.microtopics?.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ol>
          <p>{writing.analysis}</p>
        </details>
      )}
    </section>
  );
}
export function SessionPage({
  saveAttempt,
}: {
  saveAttempt: (attempt: LocalAttempt) => void;
}) {
  const [session, setSession] = useState(initialWork),
    [saveError, setSaveError] = useState(""),
    [formatError, setFormatError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [now, setNow] = useState(() => Date.now());
  const latest = useRef(session);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const listener = (event: StorageEvent) => {
      if (latest.current && event.key?.endsWith(latest.current.id))
        setSaveError(
          "Работа изменена в другой вкладке. Обновите страницу перед продолжением.",
        );
    };
    window.addEventListener("storage", listener);
    return () => window.removeEventListener("storage", listener);
  }, []);
  if (!session)
    return (
      <>
        <PageHeading
          eyebrow="ЛОКАЛЬНАЯ РАБОТА"
          title="Работа не найдена"
          text="Черновик хранится только в браузере, где вы начали работу. Он мог быть удалён или не пройти проверку целостности."
        />
        <LinkButton to="/oge/results/">Открыть сохранённые работы</LinkButton>
        <LinkButton to="/oge/bank/" secondary>
          Выбрать задания
        </LinkButton>
      </>
    );
  const item = session.items[session.activeIndex],
    id = itemId(item),
    answer = session.answers[id] ?? "",
    checked = session.checkedIds.includes(id);
  const seconds = remainingSeconds(session, now),
    expired = seconds === 0 && !session.completedAt;
  function update(patch: Partial<PracticeSession>) {
    const previous = latest.current!;
    const next = advanceSession(previous, patch);
    try {
      saveSession(window.localStorage, next, previous.updatedAt);
      setSaveError("");
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Не удалось сохранить ответы.",
      );
    }
    latest.current = next;
    setSession(next);
  }
  function navigate(index: number) {
    update({ activeIndex: index });
    setFormatError("");
    document.getElementById("work-question")?.focus();
  }
  function complete() {
    const previous = latest.current!;
    for (const result of resultsFor(previous))
      if (
        result.item.kind === "exercise" &&
        result.grade &&
        result.grade.status !== "format_error" &&
        !previous.checkedIds.includes(itemId(result.item))
      )
        saveAttempt(createAttempt(result.item.exercise, result.answer, false));
    update({ completedAt: new Date().toISOString() });
    setConfirm(false);
    document.getElementById("main")?.scrollIntoView({ behavior: "instant" });
  }
  const empty = session.items.filter(
    (item) => !(session.answers[itemId(item)] ?? "").trim(),
  );
  if (session.completedAt)
    return (
      <>
        {saveError && (
          <p className="storage-error" role="alert">
            {saveError}
          </p>
        )}
        <SessionResults session={session} />
      </>
    );
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "ОГЭ", path: "/oge/" },
          { label: "Работы", path: "/oge/results/" },
          { label: session.title },
        ]}
      />
      <PageHeading
        eyebrow={
          session.mode === "control" ? "КОНТРОЛЬНАЯ РАБОТА" : "УЧЕБНАЯ ПОДБОРКА"
        }
        title={session.title}
        text="ОГЭ-2027, проект модели. Ответы и состав работы сохраняются в этом браузере."
      />
      <div className="oge-work-status">
        <span role="status">
          {saveError ? "Сохранение требует внимания" : "Черновик сохранён"}
        </span>
        <span>
          Ответов: {session.items.length - empty.length} из{" "}
          {session.items.length}
        </span>
        {seconds !== undefined && (
          <span>
            Осталось: {Math.floor(seconds / 3600)}:
            {String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </span>
        )}
      </div>
      {saveError && (
        <p className="storage-error" role="alert">
          {saveError}
        </p>
      )}
      {expired && (
        <p role="alert">
          Время истекло. Завершите работу, чтобы открыть результат.
        </p>
      )}
      <nav className="oge-work-nav" aria-label="Задания работы">
        {session.items.map((i, n) => (
          <button
            key={itemId(i)}
            className="button secondary"
            aria-current={n === session.activeIndex ? "step" : undefined}
            onClick={() => navigate(n)}
          >
            {session.kind === "practice" ? n + 1 : `№ ${itemLine(i)}`}
            <span className="sr-only">
              {(session.answers[itemId(i)] ?? "").trim()
                ? " — ответ записан"
                : " — без ответа"}
            </span>
            <span aria-hidden="true">
              {(session.answers[itemId(i)] ?? "").trim() ? " ✓" : ""}
            </span>
          </button>
        ))}
      </nav>
      <article className="question-card" id="work-question" tabIndex={-1}>
        <h2>
          {item.kind === "exercise" ? item.exercise.title : item.writing.title}
        </h2>
        {item.kind === "exercise" ? (
          <>
            <ExerciseStatement
              exercise={item.exercise}
              text={session.texts.find(
                (t) => t.id === item.exercise.sourceTextId,
              )}
            />
            <AnswerControl
              exercise={item.exercise}
              answer={answer}
              locked={checked || expired}
              change={(value) => {
                update({
                  answers: { ...latest.current!.answers, [id]: value },
                });
                setFormatError("");
              }}
            />
            <p className="answer-instruction">{item.exercise.instruction}</p>
            {session.mode === "learn" && (
              <>
                <button
                  className="button"
                  disabled={checked || expired}
                  onClick={() => {
                    const grade = gradeExercise(answer, item.exercise);
                    if (grade.status === "format_error")
                      setFormatError(grade.message);
                    else {
                      update({ checkedIds: [...session.checkedIds, id] });
                      saveAttempt(createAttempt(item.exercise, answer, false));
                    }
                  }}
                >
                  Проверить ответ
                </button>
                {checked && (
                  <ExerciseFeedback exercise={item.exercise} answer={answer} />
                )}
                <details className="hint">
                  <summary>Подсказка</summary>
                  <p>{item.exercise.hint}</p>
                </details>
              </>
            )}
          </>
        ) : (
          <>
            {item.writing.line === 1 && (
              <SummaryAudio
                key={id}
                session={session}
                writing={item.writing}
                update={update}
              />
            )}
            <fieldset disabled={expired}>
              <legend>Тема письменной работы</legend>
              {item.writing.prompts.length > 1 && (
                <label>
                  Выберите один вопрос
                  <select
                    value={
                      session.selectedPrompts[id] ?? item.writing.prompts[0].id
                    }
                    onChange={(e) =>
                      update({
                        selectedPrompts: {
                          ...session.selectedPrompts,
                          [id]: e.target.value,
                        },
                      })
                    }
                  >
                    {item.writing.prompts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p>
                {
                  (
                    item.writing.prompts.find(
                      (p) =>
                        p.id ===
                        (session.selectedPrompts[id] ??
                          item.writing.prompts[0].id),
                    ) ?? item.writing.prompts[0]
                  ).text
                }
              </p>
              {item.writing.line === 13 &&
                session.texts.find(
                  (t) => t.id === item.writing.sourceTextId,
                ) && (
                  <div className="oge-source">
                    {session.texts
                      .find((t) => t.id === item.writing.sourceTextId)!
                      .paragraphs.map((p, n) => (
                        <p key={n}>{p}</p>
                      ))}
                  </div>
                )}
              <label>
                Ваш письменный ответ
                <textarea
                  rows={14}
                  value={answer}
                  maxLength={30000}
                  onChange={(e) =>
                    update({
                      answers: {
                        ...latest.current!.answers,
                        [id]: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <p role="status">
                Слов: {wordCount(answer)}.{" "}
                {wordCount(answer) < 70
                  ? "До рекомендуемого минимума: " +
                    (70 - wordCount(answer)) +
                    "."
                  : ""}{" "}
                Сложные сокращения и служебные пометы проверьте вручную.
              </p>
            </fieldset>
            <WritingCriteria writing={item.writing} />
          </>
        )}
        {formatError && (
          <p role="alert">
            {formatError} Такая ошибка не влияет на оценку навыка.
          </p>
        )}
      </article>
      <div className="inline-actions">
        <button
          className="button secondary"
          disabled={session.activeIndex === 0}
          onClick={() => navigate(session.activeIndex - 1)}
        >
          Предыдущее задание
        </button>
        <button
          className="button"
          disabled={session.activeIndex === session.items.length - 1}
          onClick={() => navigate(session.activeIndex + 1)}
        >
          Следующее задание
        </button>
        <button className="button secondary" onClick={() => setConfirm(true)}>
          Завершить работу
        </button>
      </div>
      {confirm && (
        <section className="editorial-note" role="alert">
          <h2>Завершить и открыть разбор?</h2>
          <p>
            {empty.length
              ? `Без ответа осталось заданий: ${empty.length}. Вы можете вернуться и заполнить их.`
              : "Все поля заполнены. После завершения ответы этой попытки будут зафиксированы."}
          </p>
          <button className="button" onClick={complete}>
            Подтвердить завершение
          </button>
          <button
            className="button secondary"
            onClick={() => setConfirm(false)}
          >
            Продолжить работу
          </button>
        </section>
      )}
    </>
  );
}
export function SessionResults({ session }: { session: PracticeSession }) {
  const results = resultsFor(session),
    correct = results.filter((r) => r.status === "correct").length,
    incorrect = results.filter((r) => r.status === "incorrect"),
    skipped = results.filter((r) => r.status === "skipped"),
    format = results.filter((r) => r.status === "format_error"),
    expert = results.filter((r) => r.status === "expert");
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "ОГЭ", path: "/oge/" },
          { label: "Результаты", path: "/oge/results/" },
          { label: session.title },
        ]}
      />
      <PageHeading
        eyebrow="РАБОТА ЗАВЕРШЕНА"
        title="Результаты и разбор"
        text={session.title}
      />
      <div className="stats-grid">
        <div>
          <strong>{correct}</strong>
          <span>верных ответов</span>
        </div>
        <div>
          <strong>{incorrect.length}</strong>
          <span>предметных ошибок</span>
        </div>
        <div>
          <strong>{skipped.length}</strong>
          <span>пропущенных тестовых заданий</span>
        </div>
      </div>
      <p>
        Автоматически проверенная часть: {correct} из{" "}
        {results.filter((r) => r.item.kind === "exercise").length}. Ошибок
        формата: {format.length}. Развёрнутых ответов для эксперта:{" "}
        {expert.length}.
      </p>
      {expert.length > 0 && (
        <p className="editorial-note">
          Изложение, сочинение и общая грамотность ещё не оценены. Общий
          официальный балл и школьная отметка не вычисляются.
        </p>
      )}
      {incorrect.length > 0 && (
        <div className="inline-actions">
          <button
            className="button"
            onClick={() => {
              try {
                const ids = incorrect
                  .filter((r) => r.item.kind === "exercise")
                  .map((r) => itemId(r.item));
                const repeat = {
                  ...structuredClone(session),
                  id: crypto.randomUUID(),
                  title: "Повторение ошибок: " + session.title,
                  kind: "practice" as const,
                  mode: "learn" as const,
                  items: session.items.filter((item) =>
                    ids.includes(itemId(item)),
                  ),
                  answers: {},
                  checkedIds: [],
                  selectedPrompts: {},
                  activeIndex: 0,
                  startedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  completedAt: undefined,
                  durationMinutes: undefined,
                };
                saveSession(window.localStorage, repeat);
                window.location.assign(
                  href(`/oge/practice/session/?id=${repeat.id}`),
                );
              } catch (error) {
                window.alert(
                  error instanceof Error
                    ? error.message
                    : "Не удалось сохранить повторение",
                );
              }
            }}
          >
            Повторить только ошибки
          </button>
          <LinkButton to="/oge/generator/?mode=thematic" secondary>
            Новая тематическая подборка
          </LinkButton>
        </div>
      )}
      <p>
        Один результат показывает правильность этой работы. Для вывода об
        освоении навыка нужны разные задания и повторные проверки.
      </p>
      {results.map((result, n) => (
        <section className="question-card oge-result" key={itemId(result.item)}>
          <h2>
            {session.kind === "practice"
              ? `Упражнение ${n + 1}`
              : `Задание № ${itemLine(result.item)}`}
            :{" "}
            {result.item.kind === "exercise"
              ? result.item.exercise.title
              : result.item.writing.title}
          </h2>
          {result.item.kind === "exercise" ? (
            result.status === "skipped" ? (
              <>
                <p>
                  Пропущено. Эталон: {result.item.exercise.answers.join(" / ")}.
                </p>
                <p>{result.item.exercise.explanation}</p>
                <a
                  href={href(
                    `/theory/${result.item.exercise.topicSlug}/?exam=OGE`,
                  )}
                >
                  Повторить правило
                </a>
              </>
            ) : (
              <ExerciseFeedback
                exercise={result.item.exercise}
                answer={result.answer}
                revealKey
              />
            )
          ) : (
            <>
              <p>
                Требуется экспертная проверка · {wordCount(result.answer)} слов.
              </p>
              <div className="oge-written-answer">
                {result.answer || "Письменный ответ не записан."}
              </div>
              <WritingCriteria writing={result.item.writing} />
              <details>
                <summary>Пример анализа содержания</summary>
                <p>{result.item.writing.analysis}</p>
                {result.item.writing.microtopics && (
                  <ol>
                    {result.item.writing.microtopics.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ol>
                )}
              </details>
            </>
          )}
        </section>
      ))}
      <div className="inline-actions">
        <LinkButton to="/oge/results/">Все сохранённые работы</LinkButton>
        <LinkButton to="/oge/bank/" secondary>
          Вернуться к банку
        </LinkButton>
      </div>
    </>
  );
}
