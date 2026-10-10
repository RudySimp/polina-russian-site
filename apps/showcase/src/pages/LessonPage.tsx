import { use } from "react";
import {
  exercisesFor,
  lessonFor,
  topics,
  sectionTitle,
} from "../content/registry";
import {
  Breadcrumbs,
  Badge,
  LinkButton,
  PageHeading,
  TopicCard,
} from "../components/ui";
import { LessonBlocks } from "../components/LessonBlocks";
import { href } from "../routes";
import { examName } from "../lib/search";
import { NotFoundPage } from "./InfoPages";

export function LessonPage({ slug }: { slug: string }) {
  const topic = topics.find(
    (topic) => topic.slug === slug && topic.status === "published",
  );
  if (!topic) return <NotFoundPage />;
  const lesson = use(lessonFor(topic.id));
  const params = new URLSearchParams(window.location.search);
  const requestedExam = params.get("exam") ?? "";
  const exam = topic.examTags.some((tag) => tag === requestedExam)
    ? requestedExam
    : "";
  const requestedReturn = params.get("from") ?? "";
  const returnTo =
    /^\/theory\/(?:\?|$)/.test(requestedReturn) && requestedReturn.length < 1000
      ? requestedReturn
      : `/theory/${exam ? `?exam=${exam}` : ""}`;
  const practice = exercisesFor(topic.id, exam);
  const neighbors = topics.filter(
    (item) =>
      item.status === "published" &&
      (!exam || item.examTags.some((tag) => tag === exam)),
  );
  const index = neighbors.findIndex((item) => item.id === topic.id);
  return (
    <>
      <Breadcrumbs
        items={[
          ...(exam
            ? [{ label: examName(exam), path: `/${exam.toLowerCase()}/` }]
            : []),
          { label: "Учебник", path: returnTo },
          {
            label: sectionTitle(topic.sectionId),
            path: `/theory/?section=${topic.sectionId}${exam ? `&exam=${exam}` : ""}`,
          },
          { label: topic.title },
        ]}
      />
      <PageHeading
        eyebrow={sectionTitle(topic.sectionId).toLocaleUpperCase("ru")}
        title={topic.title}
        text={topic.description}
      />
      <div className="lesson-meta">
        <Badge>Демонстрационный урок</Badge>
        <span>
          {practice.length} заданий{exam ? ` · ${examName(exam)}` : ""}
        </span>
        <a href={href(returnTo)}>Вернуться к каталогу</a>
      </div>
      <div className="lesson-layout">
        <article className="lesson-body">
          <section className="lesson-goals">
            <h2>Чему вы научитесь</h2>
            <ul>
              {lesson.objectives.map((goal) => (
                <li key={goal}>{goal}</li>
              ))}
            </ul>
          </section>
          {lesson.sections.map((section) => (
            <section
              id={section.id}
              className="lesson-section"
              key={section.id}
            >
              <h2>{section.title}</h2>
              <LessonBlocks blocks={section.blocks} />
            </section>
          ))}
          <section id="practice" className="practice-next">
            <h2>Теперь проверим понимание</h2>
            {practice.length ? (
              <>
                <p>
                  {practice.length} разных заданий с разбором и повторением по
                  этому навыку.
                </p>
                <LinkButton to={`/practice/${practice[0].slug}/`}>
                  Начать практику{exam ? ` ${examName(exam)}` : ""}
                </LinkButton>
                <a
                  href={href(
                    `/practice/?topic=${topic.id}${exam ? `&exam=${exam}` : ""}`,
                  )}
                >
                  Выбрать задание в банке
                </a>
              </>
            ) : (
              <>
                <p>
                  Для этого направления отдельная подборка по теме ещё
                  готовится. Интерактивы урока доступны для самопроверки.
                </p>
                <LinkButton to={`/practice/?exam=${exam}`} secondary>
                  Другие задания {examName(exam)}
                </LinkButton>
              </>
            )}
          </section>
          <details className="provenance-details">
            <summary>Источники и статус урока</summary>
            <p>
              Объяснение и примеры подготовлены для демонстрационной редакции.
              Окончательное утверждение Полиной ожидается. Исходные сторонние
              PDF не распространяются.
            </p>
            {lesson.provenance.map((source, n) => (
              <p key={n}>
                {source.filename ?? source.sourceId}
                {source.pages?.length
                  ? ` · страницы ${source.pages.join(", ")}`
                  : ""}
              </p>
            ))}
            <a href={href("/sources/")}>О происхождении материалов</a>
          </details>
        </article>
        <aside className="lesson-toc">
          <details open>
            <summary>Содержание урока</summary>
            <nav aria-label="Содержание урока">
              <a href="#main">Чему вы научитесь</a>
              {lesson.sections.map((section) => (
                <a href={`#${section.id}`} key={section.id}>
                  {section.title}
                </a>
              ))}
              <a href="#practice">Практика</a>
            </nav>
          </details>
          <p>
            От правила к действию.
            <br />
            Без спешки, с объяснением.
          </p>
        </aside>
      </div>
      <nav className="lesson-neighbors" aria-label="Соседние темы">
        {index > 0 && (
          <a
            href={href(
              `/theory/${neighbors[index - 1].slug}/${exam ? `?exam=${exam}` : ""}`,
            )}
          >
            ← {neighbors[index - 1].title}
          </a>
        )}
        {index < neighbors.length - 1 && (
          <a
            href={href(
              `/theory/${neighbors[index + 1].slug}/${exam ? `?exam=${exam}` : ""}`,
            )}
          >
            {neighbors[index + 1].title} →
          </a>
        )}
      </nav>
      <section className="home-section">
        <h2>Связанные темы</h2>
        <div className="topic-grid">
          {lesson.relatedTopicIds
            .map((id) => topics.find((item) => item.id === id)!)
            .filter(
              (item) => !exam || item.examTags.some((tag) => tag === exam),
            )
            .map((item) => (
              <TopicCard key={item.id} topic={item} exam={exam} />
            ))}
        </div>
      </section>
    </>
  );
}
