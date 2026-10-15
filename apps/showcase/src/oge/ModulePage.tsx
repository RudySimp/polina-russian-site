import { use } from "react";
import { courseModules, modulePath } from "../content/course";
import { courseModuleFor } from "../content/course-load";
import { exerciseIndex, topics } from "../content/catalog";
import {
  chooseCoursePractice,
  storedCourseAttempts,
} from "../content/course-practice";
import { LessonReading } from "../components/LessonReading";
import { LessonBlocks } from "../components/LessonBlocks";
import { Badge, Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { topicIllustrations } from "../components/OgeIllustration";
import { href } from "../routes";
import { NotFoundPage } from "../pages/InfoPages";
import "../styles/course.css";
export function ModulePage({ id }: { id: string }) {
  const entry = courseModules.find((m) => m.id === id);
  if (!entry) return <NotFoundPage />;
  const content = use(courseModuleFor(id));
  const topic = topics.find((t) => t.id === entry.topicId)!;
  const candidates = exerciseIndex.filter(
    (e) =>
      e.exam === "OGE" &&
      e.generationEligible &&
      entry.skillIds.length > 0 &&
      entry.skillIds.some((s) => e.skillIds?.includes(s) || e.skillId === s),
  );
  const selected = chooseCoursePractice(candidates, storedCourseAttempts());
  const prerequisites = entry.prerequisiteIds.map((id) =>
    courseModules.find((m) => m.id === id)!,
  );
  const next = courseModules.filter((m) => m.prerequisiteIds.includes(id));
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "ОГЭ", path: "/oge/" },
          { label: "Теория", path: "/oge/theory/" },
          { label: topic.title, path: "/oge/theory/?topic=" + topic.id },
          { label: entry.title },
        ]}
      />
      <PageHeading
        eyebrow={
          "УЧЕБНЫЙ МОДУЛЬ · ОГЭ " +
          entry.ogeLines.map((n) => "№ " + n).join(", ")
        }
        title={entry.title}
        text={entry.outcome}
        illustration={topicIllustrations[entry.topicId]}
      />
      <div className="lesson-meta">
        <Badge>Учебная редакция</Badge>
        <a
          href={href(
            "/theory/" +
              topic.slug +
              "/?exam=OGE" +
              (entry.kind === "chapter-sections"
                ? "#" + entry.sectionIds[0]
                : ""),
          )}
        >
          Полная глава
        </a>
      </div>
      <article className="lesson-body course-module-body">
        <section
          className="course-prerequisites"
          aria-label="Необходимые знания"
        >
          <h2>Перед началом</h2>
          {prerequisites.length || entry.prerequisitePaths.length ? (
            <ul>
              {prerequisites.map((m) => (
                <li key={m.id}>
                  <a href={href(modulePath(m.id))}>{m.title}</a> — {m.outcome}
                </li>
              ))}
              {entry.prerequisitePaths.map((p) => (
                <li key={p.route}>
                  <a href={href(p.route)}>{p.title}</a>
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Начните с примеров ниже. Специального предыдущего модуля не
              требуется.
            </p>
          )}
        </section>
        <LessonReading lesson={content.lesson} sectionIds={entry.sectionIds} />
        {content.checkpoint && (
          <section className="course-checkpoint">
            <LessonBlocks
              blocks={[content.checkpoint]}
              scope={
                "module-" + entry.id + "@" + entry.revision + ":checkpoint"
              }
            />
          </section>
        )}
        <section className="practice-next" id="practice">
          <h2>Проверим на другом задании</h2>
          {[1, 13].some((n) => entry.ogeLines.includes(n)) ? (
            <>
              <p>
                Перейдите к письменной работе и примените приём к исходному
                тексту. Оценку содержания выставляет эксперт.
              </p>
              <LinkButton to={"/oge/bank/" + entry.ogeLines[0] + "/"}>
                Открыть письменную практику
              </LinkButton>
            </>
          ) : selected.exercise ? (
            <>
              <p>
                {selected.fresh
                  ? "Этот пример ещё не встречался в сохранённых попытках текущей редакции этого браузера."
                  : "Все доступные примеры этого навыка уже встречались. Повторим на наименее использованном."}{" "}
                Практика по отмеченным навыкам не означает охвата каждого
                частного случая модуля.
              </p>
              <LinkButton to={"/practice/" + selected.exercise.slug + "/"}>
                {selected.fresh ? "Решить новый пример" : "Повторить пример"}
              </LinkButton>
              <a
                href={href(
                  "/oge/bank/?line=" +
                    selected.exercise.taskLine +
                    "&skill=" +
                    encodeURIComponent(entry.skillIds[0]),
                )}
              >
                Выбрать задания этого навыка
              </a>
            </>
          ) : (
            <>
              <p>
                Самопроверка есть в модуле. Отдельная проверенная подборка по
                этой узкой теме пока не выделена; в банке доступны задания всей
                экзаменационной линии.
              </p>
              <LinkButton to={"/oge/bank/" + entry.ogeLines[0] + "/"}>
                Открыть задания № {entry.ogeLines[0]}
              </LinkButton>
            </>
          )}
        </section>
        <details className="provenance-details">
          <summary>Источники и редакционный статус</summary>
          <p>
            Оригинальное объяснение проекта по справочным материалам. Учебная
            редакция проверена редакционно; окончательное методическое
            утверждение Полиной ожидается. Отметка чтения означает прочтение, а
            не освоение навыка.
          </p>
          {entry.sources?.map((s, i) => (
            <p key={i}>
              {s.filename} · физическая страница PDF {s.pdfPage}
              {s.printedPage != null
                ? " · печатная страница " + s.printedPage
                : " · печатный номер не установлен"}{" "}
              · {s.section}
            </p>
          ))}
          {!entry.sources?.length &&
            content.lesson.provenance.map((s, i) => (
              <p key={i}>
                {s.filename ?? s.sourceId}
                {s.pages?.length
                  ? " · номера в прежней ссылке на источник: " +
                    s.pages.join(", ")
                  : ""}
                . Физические страницы отдельно не подтверждены.
              </p>
            ))}
          {entry.normativeSources?.map((s) => (
            <p key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.title}
              </a>{" "}
              · сверка {s.checkedAt}
            </p>
          ))}
          <a href={href("/sources/")}>Происхождение материалов</a>
        </details>
      </article>
      <nav className="course-next" aria-label="Следующий учебный шаг">
        {next.map((m) => (
          <LinkButton key={m.id} to={modulePath(m.id)} secondary>
            Далее: {m.title}
          </LinkButton>
        ))}
        <a href={href("/oge/theory/?topic=" + entry.topicId)}>
          Все модули этой темы
        </a>
      </nav>
    </>
  );
}
