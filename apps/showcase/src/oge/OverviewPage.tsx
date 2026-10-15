import { QuickPracticeButton } from "../components/QuickPracticeButton";
import { useEffect, useState } from "react";
import { listSessionSummariesDurably } from "./repository";
import {
  ArrowRight,
  BookOpen,
  Files,
  ListChecks,
  Puzzle,
  Shuffle,
} from "lucide-react";
import { Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { exerciseIndex, topics } from "../content/catalog";
import { href } from "../routes";
import type { LocalAttempt } from "../progress";
import { taskLines } from "./specification";
import { ogeCatalog } from "./catalog";
import { listSessionSummaries } from "./storage";

const directions = [
  {
    path: "/oge/theory/",
    title: "Вся теория",
    text: "Правила, примеры и разбор",
    icon: BookOpen,
  },
  {
    path: "/oge/bank/",
    title: "Все задания",
    text: "№ 1–13 и подборки для решения",
    icon: ListChecks,
  },
  {
    path: "/oge/variants/",
    title: "Готовые варианты",
    text: "Полные работы с аудио",
    icon: Files,
  },
  {
    path: "/oge/generator/",
    title: "Генератор",
    text: "Новый вариант или тренировка",
    icon: Shuffle,
  },
  {
    path: "/oge/games/",
    title: "Тематические тренажёры",
    text: "Выделяйте, исправляйте, сопоставляйте",
    icon: Puzzle,
  },
];
const ogeExercises = new Map(
  exerciseIndex
    .filter((item) => item.exam === "OGE")
    .map((item) => [item.id, item]),
);

export default function OverviewPage({
  attempts,
}: {
  attempts: LocalAttempt[];
}) {
  const [draft, setDraft] = useState(() => {
    try {
      return listSessionSummaries(window.localStorage).find(
        (s) => !s.completedAt,
      );
    } catch {
      return undefined;
    }
  });
  useEffect(() => {
    let active = true;
    listSessionSummariesDurably().then((s) => {
      if (active) setDraft(s.find((s) => !s.completedAt));
    });
    return () => {
      active = false;
    };
  }, []);
  const lastAttempt = [...attempts]
    .reverse()
    .find((attempt) => ogeExercises.has(attempt.exerciseId));
  const lastTopic = lastAttempt
    ? topics.find(
        (topic) =>
          topic.id === ogeExercises.get(lastAttempt.exerciseId)?.topicId,
      )
    : undefined;
  return (
    <div className="oge-overview">
      <Breadcrumbs items={[{ label: "ОГЭ" }]} />
      <PageHeading
        illustration="01-book-branch"
        eyebrow="РУССКИЙ ЯЗЫК · ОГЭ"
        title="Подготовка к ОГЭ"
        text="Правила, задания и варианты с разбором и сохранением."
      />
      <nav className="oge-directions" aria-label="Направления подготовки ОГЭ">
        {directions.map(({ path, title, text, icon: Icon }) => (
          <a key={path} href={href(path)}>
            <Icon size={21} aria-hidden="true" />
            <strong>{title}</strong>
            <span>{text}</span>
            <ArrowRight
              className="direction-arrow"
              size={18}
              aria-hidden="true"
            />
          </a>
        ))}
      </nav>
      <aside
        className="oge-quick-start"
        aria-label="Начать или продолжить работу"
      >
        <div>
          <h2>{draft ? "Сохранённая работа" : "Начните с задания № 2"}</h2>
          <p>
            {draft
              ? draft.title
              : "Грамматическая основа: короткая подборка с разбором."}
          </p>
        </div>
        <div className="inline-actions">
          {draft ? (
            <LinkButton to={"/oge/practice/session/?id=" + draft.id}>
              Продолжить
            </LinkButton>
          ) : (
            <QuickPracticeButton label="Решать задание № 2" />
          )}
        </div>
      </aside>
      <section className="home-section" id="bank">
        <div className="section-heading">
          <h2>Выберите номер задания</h2>
          <a href={href("/oge/bank/")}>Все задания и поиск</a>
        </div>
        <nav className="oge-lines" aria-label="Начать с номера задания">
          {taskLines.map((line) => (
            <a key={line.number} href={href(`/oge/bank/${line.number}/`)}>
              <strong>№ {line.number}</strong>
              <span>{line.title}</span>
            </a>
          ))}
        </nav>
      </section>
      <section className="home-section" id="variants">
        <div className="section-heading">
          <h2>Готовые учебные варианты</h2>
          <a href={href("/oge/variants/")}>Все варианты</a>
        </div>
        <div className="topic-grid">
          {ogeCatalog.variants.slice(0, 3).map((variant) => (
            <article className="question-card" key={variant.id}>
              <h3>{variant.title}</h3>
              <p>
                Изложение с аудио · 11 тестовых заданий · сочинение на выбор
              </p>
              <LinkButton to={`/oge/variants/${variant.number}/`}>
                Начать вариант № {variant.number}
              </LinkButton>
            </article>
          ))}
        </div>
      </section>
      <section className="home-section" id="games">
        <div className="section-heading">
          <h2>Тематические тренажёры</h2>
          <a href={href("/oge/games/")}>Все тренажёры</a>
        </div>
        <p className="oge-section-intro">
          Отрабатывайте отдельное действие: выделите основу, поставьте знак или
          исправьте форму слова. Для экзаменационных коротких ответов выбирайте
          «Все задания».
        </p>
        <div className="topic-grid">
          {ogeCatalog.activities.slice(0, 3).map((activity) => (
            <article className="question-card" key={activity.id}>
              <h3>{activity.title}</h3>
              <p>{activity.description}</p>
              <LinkButton to={`/oge/games/${activity.id}/`}>
                Открыть тренажёр
              </LinkButton>
            </article>
          ))}
        </div>
      </section>
      {lastTopic && (
        <aside className="oge-quick-start">
          <div>
            <h2>Вернуться к последней теме</h2>
            <p>{lastTopic.title}</p>
          </div>
          <LinkButton to={`/theory/${lastTopic.slug}/?exam=OGE`} secondary>
            Повторить правило
          </LinkButton>
        </aside>
      )}
      <p className="editorial-note">
        Учебные материалы по проекту модели ФИПИ-2027. Аудио озвучено
        синтезированным голосом. Письменные ответы оценивает эксперт.
        Методическое утверждение преподавателем ожидается.
      </p>
    </div>
  );
}
