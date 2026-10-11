import { Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { exerciseIndex, topics } from "../content/catalog";
import { href } from "../routes";
import type { LocalAttempt } from "../progress";
import { taskLines } from "./specification";
import { ogeCatalog } from "./catalog";
import { listSessions } from "./storage";
import { Generator } from "./VariantPages";

export default function OverviewPage({
  attempts,
}: {
  attempts: LocalAttempt[];
}) {
  const materials = ogeCatalog,
    activities = ogeCatalog.activities;
  let draft;
  try {
    draft = listSessions(window.localStorage).find((s) => !s.completedAt);
  } catch {}
  return (
    <>
      <Breadcrumbs items={[{ label: "ОГЭ" }]} />
      <PageHeading
        eyebrow="РУССКИЙ ЯЗЫК · ОГЭ"
        title="Учиться, решать, проверять"
        text="Выберите номер задания, откройте теорию или начните целую работу. Здесь доступны все 13 линий проекта ОГЭ-2027."
      />
      <nav className="oge-directions" aria-label="Направления подготовки ОГЭ">
        {[
          ["theory", "Теория"],
          ["bank", "Банк заданий"],
          ["variants", "Готовые варианты"],
          ["generator", "Генератор"],
          ["games", "Тренажёры"],
        ].map(([id, label]) => (
          <a key={id} href={`#${id}`}>
            {label}
          </a>
        ))}
      </nav>
      {draft && (
        <aside className="editorial-note">
          <h2>Продолжить сохранённую работу</h2>
          <p>
            {draft.title} ·{" "}
            {Object.values(draft.answers).filter((a) => a.trim()).length}{" "}
            ответов
          </p>
          <LinkButton to={`/oge/practice/session/?id=${draft.id}`}>
            Продолжить
          </LinkButton>
        </aside>
      )}
      <section className="home-section" id="bank">
        <div className="section-heading">
          <h2>Банк заданий</h2>
          <a href={href("/oge/bank/")}>Поиск и подборки</a>
        </div>
        <nav className="oge-lines" aria-label="Начать с номера задания">
          {taskLines.map((line) => {
            const count = [1, 13].includes(line.number)
              ? materials.writing.filter((w) => w.line === line.number).length
              : exerciseIndex.filter(
                  (e) => e.exam === "OGE" && e.taskLine === line.number,
                ).length;
            return (
              <a key={line.number} href={href(`/oge/bank/${line.number}/`)}>
                <strong>№ {line.number}</strong>
                <span>{line.title}</span>
                <small>
                  {count}{" "}
                  {line.response === "extended"
                    ? "письменных работ"
                    : "заданий"}
                </small>
              </a>
            );
          })}
        </nav>
      </section>
      <section className="home-section" id="theory">
        <div className="section-heading">
          <h2>Теория по заданиям и темам</h2>
          <a href={href("/oge/theory/")}>Весь учебник ОГЭ</a>
        </div>
        <div className="oge-theory-links">
          {taskLines.map((line) => (
            <a
              key={line.number}
              href={href(
                `/theory/${line.topicIds[0]}/?exam=OGE&from=${encodeURIComponent("/oge/theory/?line=" + line.number)}`,
              )}
            >
              <strong>
                № {line.number} · {line.title}
              </strong>
              <span>
                {topics.find((t) => t.id === line.topicIds[0])?.description}
              </span>
            </a>
          ))}
        </div>
      </section>
      <section className="home-section" id="variants">
        <div className="section-heading">
          <h2>Готовые учебные варианты</h2>
          <a href={href("/oge/variants/")}>Все пять вариантов</a>
        </div>
        <div className="topic-grid">
          {materials.variants.slice(0, 3).map((v) => (
            <article className="question-card" key={v.id}>
              <h3>{v.title}</h3>
              <p>
                Изложение с аудио · 11 тестовых заданий · сочинение на выбор
              </p>
              <LinkButton to={`/oge/variants/${v.number}/`}>
                Начать вариант № {v.number}
              </LinkButton>
            </article>
          ))}
        </div>
      </section>
      <section className="home-section" id="generator">
        <Generator attempts={attempts} compact />
      </section>
      <section className="home-section" id="games">
        <div className="section-heading">
          <h2>Тематические тренажёры</h2>
          <a href={href("/oge/games/")}>Все тренажёры</a>
        </div>
        <div className="topic-grid">
          {activities.map((a) => (
            <article className="question-card" key={a.id}>
              <h3>{a.title}</h3>
              <p>{a.description}</p>
              <p>{a.situationCount} ситуаций с разбором</p>
              <LinkButton to={`/oge/games/${a.id}/`}>
                Открыть тренажёр
              </LinkButton>
            </article>
          ))}
        </div>
      </section>
      <div className="inline-actions">
        <LinkButton to="/oge/results/">Мои работы и результаты</LinkButton>
      </div>
      <p className="editorial-note">
        Учебные материалы составлены по проекту модели ФИПИ-2027. Аудио озвучено
        синтезированным голосом. Письменные ответы оценивает эксперт;
        редакторская проверка материалов завершена, методическое утверждение
        преподавателем ожидается.
      </p>
    </>
  );
}
