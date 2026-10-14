import { LoadRecovery } from "../components/LoadRecovery";
import searchIndex from "../content/exercise-search.json";
import { use, useMemo, useState, useEffect } from "react";
import { loadExercise, loadExercises } from "../content/load";
import {
  exerciseIndex,
  topics,
  type ExerciseSummary,
} from "../content/catalog";
import subskills from "../content/subskills.json";
import { Breadcrumbs, ExerciseCard, PageHeading } from "../components/ui";
import { href } from "../routes";
import { matchesSearch } from "../lib/search";
import { useCatalogQuery } from "../lib/catalog-query";
import { createAttempt, type LocalAttempt } from "../progress";
import { taskLines } from "./specification";
import { loadOriginals } from "./materials";
import { InlineExercise } from "./ExercisePanel";
import {
  createSession,
  selectPractice,
  shuffled,
  type Selection,
} from "./engine";
import { listSessionSummaries } from "./storage";
import { saveSessionDurably, listSessionSummariesDurably } from "./repository";
import type { SourceText, WritingAssignment } from "./model";

const searchTextById = new Map(searchIndex.map((e) => [e.id, e.text]));
export function historyIds(
  attempts: LocalAttempt[],
  storedSummaries?: ReturnType<typeof listSessionSummaries>,
) {
  const current = new Map(exerciseIndex.map((e) => [e.id, e.revision]));
  const records = attempts.flatMap((a) =>
    a.results[0]?.status === "format_error"
      ? []
      : [
          {
            at: a.createdAt,
            id: a.exerciseId,
            revision: a.revision,
            correct: a.results[0]?.status === "correct",
          },
        ],
  );
  let summaries: ReturnType<typeof listSessionSummaries> =
    storedSummaries ?? [];
  if (!storedSummaries)
    try {
      summaries = listSessionSummaries(window.localStorage);
    } catch {}
  const seenWriting = new Set<string>(),
    seenTexts = new Set<string>(),
    seenAudio = new Set<string>(),
    seenExercises = new Set<string>();
  for (const s of summaries) {
    for (const ref of s.exerciseRefs ?? []) {
      if (ref.answered && current.get(ref.id) === ref.revision)
        seenExercises.add(ref.id);
      if (ref.status && ref.status !== "format_error")
        records.push({
          at: s.updatedAt,
          id: ref.id,
          revision: ref.revision,
          correct: ref.status === "correct",
        });
    }
    for (const ref of s.writingRefs ?? [])
      if (ref.answered) {
        seenWriting.add(ref.id + "@" + ref.revision);
        const text = s.textRefs.find((t) => t.id === ref.sourceTextId);
        if (text) seenTexts.add(text.id + "@" + text.revision);
      }
    for (const ref of s.audioRefs ?? [])
      if (ref.played) {
        seenAudio.add(ref.id + "@" + ref.revision);
        const text = s.textRefs.find((t) => t.id === ref.textId);
        if (text) seenTexts.add(text.id + "@" + text.revision);
      }
    for (const ref of s.textRefs ?? [])
      if (
        (s.exerciseRefs ?? []).some(
          (e) => e.answered && e.sourceTextId === ref.id,
        )
      )
        seenTexts.add(ref.id + "@" + ref.revision);
  }
  const recent = new Map<string, boolean>(),
    hadErrors = new Set<string>();
  for (const r of records.sort((a, b) => a.at.localeCompare(b.at)))
    if (current.get(r.id) === r.revision) {
      recent.set(r.id, r.correct);
      seenExercises.add(r.id);
      if (!r.correct) hadErrors.add(r.id);
    }
  return {
    seen: [...seenExercises],
    errors: [...recent].filter(([, ok]) => !ok).map(([id]) => id),
    correct: [...recent].filter(([, ok]) => ok).map(([id]) => id),
    hadErrors: [...hadErrors],
    seenWritingIds: [...seenWriting],
    seenTextIds: [...seenTexts],
    seenAudioIds: [...seenAudio],
  };
}
function usePracticeHistory(attempts: LocalAttempt[]) {
  const [summaries, setSummaries] = useState<
    ReturnType<typeof listSessionSummaries>
  >(() => {
    try {
      return listSessionSummaries(localStorage);
    } catch {
      return [];
    }
  });
  useEffect(() => {
    let active = true;
    const refresh = () => {
      listSessionSummariesDurably().then((value) => {
        if (active) setSummaries(value);
      });
    };
    refresh();
    window.addEventListener("polina-session-saved", refresh);
    return () => {
      active = false;
      window.removeEventListener("polina-session-saved", refresh);
    };
  }, [attempts]);
  return useMemo(() => historyIds(attempts, summaries), [attempts, summaries]);
}
export function TrainingLaunch({
  bank,
  attempts,
  selection,
  title,
}: {
  bank: ExerciseSummary[];
  attempts: LocalAttempt[];
  selection?: Partial<Selection>;
  title?: string;
}) {
  const [count, setCount] = useState("10"),
    [mode, setMode] = useState<"learn" | "control">("learn"),
    [only, setOnly] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const history = usePracticeHistory(attempts);
  const statusSets = {
    seen: new Set(history.seen),
    errors: new Set(history.errors),
  };
  const pool = bank.filter(
    (e) =>
      (!selection?.lines?.length ||
        selection.lines.includes(e.taskLine ?? 0)) &&
      (!selection?.topicId || e.topicId === selection.topicId) &&
      (!selection?.skillId ||
        e.skillIds?.includes(selection.skillId) ||
        e.skillId === selection.skillId) &&
      (!selection?.level || e.level === selection.level) &&
      (only !== "new" || !statusSets.seen.has(e.id)) &&
      (only !== "errors" || statusSets.errors.has(e.id)),
  );
  async function start(requested: number | "all", errors = false) {
    setBusy(true);
    setError("");
    try {
      const seed = crypto.randomUUID();
      const chosenPool = errors
        ? pool.filter((e) => statusSets.errors.has(e.id))
        : pool;
      const n = requested === "all" ? chosenPool.length : requested;
      if (n < 1 || n > chosenPool.length)
        throw Error(
          "Доступно " +
            chosenPool.length +
            " заданий. Измените размер или фильтры.",
        );
      const groups = new Map<string, ExerciseSummary[]>();
      for (const e of shuffled(chosenPool, seed))
        groups.set(e.skillId, [...(groups.get(e.skillId) ?? []), e]);
      const chosen: ExerciseSummary[] = [];
      while (chosen.length < n)
        for (const group of groups.values()) {
          const e = group.shift();
          if (e && chosen.length < n) chosen.push(e);
        }
      const conditions = await loadExercises(chosen.map((e) => e.id));
      const items = selectPractice(conditions, { count: "all" }, seed);
      const data = await loadOriginals();
      const s = createSession(
        items.map((exercise) => ({ kind: "exercise", exercise })),
        { ...data, exercises: conditions },
        {
          title: title ?? "Тематическая тренировка ОГЭ",
          kind: "practice",
          mode,
          seed,
        },
      );
      await saveSessionDurably(s);
      window.location.assign(href("/oge/practice/session/?id=" + s.id));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось сформировать подборку.",
      );
      setBusy(false);
    }
  }
  return (
    <section className="oge-launch oge-fast-launch">
      <h2>Решить подборку</h2>
      <p role="status">Доступно для тренировки: {pool.length}</p>
      <div className="oge-quick-actions">
        {[5, 10].map((n) => (
          <button
            key={n}
            className="button"
            disabled={busy || pool.length < n}
            onClick={() => start(n)}
          >
            {n} заданий
          </button>
        ))}
        <button
          className="button secondary"
          disabled={busy || !pool.length}
          onClick={() => start("all")}
        >
          Все ({pool.length})
        </button>
        <button
          className="button secondary"
          disabled={busy || !pool.some((e) => statusSets.errors.has(e.id))}
          onClick={() => start("all", true)}
        >
          Повторить ошибки
        </button>
      </div>
      <details>
        <summary>Размер, режим и отбор</summary>
        <div className="catalog-controls">
          <label>
            Количество
            <select value={count} onChange={(e) => setCount(e.target.value)}>
              {["5", "10", "20", "all"].map((n) => (
                <option
                  key={n}
                  value={n}
                  disabled={n !== "all" && Number(n) > pool.length}
                >
                  {n === "all" ? "Все доступные" : n + " заданий"}
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
            disabled={
              busy ||
              !pool.length ||
              (count !== "all" && Number(count) > pool.length)
            }
            onClick={() => start(count === "all" ? "all" : Number(count))}
          >
            {busy ? "Сохраняем подборку…" : "Начать подборку"}
          </button>
        </div>
      </details>
      {error && <LoadRecovery message={error} />}
    </section>
  );
}
function AddressedExercise({
  id,
  texts,
  save,
}: {
  id: string;
  texts: SourceText[];
  save: (a: LocalAttempt) => void;
}) {
  const e = use(loadExercise(id));
  if (!e) return <p>Задание не найдено.</p>;
  return (
    <InlineExercise
      exercise={e}
      text={texts.find((t) => t.id === e.sourceTextId)}
      checked={(exercise, answer) =>
        save(createAttempt(exercise, answer, false))
      }
    />
  );
}
function WritingCard({
  writing,
  start,
}: {
  writing: WritingAssignment;
  start: () => void;
}) {
  return (
    <article className="question-card">
      <h2>{writing.title}</h2>
      <p>
        № {writing.line} ·{" "}
        {writing.line === 1
          ? "Изложение с аудио"
          : "Сочинение: 13.1, 13.2 или 13.3"}{" "}
        · проверка по критериям
      </p>
      <button className="button" onClick={start}>
        Открыть письменное задание
      </button>
    </article>
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
  const base = "/oge/bank/" + (initialLine ? initialLine + "/" : "");
  const { params, change, reset, rememberScroll, endSearch } =
    useCatalogQuery(base);
  const line = initialLine ?? Number(params.get("line") ?? 0),
    data = use(loadOriginals());
  const bank = useMemo(
    () =>
      exerciseIndex.filter(
        (e) => e.exam === "OGE" && e.taskLine && (!line || e.taskLine === line),
      ),
    [line],
  );
  const history = usePracticeHistory(attempts);
  const q = params.get("q") ?? "",
    topic = params.get("topic") ?? "",
    skill = params.get("skill") ?? "",
    level = params.get("level") ?? "",
    status = params.get("status") ?? "",
    view = params.get("view") ?? "compact";
  const searchMatchIds = useMemo(
    () =>
      new Set(
        bank
          .filter((e) =>
            matchesSearch(q, [
              searchTextById.get(e.id) ?? "",
              String(e.taskLine),
              ...(e.skillIds ?? []).map(
                (id) => subskills.find((s) => s.id === id)?.title ?? id,
              ),
              data.texts
                .find((t) => t.id === e.sourceTextId)
                ?.paragraphs.join(" ") ?? "",
            ]),
          )
          .map((e) => e.id),
      ),
    [bank, q, data],
  );
  const statusSets = useMemo(
    () => ({
      seen: new Set(history.seen),
      correct: new Set(history.correct),
      errors: new Set(history.errors),
      hadErrors: new Set(history.hadErrors),
    }),
    [history],
  );
  const fits = (e: ExerciseSummary, except = "") =>
    (except === "topic" || !topic || e.topicId === topic) &&
    (except === "skill" ||
      !skill ||
      e.skillId === skill ||
      e.skillIds?.includes(skill)) &&
    (except === "level" || !level || e.level === level) &&
    (except === "status" ||
      !status ||
      (status === "new" && !statusSets.seen.has(e.id)) ||
      (status === "correct" && statusSets.correct.has(e.id)) ||
      (status === "errors" && statusSets.errors.has(e.id)) ||
      (status === "past-errors" && statusSets.hadErrors.has(e.id))) &&
    searchMatchIds.has(e.id);
  const filtered = bank.filter((e) => fits(e));
  const page = Math.max(
    1,
    Math.min(
      Number(params.get("page")) || 1,
      Math.ceil(filtered.length / 10) || 1,
    ),
  );
  const writing = data.writing.filter(
    (w) =>
      (!line || w.line === line) &&
      !skill &&
      !level &&
      !status &&
      (!topic || (w.line === 1 ? "izlozhenie" : "sochinenie") === topic) &&
      matchesSearch(q, [
        w.title,
        ...w.prompts.map((p) => p.text),
        data.texts.find((t) => t.id === w.sourceTextId)?.paragraphs.join(" ") ??
          "",
      ]),
  );
  const returnTo = base + (params.size ? "?" + params : "");
  const [error, setError] = useState("");
  async function startWriting(w: WritingAssignment) {
    try {
      const s = createSession(
        [{ kind: "writing", writing: w }],
        { ...data, exercises: [] },
        { title: w.title, kind: "practice", mode: "learn", seed: w.id },
      );
      await saveSessionDurably(s);
      window.location.assign(href("/oge/practice/session/?id=" + s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось сохранить работу.");
    }
  }
  return (
    <>
      <Breadcrumbs
        items={[{ label: "ОГЭ", path: "/oge/" }, { label: "Банк заданий" }]}
      />
      <PageHeading
        eyebrow="ОГЭ · БАНК С РАЗБОРОМ"
        title={
          line
            ? "Задание № " +
              line +
              ": " +
              taskLines.find((l) => l.number === line)?.title
            : "Все задания ОГЭ"
        }
        text="Запустите тренировку или откройте отдельное задание."
      />
      <div className="oge-bank-line">
        <label>
          Номер задания
          <select
            value={line}
            onChange={(e) =>
              window.location.assign(
                href(
                  Number(e.target.value)
                    ? "/oge/bank/" + e.target.value + "/"
                    : "/oge/bank/?line=0",
                ),
              )
            }
          >
            <option value="0">Все номера, включая 1 и 13</option>
            {taskLines.map((l) => (
              <option key={l.number} value={l.number}>
                № {l.number} · {l.title}
              </option>
            ))}
          </select>
        </label>
        {line > 0 && (
          <a
            className="button secondary"
            href={href("/oge/theory/?line=" + line)}
          >
            Теория № {line}
          </a>
        )}
      </div>
      {![1, 13].includes(line) && (
        <TrainingLaunch
          bank={filtered}
          attempts={attempts}
          title={
            line ? "Подборка: задание № " + line : "Смешанная тренировка ОГЭ"
          }
        />
      )}
      <div className="catalog-controls">
        <label className="search-field">
          Найти задание
          <input
            value={q}
            placeholder="Номер, тема, слово из условия"
            onChange={(e) => change("q", e.target.value)}
            onBlur={endSearch}
          />
        </label>
        <button className="button secondary" onClick={reset}>
          Сбросить фильтры
        </button>
      </div>
      <details
        className="oge-bank-filters"
        open={Boolean(topic || skill || level || status || view === "expanded")}
      >
        <summary>Тема, поднавык, сложность и история</summary>
        <div className="catalog-controls">
          <label>
            Тема
            <select
              value={topic}
              onChange={(e) => change("topic", e.target.value)}
            >
              <option value="">Все применимые темы</option>
              {topics
                .filter(
                  (t) =>
                    bank.some((e) => e.topicId === t.id) ||
                    writing.some(
                      (w) =>
                        (w.line === 1 ? "izlozhenie" : "sochinenie") === t.id,
                    ),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} (
                    {bank.filter((e) => e.topicId === t.id && fits(e, "topic"))
                      .length +
                      (t.id === "izlozhenie" || t.id === "sochinenie"
                        ? writing.filter(
                            (w) =>
                              (w.line === 1 ? "izlozhenie" : "sochinenie") ===
                              t.id,
                          ).length
                        : 0)}
                    )
                  </option>
                ))}
            </select>
          </label>
          <label>
            Навык
            <select
              value={skill}
              onChange={(e) => change("skill", e.target.value)}
            >
              <option value="">Все применимые навыки</option>
              {subskills
                .filter((s) =>
                  bank.some(
                    (e) => e.skillIds?.includes(s.id) && fits(e, "skill"),
                  ),
                )
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title} (
                    {
                      bank.filter(
                        (e) => e.skillIds?.includes(s.id) && fits(e, "skill"),
                      ).length
                    }
                    )
                  </option>
                ))}
            </select>
          </label>
          <label>
            Сложность
            <select
              value={level}
              onChange={(e) => change("level", e.target.value)}
            >
              <option value="">Все уровни</option>
              {[
                ["basic", "Базовый"],
                ["standard", "Обычный"],
                ["advanced", "Усложнённый учебный"],
              ].map(([id, label]) => (
                <option
                  key={id}
                  value={id}
                  disabled={
                    !bank.some((e) => e.level === id && fits(e, "level"))
                  }
                >
                  {label} (
                  {
                    bank.filter((e) => e.level === id && fits(e, "level"))
                      .length
                  }
                  )
                </option>
              ))}
            </select>
          </label>
          <label>
            Решение
            <select
              value={status}
              onChange={(e) => change("status", e.target.value)}
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
              onChange={(e) => change("view", e.target.value)}
            >
              <option value="compact">Компактный каталог</option>
              <option value="expanded">Решать на этой странице</option>
            </select>
          </label>
        </div>
      </details>
      <p className="results-count" role="status">
        Найдено заданий: {filtered.length + writing.length}
        {!line
          ? " (тестовых: " +
            filtered.length +
            ", письменных: " +
            writing.length +
            ")"
          : ""}
      </p>
      {error && <p role="alert">{error}</p>}
      <div className={view === "compact" ? "topic-grid" : "oge-expanded"}>
        {filtered.slice((page - 1) * 10, page * 10).map((e) =>
          view === "compact" ? (
            <div key={e.id} onClick={rememberScroll}>
              <ExerciseCard exercise={e} returnTo={returnTo} />
              <p className="muted">
                {statusSets.errors.has(e.id)
                  ? "Есть ошибка"
                  : statusSets.correct.has(e.id)
                    ? "Последний ответ верный"
                    : statusSets.seen.has(e.id)
                      ? "Выполнено"
                      : "Новое"}{" "}
                ·{" "}
                {e.originCategory === "learning"
                  ? "Учебное упражнение"
                  : "Авторская экзаменационная модель"}
              </p>
            </div>
          ) : (
            <AddressedExercise
              key={e.id}
              id={e.id}
              texts={data.texts}
              save={save}
            />
          ),
        )}
      </div>
      {filtered.length > 10 && (
        <nav className="pagination" aria-label="Страницы банка">
          <button
            className="button secondary"
            disabled={page === 1}
            onClick={() => change("page", String(page - 1))}
          >
            Предыдущая
          </button>
          <span>
            Страница {page} из {Math.ceil(filtered.length / 10)}
          </span>
          <button
            className="button secondary"
            disabled={page * 10 >= filtered.length}
            onClick={() => change("page", String(page + 1))}
          >
            Следующая
          </button>
        </nav>
      )}
      {writing.length > 0 && (
        <section className="home-section">
          <h2>Письменная практика</h2>
          <p>
            Черновик сохраняется; самооценка и экспертная проверка доступны по
            критериям.
          </p>
          <div className="topic-grid">
            {writing.map((w) => (
              <WritingCard
                key={w.id}
                writing={w}
                start={() => startWriting(w)}
              />
            ))}
          </div>
        </section>
      )}
      {!filtered.length && !writing.length && (
        <p>По этим условиям заданий нет. Сбросьте или измените фильтры.</p>
      )}
    </>
  );
}
