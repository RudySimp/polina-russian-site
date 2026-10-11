import { use, useState } from "react";
import { Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { href } from "../routes";
import { exerciseIndex } from "../content/catalog";
import type { LocalAttempt } from "../progress";
import { listSessions, deleteSession } from "./storage";
import { resultsFor } from "./engine";
import { loadActivities } from "./materials";
import { checkActivity } from "./GamePages";
import { historyIds } from "./BankPage";

export default function ResultsPage({
  attempts,
}: {
  attempts: LocalAttempt[];
}) {
  const activities = use(loadActivities());
  const [refresh, setRefresh] = useState(0),
    [filter, setFilter] = useState("all"),
    [error, setError] = useState("");
  const [deleting, setDeleting] = useState("");
  void refresh;
  let sessions: ReturnType<typeof listSessions> = [],
    games: {
      activityId: string;
      situationId: string;
      answers: Record<string, string>;
      createdAt: string;
      correct: boolean;
    }[] = [];
  try {
    sessions = listSessions(window.localStorage);
    const raw: unknown = JSON.parse(
      window.localStorage.getItem("polina-oge-games-v1") ?? "[]",
    );
    if (Array.isArray(raw))
      games = raw.slice(-500).flatMap((record) => {
        if (
          !record ||
          record.revision !== 1 ||
          typeof record.createdAt !== "string" ||
          !Number.isFinite(Date.parse(record.createdAt)) ||
          !record.answers ||
          typeof record.answers !== "object" ||
          Object.values(record.answers).some(
            (a) => typeof a !== "string" || a.length > 30000,
          )
        )
          return [];
        const activity = activities.find((a) => a.id === record.activityId),
          situation = activity?.situations.find(
            (s) => s.id === record.situationId,
          );
        return situation
          ? [
              {
                ...record,
                correct: checkActivity(situation, record.answers).every(
                  (r) => r.correct,
                ),
              },
            ]
          : [];
      });
  } catch {}
  const history = historyIds(attempts),
    errors = exerciseIndex.filter(
      (e) => history.errors.includes(e.id) && e.exam === "OGE",
    );
  const visible = sessions.filter(
    (s) =>
      filter === "all" ||
      (filter === "draft" && !s.completedAt) ||
      (filter === "complete" && s.completedAt) ||
      (filter === "practice" && s.kind === "practice") ||
      (filter === "variant" && s.kind !== "practice"),
  );
  return (
    <>
      <Breadcrumbs
        items={[{ label: "ОГЭ", path: "/oge/" }, { label: "Мои работы" }]}
      />
      <PageHeading
        eyebrow="ИСТОРИЯ В ЭТОМ БРАУЗЕРЕ"
        title="Мои работы и результаты"
        text="Продолжайте черновики и открывайте разбор завершённых попыток. Каждая работа сохраняет собственный состав и версии заданий."
      />
      <p className="storage-note">
        История хранится на этом устройстве. Очистка данных браузера удаляет её.
        Ошибки формата учитываются отдельно от предметных ошибок.
      </p>
      <label className="oge-filter">
        Показать работы
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="all">Все работы</option>
          <option value="draft">Черновики</option>
          <option value="complete">Завершённые</option>
          <option value="practice">Тематические подборки</option>
          <option value="variant">Варианты</option>
        </select>
      </label>
      {!visible.length && (
        <div className="empty-state">
          <h2>Таких сохранённых работ пока нет</h2>
          <p>Начните подборку или вариант: ответы и черновик появятся здесь.</p>
          <LinkButton to="/oge/bank/">Выбрать задания</LinkButton>
        </div>
      )}
      <div className="oge-work-list">
        {visible.map((session) => {
          const results = resultsFor(session),
            correct = results.filter((r) => r.status === "correct").length,
            incorrect = results.filter((r) => r.status === "incorrect").length,
            format = results.filter((r) => r.status === "format_error").length,
            skipped = results.filter((r) => r.status === "skipped").length;
          return (
            <article className="question-card" key={session.id}>
              <h2>{session.title}</h2>
              <p>
                {new Date(session.startedAt).toLocaleString("ru")} ·{" "}
                {session.mode === "control" ? "Контрольный" : "Учебный"} режим ·{" "}
                {session.items.length} заданий
              </p>
              <p>
                {session.completedAt
                  ? `Завершена: верных ${correct}, ошибок ${incorrect}, пропусков ${skipped}, ошибок формата ${format}.`
                  : `Черновик: заполнено ${Object.values(session.answers).filter((a) => a.trim()).length} ответов.`}
              </p>
              {session.items.some((i) => i.kind === "writing") && (
                <p>Письменные ответы требуют экспертной оценки.</p>
              )}
              <div className="inline-actions">
                <LinkButton to={`/oge/practice/session/?id=${session.id}`}>
                  {session.completedAt
                    ? "Посмотреть разбор"
                    : "Продолжить работу"}
                </LinkButton>
                <button
                  className="text-button"
                  onClick={() => setDeleting(session.id)}
                >
                  Удалить эту работу
                </button>
              </div>
              {deleting === session.id && (
                <div role="alert">
                  <p>Удалить черновик и ответы этой работы из браузера?</p>
                  <button
                    className="button secondary"
                    onClick={() => {
                      try {
                        deleteSession(window.localStorage, session.id);
                        setDeleting("");
                        setRefresh((n) => n + 1);
                      } catch {
                        setError("Браузер не разрешил удалить работу.");
                      }
                    }}
                  >
                    Подтвердить удаление
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setDeleting("")}
                  >
                    Отмена
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </div>
      {error && <p role="alert">{error}</p>}
      {errors.length > 0 && (
        <section className="home-section">
          <h2>К чему вернуться</h2>
          <p>
            Неисправленных ошибок в отдельных заданиях: {errors.length}. Для
            повторения откройте разбор работы или нужный номер.
          </p>
          <div className="oge-theory-links">
            {[...new Set(errors.map((e) => e.topicId))].map((id) => {
              const e = errors.find((e) => e.topicId === id)!;
              const unseen = exerciseIndex.find(
                (next) =>
                  next.topicId === id &&
                  next.exam === "OGE" &&
                  !history.seen.includes(next.id),
              );
              return (
                <div key={id}>
                  <h3>{e.topicTitle}</h3>
                  <a href={href(`/theory/${e.topicId}/?exam=OGE`)}>
                    Повторить теорию
                  </a>
                  {unseen && (
                    <p>
                      <a
                        href={href(
                          `/practice/${unseen.slug}/?from=${encodeURIComponent("/oge/results/")}`,
                        )}
                      >
                        Проверить навык на новом задании
                      </a>
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      <section className="home-section">
        <h2>Практика в тренажёрах</h2>
        {games.length ? (
          <>
            <p>
              Проверенных действий: {games.length}. Верных по ключам:{" "}
              {games.filter((g) => g.correct).length}. Это результаты действий,
              а не оценка освоения темы.
            </p>
            <ul>
              {activities
                .filter((a) => games.some((g) => g.activityId === a.id))
                .map((a) => (
                  <li key={a.id}>
                    <a href={href(`/oge/games/${a.id}/`)}>{a.title}</a>:{" "}
                    {
                      games.filter((g) => g.activityId === a.id && g.correct)
                        .length
                    }{" "}
                    верных действий из{" "}
                    {games.filter((g) => g.activityId === a.id).length}
                  </li>
                ))}
            </ul>
          </>
        ) : (
          <p>Вы ещё не сохраняли действия в тематических тренажёрах.</p>
        )}
      </section>
      <LinkButton to="/progress/" secondary>
        История отдельных заданий
      </LinkButton>
    </>
  );
}
