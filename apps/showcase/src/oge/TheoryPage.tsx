import { useCatalogQuery } from "../lib/catalog-query";
import paragraphs from "../content/lesson-search.json";
import { publishedTopics, sections, sectionTitle } from "../content/catalog";
import { Breadcrumbs, PageHeading, TopicCard } from "../components/ui";
import { taskLines } from "./specification";
import { matchesSearch } from "../lib/search";
import { href } from "../routes";
export function OgeTheoryPage() {
  const { params, change, reset, rememberScroll, endSearch } =
    useCatalogQuery("/oge/theory/");
  const line = Number(params.get("line")) || 0,
    section = params.get("section") ?? "",
    q = params.get("q") ?? "";
  const filtered = publishedTopics.filter(
    (t) =>
      t.examTags.includes("OGE") &&
      (!line ||
        taskLines.find((l) => l.number === line)?.topicIds.includes(t.id)) &&
      (!section || t.sectionId === section) &&
      (!q ||
        paragraphs.some(
          (p) => p.topicId === t.id && matchesSearch(q, [p.title, p.text]),
        ) ||
        matchesSearch(q, [t.title, t.description, ...t.keywords])),
  );
  return (
    <>
      <Breadcrumbs
        items={[{ label: "ОГЭ", path: "/oge/" }, { label: "Вся теория" }]}
      />
      <PageHeading
        eyebrow="УЧЕБНИК ОГЭ"
        title="Теория по номеру и по теме"
        text="Выберите экзаменационную линию или раздел русского языка. Каждый урок содержит правило, границы применения, примеры, ошибки и практику."
      />
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
          {paragraphs
            .filter(
              (p) =>
                filtered.some((t) => t.id === p.topicId) &&
                matchesSearch(q, [p.title, p.text]),
            )
            .slice(0, 40)
            .map((p) => {
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
                  key={p.topicId + ":" + p.sectionId}
                >
                  <h3>
                    <a
                      onClick={rememberScroll}
                      href={href(
                        "/theory/" +
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
        </section>
      )}
      {sections
        .filter((s) => filtered.some((t) => t.sectionId === s.id))
        .map((s) => (
          <section className="home-section" key={s.id}>
            <h2>{sectionTitle(s.id)}</h2>
            <div className="topic-grid">
              {filtered
                .filter((t) => t.sectionId === s.id)
                .map((t) => (
                  <TopicCard
                    key={t.id}
                    topic={t}
                    exam="OGE"
                    returnTo={`/oge/theory/${params.size ? `?${params}` : ""}`}
                  />
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
