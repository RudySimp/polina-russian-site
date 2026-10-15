import { useEffect, useMemo, useState } from "react";
import { ProgressBackupPanel } from "../components/ProgressBackupPanel";
import { Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { href } from "../routes";
import { exerciseIndex } from "../content/catalog";
import subskills from "../content/subskills.json";
import type { LocalAttempt } from "../progress";
import { listSessionSummaries, type SessionSummary } from "./storage";
import {
  listSessionSummariesDurably,
  listSessionsDurably,
  saveSessionDurably,
  deleteSessionDurably,
} from "./repository";
import {
  downloadBackupPart,
  prepareBackupParts,
  importSessions,
  type BackupPart,
} from "./backup";
import {
  readGameRecords,
  type HistoricGameRecord,
  type GameHistoryRecord,
} from "./game-storage";
import { ogeCatalog } from "./catalog";
import { checkActivity } from "./game-check";
import { historyIds } from "./BankPage";
export default function ResultsPage({
  attempts,
}: {
  attempts: LocalAttempt[];
}) {
  const [refresh, setRefresh] = useState(0),
    [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [deleting, setDeleting] = useState(""),
    [busy, setBusy] = useState(false);
  const [backupParts, setBackupParts] = useState<BackupPart[]>([]);
  const [sessions, setSessions] = useState<SessionSummary[]>(() => {
    try {
      return listSessionSummaries(localStorage);
    } catch {
      return [];
    }
  });
  useEffect(() => {
    let active = true;
    listSessionSummariesDurably()
      .then((s) => {
        if (active) setSessions(s);
      })
      .catch(() => {
        if (active)
          setError("Не удалось прочитать список работ. Повторите загрузку.");
      });
    return () => {
      active = false;
    };
  }, [refresh]);
  const history = useMemo(
    () => historyIds(attempts, sessions),
    [attempts, sessions],
  );
  const errors = exerciseIndex.filter((e) => history.errors.includes(e.id));
  const visible = sessions.filter(
    (s) =>
      filter === "all" ||
      (filter === "draft" && !s.completedAt) ||
      (filter === "complete" && s.completedAt) ||
      (filter === "practice" && s.kind === "practice") ||
      (filter === "variant" && s.kind !== "practice"),
  );
  const pages = Math.ceil(visible.length / 10) || 1,
    currentPage = Math.min(page, pages);
  let games: ReturnType<typeof readGameRecords> = {
    records: [],
    historic: [],
    damaged: 0,
  };
  try {
    games = readGameRecords(localStorage, ogeCatalog.activities);
  } catch {}
  async function exportAll() {
    setBusy(true);
    setError("");
    setBackupParts([]);
    try {
      const works = await listSessionsDurably();
      if (!works.length) throw Error("Нет работ для резервной копии.");
      const parts = prepareBackupParts(works);
      if (parts.length === 1) downloadBackupPart(parts[0], 1, 1);
      else setBackupParts(parts);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Не удалось подготовить копию.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function restore(file: File) {
    setBusy(true);
    setError("");
    setNotice("");
    let saved = 0;
    try {
      const works = importSessions(await file.text()),
        known = new Set(sessions.map((s) => s.id));
      for (const work of works) {
        const candidate = known.has(work.id)
          ? { ...work, id: crypto.randomUUID() }
          : work;
        await saveSessionDurably(candidate);
        known.add(candidate.id);
        saved++;
      }
      setNotice(
        "Импортировано работ: " +
          saved +
          ". При совпадении id создана отдельная копия.",
      );
      setRefresh((n) => n + 1);
    } catch (e) {
      setError(
        (e instanceof Error ? e.message : "Не удалось восстановить копию.") +
          (saved ? " Уже сохранено: " + saved + "." : ""),
      );
      if (saved) setRefresh((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Breadcrumbs
        items={[{ label: "ОГЭ", path: "/oge/" }, { label: "Мои работы" }]}
      />
      <PageHeading
        eyebrow="ИСТОРИЯ В ЭТОМ БРАУЗЕРЕ"
        title="Мои работы и результаты"
        text="Продолжайте черновики и открывайте сохранённые условия, ответы и разбор."
      />
      <p className="storage-note">
        История хранится на этом устройстве. Резервная копия содержит условия и
        редакции, письменные тексты и проверку по критериям.
      </p>
      <div className="inline-actions">
        <button
          className="button secondary"
          disabled={busy || !sessions.length}
          onClick={exportAll}
        >
          Скачать резервную копию всех работ
        </button>
        <label className="button secondary">
          Восстановить из файла
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void restore(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {backupParts.length > 1 && (
        <section className="oge-backup-parts">
          <h2>Скачайте все части резервной копии</h2>
          <p>
            История разделена на {backupParts.length} файлов. Каждый содержит не
            более 200 работ и 20 МБ. Скачайте каждую часть отдельной кнопкой;
            восстановите все файлы по очереди.
          </p>
          <ul>
            {backupParts.map((part, index) => (
              <li key={index}>
                <button
                  className="button secondary"
                  onClick={() => {
                    setError("");
                    try {
                      downloadBackupPart(part, index + 1, backupParts.length);
                    } catch (reason) {
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "Не удалось скачать часть резервной копии.",
                      );
                    }
                  }}
                >
                  Скачать часть {index + 1} из {backupParts.length}
                </button>
                <p>
                  {part.sessionCount} работ ·{" "}
                  {(part.bytes / 1_000_000).toLocaleString("ru", {
                    maximumFractionDigits: 2,
                  })}{" "}
                  МБ
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <ProgressBackupPanel />
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
      <label className="oge-filter">
        Показать работы
        <select
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setPage(1);
          }}
        >
          <option value="all">Все работы</option>
          <option value="draft">Черновики</option>
          <option value="complete">Завершённые</option>
          <option value="practice">Тематические подборки</option>
          <option value="variant">Варианты</option>
        </select>
      </label>
      <p role="status">Сохранённых работ: {visible.length}</p>
      {!visible.length && (
        <div className="empty-state">
          <h2>Таких сохранённых работ пока нет</h2>
          <LinkButton to="/oge/bank/">Выбрать задания</LinkButton>
        </div>
      )}
      <div className="oge-work-list">
        {visible.slice((currentPage - 1) * 10, currentPage * 10).map((s) => (
          <article className="question-card" key={s.id}>
            <h2>{s.title}</h2>
            <p>
              {new Date(s.startedAt).toLocaleString("ru")} ·{" "}
              {s.mode === "control" ? "Контрольный" : "Учебный"} режим ·{" "}
              {s.itemCount} заданий
            </p>
            <p>
              {s.completedAt
                ? "Завершена; полный результат рассчитан по сохранённым условиям в разборе."
                : "Черновик: заполнено " + s.answerCount + " ответов."}
            </p>
            {s.writingRefs.length > 0 && (
              <p>
                Письменные ответы и проверка по критериям доступны внутри
                работы.
              </p>
            )}
            <div className="inline-actions">
              <LinkButton to={"/oge/practice/session/?id=" + s.id}>
                {s.completedAt ? "Посмотреть разбор" : "Продолжить работу"}
              </LinkButton>
              <button className="text-button" onClick={() => setDeleting(s.id)}>
                Удалить эту работу
              </button>
            </div>
            {deleting === s.id && (
              <div role="alert">
                <p>Удалить черновик и ответы этой работы из браузера?</p>
                <button
                  className="button secondary"
                  onClick={async () => {
                    try {
                      await deleteSessionDurably(s.id);
                      setDeleting("");
                      setRefresh((n) => n + 1);
                    } catch {
                      setError("Не удалось удалить работу.");
                    }
                  }}
                >
                  Подтвердить удаление
                </button>
                <button className="text-button" onClick={() => setDeleting("")}>
                  Отмена
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
      {pages > 1 && (
        <nav className="pagination" aria-label="Страницы сохранённых работ">
          <button
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Предыдущая
          </button>
          <span>
            {currentPage} / {pages}
          </span>
          <button
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Следующая
          </button>
        </nav>
      )}
      {errors.length > 0 && (
        <section className="home-section">
          <h2>К чему вернуться</h2>
          <p>
            Неисправленных ошибок в текущих редакциях: {errors.length}. В
            разборе работы показаны конкретные пропущенные и лишние позиции.
          </p>
          <div className="oge-theory-links">
            {[
              ...new Set(
                errors.flatMap(
                  (e) =>
                    e.skillIds?.filter((id) => id !== e.skillId) ?? [e.skillId],
                ),
              ),
            ]
              .slice(0, 12)
              .map((id) => {
                const skill = subskills.find((s) => s.id === id),
                  e = errors.find(
                    (e) => e.skillIds?.includes(id) || e.skillId === id,
                  )!;
                return (
                  <div key={id}>
                    <h3>{skill?.title ?? e.topicTitle}</h3>
                    <a
                      href={href(
                        skill?.rulePath ??
                          "/theory/" + e.topicId + "/?exam=OGE",
                      )}
                    >
                      Повторить правило
                    </a>
                    <p>
                      <a
                        href={href(
                          "/oge/bank/" +
                            e.taskLine +
                            "/?status=new&skill=" +
                            encodeURIComponent(id),
                        )}
                      >
                        Новая задача на этот навык
                      </a>
                    </p>
                  </div>
                );
              })}
          </div>
        </section>
      )}
      <GameHistory games={games} />
      <LinkButton to="/progress/" secondary>
        История отдельных заданий
      </LinkButton>
    </>
  );
}

function savedAction(
  record: GameHistoryRecord,
  fieldId: string,
  value: string,
) {
  const { kind, situation } = record.snapshot;
  if (
    kind === "foundation" ||
    (kind === "compression" && fieldId === "essential")
  ) {
    if (!value)
      return fieldId === "subject"
        ? "Подлежащее не выделено"
        : "Ничего не выделено";
    return value
      .split(",")
      .map(
        (position) =>
          situation.tokens?.[Number(position) - 1] ?? "Позиция " + position,
      )
      .join(" ");
  }
  if (kind === "correction" && fieldId === "position")
    return situation.tokens?.[Number(value) - 1] ?? (value || "Не указано");
  return value || (kind === "punctuation" ? "Знак не поставлен" : "Не указано");
}
function SavedGameAction({ record }: { record: GameHistoryRecord }) {
  const situation = record.snapshot.situation;
  const checked = checkActivity(situation, record.answers);
  return (
    <details className="question-card game-history-record">
      <summary>
        {record.snapshot.title} · {situation.title} · редакция {record.revision}
        {record.stale
          ? " · другая сохранённая редакция"
          : " · текущая редакция"}
      </summary>
      <p>{new Date(record.createdAt).toLocaleString("ru")}</p>
      <p>
        {record.stale
          ? "Этот снимок сохранён для просмотра. Его результат не входит в показатели текущих редакций."
          : "Результат относится к текущей редакции условия."}
      </p>
      <p>
        {record.firstIndependent && !record.assisted
          ? "Первая самостоятельная попытка без подсказки."
          : record.assisted
            ? "После подсказки или предыдущей проверки; результат не учитывается как первая самостоятельная попытка."
            : "Повторная попытка; самостоятельность первой попытки не подтверждена."}
      </p>
      <h3>Сохранённое условие</h3>
      <p>{situation.instruction}</p>
      <div className="source-text">
        {situation.text.split("\n").map((paragraph, index) => (
          <p key={index}>{paragraph}</p>
        ))}
      </div>
      {record.requiresExpert ? (
        <p>
          Выбор основной информации:{" "}
          {record.informationCorrect ? "верно" : "есть ошибка"}. Письменный
          текст: {record.writingDraft ? "черновик написан" : "не написан"}.
          Качество сжатия и речи требует ручной оценки.
        </p>
      ) : (
        <p>
          Результат по сохранённому ключу:{" "}
          {record.correct ? "верно" : "есть ошибка"}.
        </p>
      )}
      <h3>Ваши действия и сохранённый ключ</h3>
      <ul>
        {situation.fields.map((field) => {
          const result = checked.find((item) => item.field.id === field.id);
          return (
            <li key={field.id}>
              <strong>{field.label}</strong>
              <p>
                Ваш ответ:{" "}
                {savedAction(record, field.id, record.answers[field.id] ?? "")}
              </p>
              {!!field.options?.length && (
                <p>
                  Предлагавшиеся варианты:{" "}
                  {field.options
                    .map((value) => value || "Знак не нужен")
                    .join(" / ")}
                </p>
              )}
              {field.expected.length ? (
                <>
                  <p>
                    Сохранённый ключ:{" "}
                    {field.expected
                      .map((value) => savedAction(record, field.id, value))
                      .join(" / ")}
                  </p>
                  <p>
                    {result?.correct
                      ? "Действие верно."
                      : "Действие требует исправления."}
                  </p>
                </>
              ) : (
                <p>Свободный письменный ответ оценивается вручную.</p>
              )}
              {field.explanation && <p>{field.explanation}</p>}
            </li>
          );
        })}
      </ul>
      <h3>Разбор сохранённой редакции</h3>
      <p>{situation.explanation}</p>
      {!!situation.details.length && (
        <ul>
          {situation.details.map((detail, index) => (
            <li key={index}>{detail}</li>
          ))}
        </ul>
      )}
      {ogeCatalog.activities.some(
        (activity) => activity.id === record.activityId,
      ) && (
        <a href={href("/oge/games/" + record.activityId + "/")}>
          Открыть текущий тренажёр
        </a>
      )}
    </details>
  );
}
function GameHistory({ games }: { games: ReturnType<typeof readGameRecords> }) {
  const [filter, setFilter] = useState("all"),
    [page, setPage] = useState(1);
  const current = games.records.filter((record) => !record.stale);
  const automatic = current.filter((record) => !record.requiresExpert);
  const writing = current.filter((record) => record.requiresExpert);
  const older = games.records.filter((record) => record.stale);
  const visible = games.records
    .filter(
      (record) =>
        filter === "all" ||
        (filter === "current" && !record.stale) ||
        (filter === "older" && record.stale) ||
        (filter === "writing" && record.requiresExpert),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pages = Math.ceil(visible.length / 20) || 1,
    currentPage = Math.min(page, pages);
  return (
    <section className="home-section game-history">
      <h2>Практика в тренажёрах</h2>
      <p role="status">
        Проверенных действий: {current.length} в текущих редакциях.
        Автоматически проверяемых действий: {automatic.length}. Верных с первой
        самостоятельной попытки:{" "}
        {
          automatic.filter(
            (record) =>
              record.correct && record.firstIndependent && !record.assisted,
          ).length
        }
        . После подсказки или исправления:{" "}
        {
          automatic.filter(
            (record) =>
              record.correct && (!record.firstIndependent || record.assisted),
          ).length
        }
        .
      </p>
      {writing.length > 0 && (
        <p>
          Сжатие: сохранённых действий {writing.length}; основной информации,
          выбранной верно,{" "}
          {writing.filter((record) => record.informationCorrect).length};
          письменных черновиков для ручной оценки{" "}
          {writing.filter((record) => record.writingDraft).length}. Эти
          черновики не получают автоматическую оценку качества текста.
        </p>
      )}
      {older.length > 0 && (
        <p>
          Действий по другим или отсутствующим редакциям: {older.length}.
          Результаты сохранены по собственным условиям и исключены из текущих
          показателей.
        </p>
      )}
      {games.records.length > 0 ? (
        <>
          <label className="oge-filter">
            История действий
            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">Все сохранённые снимки</option>
              <option value="current">Текущие редакции</option>
              <option value="older">Другие редакции</option>
              <option value="writing">
                Письменные черновики и выбор информации
              </option>
            </select>
          </label>
          <p role="status">Снимков в списке: {visible.length}</p>
          <div className="game-history-list">
            {visible
              .slice((currentPage - 1) * 20, currentPage * 20)
              .map((record) => (
                <SavedGameAction key={record.id} record={record} />
              ))}
          </div>
          {pages > 1 && (
            <nav className="pagination" aria-label="Страницы истории действий">
              <button
                className="button secondary"
                disabled={currentPage === 1}
                onClick={() => setPage(currentPage - 1)}
              >
                Предыдущие действия
              </button>
              <span>
                Страница {currentPage} из {pages}
              </span>
              <button
                className="button secondary"
                disabled={currentPage === pages}
                onClick={() => setPage(currentPage + 1)}
              >
                Следующие действия
              </button>
            </nav>
          )}
          {!visible.length && <p>В этом отборе действий нет.</p>}
        </>
      ) : (
        <p>Вы ещё не сохраняли действия в тематических тренажёрах.</p>
      )}
      {games.historic.length > 0 && (
        <HistoricGameHistory records={games.historic} />
      )}
      {games.damaged > 0 && (
        <p>Не прочитано записей: {games.damaged}; исходные данные сохранены.</p>
      )}
    </section>
  );
}

function HistoricGameHistory({ records }: { records: HistoricGameRecord[] }) {
  const [page, setPage] = useState(1);
  const pages = Math.ceil(records.length / 20),
    currentPage = Math.min(page, pages);
  return (
    <details className="game-history-legacy">
      <summary>
        Исторические записи без сохранённого условия: {records.length}
      </summary>
      <p>
        У этих записей нет снимка и ключа. Они сохранены без изменений, не
        перепроверяются новым условием и не входят в текущие показатели.
      </p>
      <ul>
        {records
          .slice((currentPage - 1) * 20, currentPage * 20)
          .map((record, index) => (
            <li key={record.id + ":" + index}>
              {record.activityId} · {record.situationId} ·{" "}
              {new Date(record.createdAt).toLocaleString("ru")}
            </li>
          ))}
      </ul>
      {pages > 1 && (
        <nav className="pagination" aria-label="Страницы записей без снимка">
          <button
            className="button secondary"
            disabled={currentPage === 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Предыдущие записи без снимка
          </button>
          <span>
            Страница {currentPage} из {pages}
          </span>
          <button
            className="button secondary"
            disabled={currentPage === pages}
            onClick={() => setPage(currentPage + 1)}
          >
            Следующие записи без снимка
          </button>
        </nav>
      )}
    </details>
  );
}
