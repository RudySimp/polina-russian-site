import { courseModulesFor, modulePath } from "../content/course";
import {
  chooseCoursePractice,
  storedCourseAttempts,
} from "../content/course-practice";
import { topicIllustrations } from "../components/OgeIllustration";
import { use } from "react";
import {
  exerciseSummariesFor as exercisesFor,
  topics,
  sectionTitle,
} from "../content/catalog";
import { lessonFor } from "../content/lesson-load";
import {
  Breadcrumbs,
  Badge,
  LinkButton,
  PageHeading,
  TopicCard,
} from "../components/ui";
import { LessonReading } from "../components/LessonReading";
import { href } from "../routes";
import { taskLines } from "../oge/specification";
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
    /^\/(?:theory|oge\/theory)\/(?:\?|$)/.test(requestedReturn) &&
    requestedReturn.length < 1000
      ? requestedReturn
      : exam === "OGE"
        ? "/oge/theory/"
        : `/theory/${exam ? `?exam=${exam}` : ""}`;
  const practice = exercisesFor(topic.id, exam);
  const selectedPractice =
    exam === "OGE"
      ? chooseCoursePractice(practice, storedCourseAttempts())
      : { exercise: practice[0], fresh: false };
  const learningModules = exam === "OGE" ? courseModulesFor(topic.id) : [];
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
            path:
              exam === "OGE"
                ? `/oge/theory/?section=${topic.sectionId}`
                : `/theory/?section=${topic.sectionId}${exam ? `&exam=${exam}` : ""}`,
          },
          { label: topic.title },
        ]}
      />
      <PageHeading
        illustration={exam === "OGE" ? topicIllustrations[topic.id] : undefined}
        eyebrow={sectionTitle(topic.sectionId).toLocaleUpperCase("ru")}
        title={topic.title}
        text={topic.description}
      />
      <div className="lesson-meta">
        <Badge>Демонстрационный урок</Badge>
        <span>
          {["izlozhenie", "sochinenie"].includes(topic.id)
            ? "Письменная практика"
            : `${practice.length} заданий${exam ? ` · ${examName(exam)}` : ""}`}
        </span>
        <a href={href(returnTo)}>Вернуться к каталогу</a>
      </div>
      {learningModules.length > 0 && (
        <section className="practice-next">
          <h2>Изучать короткими шагами</h2>
          <p>
            Эта страница — полная справочная глава. Модули выделяют один учебный
            шаг с предпосылками и практикой; отметки и ответы в параграфах
            общие.
          </p>
          <ul>
            {learningModules.map((m) => (
              <li key={m.id}>
                <a href={href(modulePath(m.id))}>{m.title}</a> — {m.outcome}
              </li>
            ))}
          </ul>
        </section>
      )}
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
          <LessonReading lesson={lesson} />
          <section id="practice" className="practice-next">
            <h2>Теперь проверим понимание</h2>
            {["izlozhenie", "sochinenie"].includes(topic.id) ? (
              <>
                <p>
                  Письменные работы с сохранением черновика, критериями и
                  самопроверкой. Оценку содержания выставляет эксперт.
                </p>
                <LinkButton
                  to={`/oge/bank/${topic.id === "izlozhenie" ? 1 : 13}/`}
                >
                  Открыть письменную практику
                </LinkButton>
              </>
            ) : practice.length ? (
              <>
                <p>
                  {practice.length} разных заданий с разбором и повторением по
                  этому навыку.
                </p>
                <LinkButton
                  to={`/practice/${selectedPractice.exercise!.slug}/`}
                >
                  {exam === "OGE"
                    ? selectedPractice.fresh
                      ? "Решить новый пример"
                      : "Повторить пример"
                    : "Начать практику"}
                  {exam ? ` ${examName(exam)}` : ""}
                </LinkButton>
                <a
                  href={href(
                    exam === "OGE"
                      ? `/oge/bank/?line=${practice[0]?.taskLine ?? 0}&topic=${topic.id}`
                      : `/practice/?topic=${topic.id}${exam ? `&exam=${exam}` : ""}`,
                  )}
                >
                  Выбрать задание в банке
                </a>
              </>
            ) : (
              <>
                {exam === "OGE" &&
                taskLines.find((line) => line.topicIds.includes(topic.id)) ? (
                  <>
                    <p>
                      Правило применяется в экзаменационной линии. Продолжите
                      разбор на заданиях этой линии.
                    </p>
                    <LinkButton
                      to={`/oge/bank/${taskLines.find((line) => line.topicIds.includes(topic.id))!.number}/?view=expanded`}
                    >
                      Решать задания с разбором
                    </LinkButton>
                  </>
                ) : (
                  <p>
                    Интерактивы урока доступны для самопроверки. Выберите
                    задания своего направления.
                  </p>
                )}
                <LinkButton
                  to={exam === "OGE" ? "/oge/bank/" : `/practice/?exam=${exam}`}
                  secondary
                >
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
              <section key={n}>
                <p>{source.filename ?? source.sourceId}</p>
                {source.pageReferences?.length ? (
                  <ul>
                    {source.pageReferences.map((reference, index) => (
                      <li key={index}>
                        PDF-страница {reference.pdfPage}
                        {reference.printedPage
                          ? ", печатная страница " + reference.printedPage
                          : ", печатный номер не установлен"}
                        : {reference.section}.
                      </li>
                    ))}
                  </ul>
                ) : null}
                {source.sourceSha256 && (
                  <p className="muted">
                    Проверенная редакция источника, SHA-256:{" "}
                    <code style={{ overflowWrap: "anywhere" }}>
                      {source.sourceSha256}
                    </code>
                    .
                  </p>
                )}
                {source.pages?.length ? (
                  <p className="muted">
                    Номера из прежней ссылки сохранены без подтверждения их
                    системы нумерации: {source.pages.join(", ")}.
                  </p>
                ) : null}
              </section>
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
