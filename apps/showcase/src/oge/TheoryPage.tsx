import { withTheoryOrigin } from "../lib/theory-navigation";
import { use } from "react";
import { theorySearchFor } from "../content/course-search";
import { courseReadingCount } from "../content/course-practice";
import { courseModules, modulePath } from "../content/course";
import "../styles/course.css";
import { useCatalogQuery } from "../lib/catalog-query";
import { publishedTopics, sections, sectionTitle } from "../content/catalog";
import { Breadcrumbs, PageHeading } from "../components/ui";
import { taskLines } from "./specification";
import { matchesSearch, normalizeSearch } from "../lib/search";
import { href } from "../routes";
export function OgeTheoryPage() {
  const { params, change, reset, rememberScroll, endSearch } =
    useCatalogQuery("/oge/theory/");
  const line = Number(params.get("line")) || 0,
    section = params.get("section") ?? "",
    q = params.get("q") ?? "",
    topicId = params.get("topic") ?? "";
  const catalogOrigin = "/oge/theory/" + (params.size ? "?" + params : "");
  const allParagraphs = q ? use(theorySearchFor()) : [];
  const filtered = publishedTopics.filter(
    (t) =>
      t.examTags.includes("OGE") &&
      (!line ||
        courseModules.some(
          (m) => m.topicId === t.id && m.ogeLines.includes(line),
        )) &&
      (!topicId || t.id === topicId) &&
      (!section || t.sectionId === section) &&
      (!q ||
        allParagraphs.some(
          (p) => p.topicId === t.id && matchesSearch(q, [p.title, p.text]),
        ) ||
        matchesSearch(q, [t.title, t.description, ...t.keywords]) ||
        courseModules.some(
          (m) =>
            m.topicId === t.id &&
            matchesSearch(q, [m.title, m.outcome, ...(m.microtopicIds ?? [])]),
        )),
  );
  const normalizedQuery = normalizeSearch(q);
  const relevance = (p: (typeof allParagraphs)[number]) =>
    normalizeSearch(p.title).includes(normalizedQuery)
      ? 2
      : normalizeSearch(p.text).includes(normalizedQuery)
        ? 1
        : 0;
  const matches = q
    ? allParagraphs
        .filter(
          (p) =>
            filtered.some((t) => t.id === p.topicId) &&
            matchesSearch(q, [p.title, p.text]),
        )
        .sort(
          (a, b) =>
            relevance(b) - relevance(a) ||
            a.title.localeCompare(b.title, "ru") ||
            a.topicId.localeCompare(b.topicId),
        )
    : [];
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(matches.length / pageSize));
  const resultPage = Math.max(
    1,
    Math.min(Number(params.get("page")) || 1, pageCount),
  );
  const visibleMatches = matches.slice(
    (resultPage - 1) * pageSize,
    resultPage * pageSize,
  );
  return (
    <>
      <Breadcrumbs
        items={[{ label: "ОГЭ", path: "/oge/" }, { label: "Вся теория" }]}
      />
      <PageHeading
        illustration="03-books-branch"
        eyebrow="УЧЕБНИК ОГЭ"
        title="Теория по номеру и по теме"
        text="Выберите номер ОГЭ или предметную тему. Изучайте короткими шагами: правило, самостоятельная проверка и новый пример. Полные справочные главы и прежние ссылки сохранены."
      />
      {topicId && (
        <p>
          Выбрана тема:{" "}
          {publishedTopics.find((t) => t.id === topicId)?.title ?? topicId}.{" "}
          <a href={href("/oge/theory/" + (line ? "?line=" + line : ""))}>
            Показать все темы
          </a>
        </p>
      )}
      <div className="catalog-controls">
        <label>
          Номер ОГЭ
          <select value={line} onChange={(e) => change("line", e.target.value)}>
            <option value="0">Все номера</option>
            {taskLines.map((l) => (
              <option key={l.number} value={l.number}>
                № {l.number} · {l.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Предметный раздел
          <select
            value={section}
            onChange={(e) => change("section", e.target.value)}
          >
            <option value="">Все разделы</option>
            {sections
              .filter((s) =>
                publishedTopics.some(
                  (t) => t.sectionId === s.id && t.examTags.includes("OGE"),
                ),
              )
              .map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
          </select>
        </label>
        <label className="search-field">
          Найти правило
          <input
            value={q}
            placeholder="Сказуемое, корень, сравнение…"
            onChange={(e) => change("q", e.target.value)}
            onBlur={endSearch}
          />
        </label>
      </div>
      <button className="button secondary" onClick={reset}>
        Сбросить фильтры
      </button>
      <p role="status" className="results-count">
        Доступно уроков: {filtered.length}
      </p>
      {q && (
        <section className="home-section">
          <h2>Найденные параграфы</h2>
          <p role="status">
            Найдено фрагментов: {matches.length}.{" "}
            {matches.length > 0 &&
              `Показаны ${(resultPage - 1) * pageSize + 1}–${Math.min(resultPage * pageSize, matches.length)}.`}
          </p>
          {visibleMatches.map((p) => {
            const topic = filtered.find((t) => t.id === p.topicId)!;
            const text = p.text;
            const first = q.trim().split(/\s+/u)[0].toLocaleLowerCase("ru");
            const start = Math.max(
              0,
              text.toLocaleLowerCase("ru").indexOf(first) - 60,
            );
            return (
              <article
                className="question-card"
                key={p.route ?? p.topicId + ":" + p.sectionId}
              >
                <h3>
                  <a
                    onClick={rememberScroll}
                    href={href(
                      p.route
                        ? withTheoryOrigin(p.route, catalogOrigin)
                        : "/theory/" +
                            topic.slug +
                            "/?exam=OGE&from=" +
                            encodeURIComponent("/oge/theory/?" + params) +
                            "#" +
                            p.sectionId,
                    )}
                  >
                    {p.title}
                  </a>
                </h3>
                <p className="muted">{topic.title}</p>
                <p>
                  {start ? "…" : ""}
                  {text.slice(start, start + 240)}…
                </p>
              </article>
            );
          })}
          {pageCount > 1 && (
            <nav
              className="inline-actions"
              aria-label="Страницы результатов поиска"
            >
              <button
                className="button secondary"
                disabled={resultPage === 1}
                onClick={() => change("page", String(resultPage - 1))}
              >
                Предыдущая
              </button>
              <span>
                Страница {resultPage} из {pageCount}
              </span>
              <button
                className="button secondary"
                disabled={resultPage === pageCount}
                onClick={() => change("page", String(resultPage + 1))}
              >
                Следующая
              </button>
            </nav>
          )}
        </section>
      )}
      {sections
        .filter((s) => filtered.some((t) => t.sectionId === s.id))
        .map((s) => (
          <section className="home-section" key={s.id}>
            <h2>{sectionTitle(s.id)}</h2>
            <div className="course-topics">
              {filtered
                .filter((t) => t.sectionId === s.id)
                .map((t) => (
                  <article className="course-topic" key={t.id}>
                    <h3>{t.title}</h3>
                    <p className="course-section-note">{t.description}</p>
                    <div className="course-module-list">
                      {courseModules
                        .filter(
                          (m) =>
                            m.topicId === t.id &&
                            (!line || m.ogeLines.includes(line)),
                        )
                        .map((m) => (
                          <article className="course-module-card" key={m.id}>
                            <h4>
                              <a
                                onClick={rememberScroll}
                                href={href(modulePath(m.id, catalogOrigin))}
                              >
                                {m.title}
                              </a>
                            </h4>
                            <p>{m.outcome}</p>
                            <p className="muted">
                              ОГЭ {m.ogeLines.map((n) => "№ " + n).join(", ")} ·{" "}
                              {m.sectionIds.length} параграфа
                            </p>
                            <p className="muted">
                              Отметки чтения:{" "}
                              {courseReadingCount(m, localStorage)} из{" "}
                              {m.sectionIds.length}; это не оценка освоения.
                            </p>
                            <a
                              onClick={rememberScroll}
                              href={href(modulePath(m.id, catalogOrigin))}
                            >
                              Изучить этот шаг →
                            </a>
                          </article>
                        ))}
                    </div>
                    <div className="course-topic-actions">
                      <a
                        onClick={rememberScroll}
                        href={href(
                          "/theory/" +
                            t.slug +
                            "/?exam=OGE&from=" +
                            encodeURIComponent("/oge/theory/?" + params),
                        )}
                      >
                        Полная справочная глава
                      </a>
                      <a href={href("/oge/bank/?topic=" + t.id)}>
                        Практика темы
                      </a>
                    </div>
                  </article>
                ))}
            </div>
          </section>
        ))}
      {!filtered.length && <p>Измените номер, раздел или поисковый запрос.</p>}
      {line > 0 && (
        <a className="button secondary" href={href(`/oge/bank/${line}/`)}>
          Практика задания № {line}
        </a>
      )}
    </>
  );
}
