import { useState } from "react";
import { exercises, topics, sections, sectionTitle } from "../content/registry";
import {
  Breadcrumbs,
  EmptyState,
  ExerciseCard,
  PageHeading,
  TopicCard,
} from "../components/ui";
import { examName, levelName, matchesSearch } from "../lib/search";

function useFilters() {
  const [params, setParams] = useState(
    () => new URLSearchParams(window.location.search),
  );
  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    if (key === "exam") {
      next.delete("topic");
      next.delete("skill");
      if (value === "EGE") next.delete("line");
    }
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${next.size ? `?${next}` : ""}`,
    );
    setParams(next);
  }
  function reset() {
    window.history.replaceState(null, "", window.location.pathname);
    setParams(new URLSearchParams());
  }
  return { params, update, reset };
}
export function TheoryCatalogPage() {
  const { params, update, reset } = useFilters();
  const query = params.get("q") ?? "",
    exam = params.get("exam") ?? "",
    section = params.get("section") ?? "",
    status = params.get("status") ?? "published";
  const filtered = topics.filter(
    (topic) =>
      (!exam || topic.examTags.some((tag) => tag === exam)) &&
      (!section || topic.sectionId === section) &&
      (!status || topic.status === status) &&
      matchesSearch(query, [
        topic.title,
        topic.description,
        sectionTitle(topic.sectionId),
        ...topic.keywords,
        ...topic.skillIds,
      ]),
  );
  return (
    <>
      <Breadcrumbs items={[{ label: "Учебник" }]} />
      <PageHeading
        eyebrow="ИНТЕРАКТИВНЫЙ УЧЕБНИК"
        title="Сначала поймём правило"
        text="Выберите тему, исследуйте примеры и переходите к практике. Один урок может помогать в нескольких экзаменационных навыках."
      />
      <div className="catalog-controls">
        <label className="search-field">
          Найти тему
          <input
            placeholder="Найти тему или правило"
            value={query}
            onChange={(event) => update("q", event.target.value)}
          />
        </label>
        <label>
          Экзамен
          <select
            value={exam}
            onChange={(event) => update("exam", event.target.value)}
          >
            <option value="">ОГЭ и ЕГЭ</option>
            <option value="OGE">ОГЭ</option>
            <option value="EGE">ЕГЭ</option>
          </select>
        </label>
        <label>
          Раздел
          <select
            value={section}
            onChange={(event) => update("section", event.target.value)}
          >
            <option value="">Все разделы</option>
            {sections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          Доступность
          <select
            value={status}
            onChange={(event) => update("status", event.target.value)}
          >
            <option value="published">Готовые уроки</option>
            <option value="planned">Готовятся</option>
            <option value="">Все темы</option>
          </select>
        </label>
        <button className="button secondary" onClick={reset}>
          Сбросить фильтры
        </button>
      </div>
      <div className="catalog-layout">
        <aside className="topic-tree">
          <h2>Разделы учебника</h2>
          {sections.map((item) => (
            <button
              key={item.id}
              aria-pressed={section === item.id}
              onClick={() =>
                update("section", section === item.id ? "" : item.id)
              }
            >
              {item.title}
            </button>
          ))}
        </aside>
        <div>
          <p className="results-count" role="status">
            Найдено тем: {filtered.length}
          </p>
          <div className="topic-grid catalog-grid">
            {filtered.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                exam={exam}
                returnTo={`/theory/${params.size ? `?${params}` : ""}`}
              />
            ))}
          </div>
          {!filtered.length && (
            <EmptyState
              title="Такой темы пока нет"
              text="Измените запрос или фильтры. Короткое «не» ищется как отдельное слово."
            >
              <button className="button secondary" onClick={reset}>
                Сбросить поиск
              </button>
            </EmptyState>
          )}
        </div>
      </div>
    </>
  );
}
export function PracticeCatalogPage() {
  const { params, update, reset } = useFilters();
  const page = Math.max(1, Number(params.get("page")) || 1);
  const query = params.get("q") ?? "",
    exam = params.get("exam") ?? "",
    topic = params.get("topic") ?? "",
    skill = params.get("skill") ?? "",
    level = params.get("level") ?? "",
    taskLine = params.get("line") ?? "",
    format = params.get("format") ?? "";
  const filtered = exercises.filter(
    (exercise) =>
      (!exam || exercise.exam === exam) &&
      (!topic || exercise.topicId === topic) &&
      (!skill || exercise.skillId === skill) &&
      (!level || exercise.level === level) &&
      (!taskLine || exercise.taskLine === Number(taskLine)) &&
      (!format || exercise.format === format) &&
      matchesSearch(query, [
        exercise.title,
        exercise.topicTitle,
        exercise.prompt,
        exercise.text ?? "",
        ...exercise.options,
      ]),
  );
  const activeSkills = [
    ...new Set(
      exercises
        .filter((exercise) => !exam || exercise.exam === exam)
        .map((exercise) => exercise.skillId),
    ),
  ];
  const currentPage = Math.min(
    page,
    Math.max(1, Math.ceil(filtered.length / 12)),
  );
  function change(key: string, value: string) {
    update(key, value);
  }
  return (
    <>
      <Breadcrumbs items={[{ label: "Практика" }]} />
      <PageHeading
        eyebrow="ПРАКТИКА С РАЗБОРОМ"
        title="От понимания к решению"
        text={`${exercises.length} проверенных демонстрационных заданий. Выберите экзамен, тему или конкретный навык; каждый ответ сопровождается объяснением.`}
      />
      <div className="catalog-controls">
        <label className="search-field">
          Найти задание
          <input
            placeholder="Тема, условие или ключевое слово"
            value={query}
            onChange={(event) => change("q", event.target.value)}
          />
        </label>
        <label>
          Экзамен
          <select
            value={exam}
            onChange={(event) => {
              change("exam", event.target.value);
            }}
          >
            <option value="">ОГЭ и ЕГЭ</option>
            <option value="OGE">ОГЭ</option>
            <option value="EGE">ЕГЭ</option>
          </select>
        </label>
        <label>
          Тема
          <select
            value={topic}
            onChange={(event) => change("topic", event.target.value)}
          >
            <option value="">Все темы</option>
            {topics
              .filter(
                (item) =>
                  item.status === "published" &&
                  exercises.some(
                    (exercise) =>
                      exercise.topicId === item.id &&
                      (!exam || exercise.exam === exam),
                  ),
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
          </select>
        </label>
        <label>
          Сложность
          <select
            value={level}
            onChange={(event) => change("level", event.target.value)}
          >
            <option value="">Все уровни</option>
            {["basic", "standard", "advanced"].map((item) => (
              <option value={item} key={item}>
                {levelName(item)}
              </option>
            ))}
          </select>
        </label>
        <details className="extra-filters">
          <summary>Дополнительные фильтры</summary>
          <div>
            <label>
              Навык
              <select
                value={skill}
                onChange={(event) => change("skill", event.target.value)}
              >
                <option value="">Все навыки</option>
                {activeSkills.map((item) => {
                  const exercise = exercises.find(
                    (exercise) => exercise.skillId === item,
                  )!;
                  return (
                    <option key={item} value={item}>
                      {examName(exercise.exam)} · {exercise.topicTitle}
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              Линия ОГЭ
              <select
                value={taskLine}
                onChange={(event) => change("line", event.target.value)}
              >
                <option value="">Любая линия</option>
                {[2, 3, 5, 8, 9].map((item) => (
                  <option key={item} value={item}>
                    Задание {item}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Формат
              <select
                value={format}
                onChange={(event) => change("format", event.target.value)}
              >
                <option value="">Любой</option>
                <option value="exam-model">Экзаменационная модель</option>
                <option value="learning">Учебное упражнение</option>
              </select>
            </label>
          </div>
        </details>
        <button
          className="button secondary"
          onClick={() => {
            reset();
          }}
        >
          Сбросить фильтры
        </button>
      </div>
      <p className="results-count" role="status">
        Найдено заданий: {filtered.length}
      </p>
      <div className="topic-grid">
        {filtered
          .slice((currentPage - 1) * 12, currentPage * 12)
          .map((exercise) => (
            <ExerciseCard
              key={exercise.id}
              exercise={exercise}
              returnTo={`/practice/${params.size ? `?${params}` : ""}`}
            />
          ))}
      </div>
      {!filtered.length && (
        <EmptyState
          title="Заданий по этим условиям пока нет"
          text="Сбросьте фильтры или выберите другой навык."
        />
      )}
      {filtered.length > 12 && (
        <nav className="pagination" aria-label="Страницы банка">
          <button
            className="button secondary"
            disabled={currentPage === 1}
            onClick={() => update("page", String(currentPage - 1))}
          >
            Предыдущая
          </button>
          <span aria-live="polite">
            Страница {currentPage} из {Math.ceil(filtered.length / 12)}
          </span>
          <button
            className="button secondary"
            disabled={currentPage * 12 >= filtered.length}
            onClick={() => update("page", String(currentPage + 1))}
          >
            Следующая
          </button>
        </nav>
      )}
    </>
  );
}
