import { use, useState } from "react";
import { loadLine, loadAllExercises } from "../content/load";
import { topics, sectionTitle } from "../content/catalog";
import type { Exercise } from "../content/model";
import { Breadcrumbs, ExerciseCard, PageHeading } from "../components/ui";
import { href } from "../routes";
import { matchesSearch } from "../lib/search";
import { createAttempt, type LocalAttempt } from "../progress";
import { taskLines } from "./specification";
import { loadOriginals } from "./materials";
import { InlineExercise } from "./ExercisePanel";
import {
  createSession,
  itemId,
  selectPractice,
  type Selection,
} from "./engine";
import { listSessions, saveSession } from "./storage";

export function historyIds(attempts: LocalAttempt[]) {
  const recent = new Map<string, boolean>(),
    hadErrors = new Set<string>();
  const records = attempts.map((a) => ({
    at: a.createdAt,
    id: a.exerciseId,
    correct: a.results[0].status === "correct",
  }));
  // Work results are recomputed from stored snapshots; no persisted score is trusted.
  let sessions: ReturnType<typeof listSessions> = [];
  try {
    sessions = listSessions(window.localStorage);
  } catch {
    /* Storage may be disabled. */
  }
  for (const session of sessions.filter((s) => s.completedAt))
    for (const item of session.items)
      if (item.kind === "exercise") {
        const answer = session.answers[itemId(item)] ?? "";
        if (answer.trim()) {
          const status = gradeExercise(answer, item.exercise).status;
          if (status !== "format_error")
            records.push({
              at: session.completedAt!,
              id: item.exercise.id,
              correct: status === "correct",
            });
        }
      }
  for (const record of records
    .filter((r) => r.id)
    .sort((a, b) => a.at.localeCompare(b.at))) {
    recent.set(record.id, record.correct);
    if (!record.correct) hadErrors.add(record.id);
  }
  return {
    seen: [...recent.keys()],
    errors: [...recent].filter(([, correct]) => !correct).map(([id]) => id),
    hadErrors: [...hadErrors],
    correct: [...recent].filter(([, correct]) => correct).map(([id]) => id),
  };
}
import { gradeExercise } from "./engine";
export function TrainingLaunch({
  bank,
  attempts,
  selection,
  title,
}: {
  bank: Exercise[];
  attempts: LocalAttempt[];
  selection?: Partial<Selection>;
  title?: string;
}) {
  const [count, setCount] = useState("10"),
    [mode, setMode] = useState<"learn" | "control">("learn"),
    [only, setOnly] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="oge-launch">
      <h2>Решить подборку</h2>
      <div className="catalog-controls">
        <label>
          Количество
          <select value={count} onChange={(e) => setCount(e.target.value)}>
            {["5", "10", "20", "all"].map((n) => (
              <option key={n} value={n}>
                {n === "all" ? "Все доступные" : `${n} заданий`}
              </option>
            ))}
          </select>
        </label>
        <label>
          Режим проверки
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "learn" | "control")}
          >
            <option value="learn">Учебный — после ответа</option>
            <option value="control">Контрольный — в конце</option>
          </select>
        </label>
        <label>
          Что включить
          <select value={only} onChange={(e) => setOnly(e.target.value)}>
            <option value="">Все подходящие</option>
            <option value="new">Только новые</option>
            <option value="errors">Только неисправленные ошибки</option>
          </select>
        </label>
        <button
          className="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const history = historyIds(attempts),
                seed = crypto.randomUUID();
              const items = selectPractice(
                bank,
                {
                  ...selection,
                  count: count === "all" ? "all" : Number(count),
                  only: only as Selection["only"],
                  seenIds: history.seen,
                  errorIds: history.errors,
                },
                seed,
              );
              const data = await loadOriginals();
              const session = createSession(
                items.map((exercise) => ({ kind: "exercise", exercise })),
                { ...data, exercises: bank },
                {
                  title: title ?? "Тематическая тренировка ОГЭ",
                  kind: "practice",
                  mode,
                  seed,
                },
              );
              saveSession(window.localStorage, session);
              window.location.assign(
                href(`/oge/practice/session/?id=${session.id}`),
              );
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Не удалось сформировать подборку.",
              );
              setBusy(false);
            }
          }}
        >
          {busy ? "Сохраняем подборку…" : "Начать подборку"}
        </button>
      </div>
      <p>
        Контрольный режим раскрывает разбор после завершения. Ответы сохраняются
        в этом браузере.
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function BankPage({
  line: initialLine,
  attempts,
  save,
}: {
  line?: number;
  attempts: LocalAttempt[];
  save: (a: LocalAttempt) => void;
}) {
  const [params, setParams] = useState(
    () => new URLSearchParams(window.location.search),
  );
  const line = initialLine ?? Number(params.get("line") ?? 2);
  const bank = use(line === 0 ? loadAllExercises() : loadLine(line)).filter(
    (e) => e.exam === "OGE",
  );
  const data = use(loadOriginals());
  const history = historyIds(attempts);
  const q = params.get("q") ?? "",
    topic = params.get("topic") ?? "",
    skill = params.get("skill") ?? "",
    level = params.get("level") ?? "",
    status = params.get("status") ?? "",
    view = params.get("view") ?? "compact";
  const base = `/oge/bank/${initialLine ? `${initialLine}/` : ""}`;
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    if (key === "topic") next.delete("skill");
    window.history.replaceState(
      null,
      "",
      href(base + (next.size ? `?${next}` : "")),
    );
    setParams(next);
  }
  const filtered = bank.filter(
    (e) =>
      (!topic || e.topicId === topic) &&
      (!skill || e.skillId === skill) &&
      (!level || e.level === level) &&
      (!status ||
        (status === "new" && !history.seen.includes(e.id)) ||
        (status === "correct" && history.correct.includes(e.id)) ||
        (status === "errors" && history.errors.includes(e.id)) ||
        (status === "past-errors" && history.hadErrors.includes(e.id))) &&
      matchesSearch(q, [
        String(e.taskLine),
        e.title,
        e.topicTitle,
        e.skillId,
        e.subtopic ?? "",
        e.prompt,
        e.text ?? "",
        ...e.options,
        data.texts.find((t) => t.id === e.sourceTextId)?.paragraphs.join(" ") ??
          "",
      ]),
  );
  const page = Math.max(
    1,
    Math.min(
      Number(params.get("page")) || 1,
      Math.ceil(filtered.length / 10) || 1,
    ),
  );
  const applicable = bank.filter((e) => !topic || e.topicId === topic);
  const returnTo = base + (params.size ? `?${params}` : "");
  return (
    <>
      <Breadcrumbs
        items={[{ label: "ОГЭ", path: "/oge/" }, { label: "Банк заданий" }]}
      />
      <PageHeading
        eyebrow="ОГЭ · БАНК С РАЗБОРОМ"
        title={
          line
            ? `Задание № ${line}: ${taskLines.find((l) => l.number === line)?.title}`
            : "Все задания ОГЭ"
        }
        text="Выберите номер и сразу решайте. Поиск учитывает условие, текст, тему и навык."
      />
      <nav className="oge-lines" aria-label="Номера заданий ОГЭ">
        <a
          href={href("/oge/bank/?line=0")}
          aria-current={line === 0 ? "page" : undefined}
        >
          Все
        </a>
        {taskLines.map((l) => (
          <a
            key={l.number}
            href={href(`/oge/bank/${l.number}/`)}
            aria-current={line === l.number ? "page" : undefined}
          >
            <strong>№ {l.number}</strong>
            <span>{l.title}</span>
          </a>
        ))}
      </nav>
      {[1, 13].includes(line) ? (
        <>
          <p>
            Развёрнутые ответы требуют проверки экспертом. Здесь доступны
            самостоятельные письменные задания с критериями и сохранением
            черновика.
          </p>
          {data.writing
            .filter((w) => w.line === line)
            .map((w) => (
              <article key={w.id} className="question-card">
                <h2>{w.title}</h2>
                <p>{w.prompts[0].text}</p>
                <button
                  className="button"
                  onClick={() => {
                    try {
                      const s = createSession(
                        [{ kind: "writing", writing: w }],
                        { ...data, exercises: [] },
                        {
                          title: w.title,
                          kind: "practice",
                          mode: "learn",
                          seed: w.id,
                        },
                      );
                      saveSession(window.localStorage, s);
                      window.location.assign(
                        href(`/oge/practice/session/?id=${s.id}`),
                      );
                    } catch (error) {
                      window.alert(
                        error instanceof Error
                          ? error.message
                          : "Не удалось сохранить работу",
                      );
                    }
                  }}
                >
                  Открыть письменное задание
                </button>
              </article>
            ))}
        </>
      ) : (
        <>
          <div className="catalog-controls">
            <label className="search-field">
              Найти задание
              <input
                placeholder="Номер, тема, слово из условия"
                value={q}
                onChange={(e) => update("q", e.target.value)}
              />
            </label>
            <label>
              Тема
              <select
                value={topic}
                onChange={(e) => update("topic", e.target.value)}
              >
                <option value="">Все темы этой линии</option>
                {topics
                  .filter((t) => bank.some((e) => e.topicId === t.id))
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Навык
              <select
                value={skill}
                onChange={(e) => update("skill", e.target.value)}
              >
                <option value="">Все применимые навыки</option>
                {[...new Set(applicable.map((e) => e.skillId))].map((id) => (
                  <option key={id} value={id}>
                    {applicable.find((e) => e.skillId === id)?.topicTitle}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Сложность
              <select
                value={level}
                onChange={(e) => update("level", e.target.value)}
              >
                <option value="">Все уровни</option>
                <option value="basic">Базовый</option>
                <option value="standard">Обычный</option>
                <option value="advanced">Усложнённый учебный</option>
              </select>
            </label>
            <label>
              Решение
              <select
                value={status}
                onChange={(e) => update("status", e.target.value)}
              >
                <option value="">Любой статус</option>
                <option value="new">Новые</option>
                <option value="correct">Последний ответ верный</option>
                <option value="errors">Неисправленные ошибки</option>
                <option value="past-errors">Были ошибки</option>
              </select>
            </label>
            <label>
              Вид банка
              <select
                value={view}
                onChange={(e) => update("view", e.target.value)}
              >
                <option value="compact">Компактный каталог</option>
                <option value="expanded">Решать на этой странице</option>
              </select>
            </label>
          </div>
          <p className="results-count" role="status">
            Найдено заданий: {filtered.length}
          </p>
          <div className={view === "compact" ? "topic-grid" : "oge-expanded"}>
            {filtered.slice((page - 1) * 10, page * 10).map((e) =>
              view === "compact" ? (
                <div key={e.id}>
                  <ExerciseCard exercise={e} returnTo={returnTo} />
                  <p className="muted">
                    {history.errors.includes(e.id)
                      ? "Есть ошибка"
                      : history.correct.includes(e.id)
                        ? "Последний ответ верный"
                        : history.seen.includes(e.id)
                          ? "Выполнено"
                          : "Новое"}{" "}
                    ·{" "}
                    {sectionTitle(
                      topics.find((t) => t.id === e.topicId)?.sectionId ?? "",
                    )}
                  </p>
                </div>
              ) : (
                <InlineExercise
                  key={e.id}
                  exercise={e}
                  text={data.texts.find((t) => t.id === e.sourceTextId)}
                  checked={(exercise, answer) =>
                    save(createAttempt(exercise, answer, false))
                  }
                />
              ),
            )}
          </div>
          {!filtered.length && (
            <p>По этим условиям заданий нет. Измените фильтры.</p>
          )}
          {filtered.length > 10 && (
            <nav className="pagination" aria-label="Страницы банка">
              <button
                className="button secondary"
                disabled={page === 1}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("page", String(page - 1));
                  setParams(next);
                  window.history.replaceState(
                    null,
                    "",
                    href(base + `?${next}`),
                  );
                }}
              >
                Предыдущая
              </button>
              <span>
                Страница {page} из {Math.ceil(filtered.length / 10)}
              </span>
              <button
                className="button secondary"
                disabled={page * 10 >= filtered.length}
                onClick={() => {
                  const next = new URLSearchParams(params);
                  next.set("page", String(page + 1));
                  setParams(next);
                  window.history.replaceState(
                    null,
                    "",
                    href(base + `?${next}`),
                  );
                }}
              >
                Следующая
              </button>
            </nav>
          )}
          <TrainingLaunch
            bank={filtered}
            attempts={attempts}
            title={
              line ? `Подборка: задание № ${line}` : "Смешанная тренировка ОГЭ"
            }
          />
          {line > 0 && (
            <p>
              <a href={href(`/oge/theory/?line=${line}`)}>
                Теория задания № {line}
              </a>
            </p>
          )}
        </>
      )}
    </>
  );
}
