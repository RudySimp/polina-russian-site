import { useState, type ComponentType } from "react";
import type { PracticeSession, WritingAssignment } from "./model";
import { wordCount } from "./engine";

type GuideRoute = {
  promptId: string;
  purpose: string;
  plan: string[];
  stages: { title: string; text: string; explanation: string }[];
  strong: { text: string; analysis: string[] };
  weak: { text: string; analysis: string[] };
  criteriaNotes: { code: string; text: string }[];
  checkpoints: string[];
};
type Guide = {
  writingId: string;
  writingRevision: number;
  sourceTextId: string;
  sourceTextRevision: number;
  title: string;
  routes: GuideRoute[];
};
function WritingWorkshopEntry({
  session,
  writing,
}: {
  session: PracticeSession;
  writing: WritingAssignment;
}) {
  const [Workshop, setWorkshop] =
    useState<
      ComponentType<{ session: PracticeSession; writing: WritingAssignment }>
    >();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    if (Workshop || loading) return;
    setLoading(true);
    setError("");
    try {
      const workshopModule = await import("./WritingWorkshop");
      setWorkshop(() => workshopModule.WritingWorkshop);
    } catch {
      setError(
        "Не удалось загрузить письменный практикум. Ваш основной ответ остаётся в работе; повторите загрузку.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>Письменные операции и оценённые образцы</summary>
      {loading && <p role="status">Загружаем письменный практикум…</p>}
      {error && (
        <>
          <p role="status">{error}</p>
          <button
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            Повторить загрузку практикума
          </button>
        </>
      )}
      {Workshop && <Workshop session={session} writing={writing} />}
    </details>
  );
}

export function WritingGuide({
  session,
  writing,
}: {
  session: PracticeSession;
  writing: WritingAssignment;
}) {
  const [guide, setGuide] = useState<Guide | undefined>();
  const [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const promptId = session.selectedPrompts[writing.id] ?? writing.prompts[0].id;
  const route = guide?.routes.find((route) => route.promptId === promptId);
  if (session.mode === "control" && !session.completedAt) return null;
  async function load() {
    if (guide || loading) return;
    setLoading(true);
    setError("");
    try {
      const guideModule = await import("./writing-guides.json");
      const data = guideModule.default as unknown as { guides: Guide[] };
      const source = session.texts.find(
        (text) => text.id === writing.sourceTextId,
      );
      const value = data.guides.find(
        (guide) =>
          guide.writingId === writing.id &&
          guide.writingRevision === writing.revision &&
          guide.sourceTextId === source?.id &&
          guide.sourceTextRevision === source.revision,
      );
      if (value) setGuide(value);
      else
        setError(
          "Для сохранённой редакции этой работы подробный образец пока не подготовлен. Используйте её исходный текст, микротемы и критерии.",
        );
    } catch {
      setError(
        "Не удалось загрузить учебный разбор. Ваш письменный ответ остаётся в работе; повторите загрузку.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <details
      className="oge-writing-guide"
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary>
        Учебный маршрут: от исходного текста к письменному ответу
      </summary>
      {loading && (
        <p role="status">Загружаем образцы и этапы редактирования…</p>
      )}
      {error && (
        <>
          <p role="status">{error}</p>
          <button className="button secondary" onClick={() => void load()}>
            Повторить загрузку разбора
          </button>
        </>
      )}
      {route && (
        <>
          <h3>
            {guide?.title} · {promptId}
          </h3>
          <p>{route.purpose}</p>
          <h4>План работы</h4>
          <ol>
            {route.plan.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
          {route.stages.map((stage) => (
            <section key={stage.title}>
              <h4>{stage.title}</h4>
              <p className="oge-written-answer">{stage.text}</p>
              <p>{stage.explanation}</p>
            </section>
          ))}
          <details>
            <summary>
              Полный сильный образец · {wordCount(route.strong.text)} слов
            </summary>
            <div className="oge-written-answer">{route.strong.text}</div>
            <ul>
              {route.strong.analysis.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
          <details>
            <summary>Слабый образец и причины снижения</summary>
            <div className="oge-written-answer">{route.weak.text}</div>
            <ul>
              {route.weak.analysis.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
          <h4>Связь с критериями</h4>
          <ul>
            {route.criteriaNotes.map((item) => (
              <li key={item.code}>
                <strong>{item.code}.</strong> {item.text}
              </li>
            ))}
          </ul>
          <WritingWorkshopEntry
            key={
              session.id +
              ":" +
              writing.id +
              ":" +
              writing.revision +
              ":" +
              promptId
            }
            session={session}
            writing={writing}
          />
          <h4>Перед окончательной редакцией</h4>
          <ul>
            {route.checkpoints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="muted">
            Авторские учебные образцы проекта. Разбор показывает применение
            критериев и требует методического утверждения преподавателем.
          </p>
        </>
      )}
    </details>
  );
}
