import { OgeIllustration } from "./OgeIllustration";
import type { ReactNode } from "react";
import { ArrowRight, ArrowUpRight, Search } from "lucide-react";
import { href } from "../routes";
import {
  exerciseSummariesFor as exercisesFor,
  sectionTitle,
  type Topic,
  type ExerciseSummary,
} from "../content/catalog";
import { examName, levelName } from "../lib/search";
import { taskLines } from "../oge/specification";

export function LinkButton({
  to,
  children,
  secondary = false,
}: {
  to: string;
  children: ReactNode;
  secondary?: boolean;
}) {
  return (
    <a className={`button ${secondary ? "secondary" : ""}`} href={href(to)}>
      {children}
      <ArrowRight size={18} aria-hidden="true" />
    </a>
  );
}
export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}
export function PageHeading({
  eyebrow,
  title,
  text,
  illustration,
}: {
  illustration?: string;
  eyebrow: string;
  title: string;
  text: string;
}) {
  return (
    <div
      className={"page-heading" + (illustration ? " with-illustration" : "")}
    >
      {illustration && <OgeIllustration id={illustration} priority />}
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      <p className="lede">{text}</p>
    </div>
  );
}
export function Breadcrumbs({
  items,
}: {
  items: { label: string; path?: string }[];
}) {
  return (
    <nav className="breadcrumbs" aria-label="Хлебные крошки">
      <ol>
        <li>
          <a href={href("/")}>Главная</a>
        </li>
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`}>
            {item.path ? (
              <a href={href(item.path)}>{item.label}</a>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
export function TopicCard({
  topic,
  exam,
  returnTo,
}: {
  topic: Topic;
  exam?: string;
  returnTo?: string;
}) {
  const params = new URLSearchParams();
  if (exam) params.set("exam", exam);
  if (returnTo) params.set("from", returnTo);
  const suffix = params.size ? `?${params}` : "";
  const count = exercisesFor(topic.id, exam).length;
  const ogeLine =
    exam === "OGE" && count === 0
      ? taskLines.find(
          (line) =>
            line.topicIds.includes(topic.id) && line.response !== "extended",
        )
      : undefined;
  const body = (
    <>
      <div className="card-top">
        <span className="card-category">{sectionTitle(topic.sectionId)}</span>
        <span className="card-index" aria-hidden="true">
          {String(topic.order).padStart(2, "0")}
        </span>
      </div>
      <h3>{topic.title}</h3>
      <p>{topic.description}</p>
      <div className="card-bottom">
        <span>
          {topic.status === "published"
            ? ["izlozhenie", "sochinenie"].includes(topic.id)
              ? "Письменная практика · интерактив"
              : ogeLine
                ? `Практика задания № ${ogeLine.number} · интерактив`
                : `${count} заданий · интерактив`
            : "Готовится"}
        </span>
        {topic.status === "published" && (
          <ArrowUpRight size={20} aria-hidden="true" />
        )}
      </div>
    </>
  );
  return topic.status === "published" ? (
    <a className="topic-card" href={href(`/theory/${topic.slug}/${suffix}`)}>
      {body}
    </a>
  ) : (
    <article className="topic-card planned">{body}</article>
  );
}
export function ExerciseCard({
  exercise,
  returnTo,
}: {
  exercise: ExerciseSummary;
  returnTo?: string;
}) {
  return (
    <a
      className="exercise-card"
      href={href(
        `/practice/${exercise.slug}/${returnTo ? `?from=${encodeURIComponent(returnTo)}` : ""}`,
      )}
    >
      <div className="card-top">
        <Badge>
          {examName(exercise.exam)}
          {exercise.taskLine ? ` · задание ${exercise.taskLine}` : ""}
        </Badge>
        <span className="muted">{levelName(exercise.level)}</span>
      </div>
      <h3>{exercise.title}</h3>
      <p>{exercise.topicTitle}</p>
      <div className="card-bottom">
        <span>
          {exercise.format === "learning"
            ? "Учебное упражнение"
            : "Экзаменационная модель"}
        </span>
        <ArrowUpRight size={20} aria-hidden="true" />
      </div>
    </a>
  );
}
export function EmptyState({
  title,
  text,
  children,
}: {
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <Search size={28} aria-hidden="true" />
      <h2>{title}</h2>
      <p>{text}</p>
      {children}
    </div>
  );
}
