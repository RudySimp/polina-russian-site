import { ArrowRight, BookOpen, Check, Leaf, PencilLine } from "lucide-react";
import { publishedTopics, exerciseIndex as exercises } from "../content/catalog";
import { href } from "../routes";
import type { LocalAttempt } from "../progress";
import { Badge, LinkButton, TopicCard } from "../components/ui";

export function HomePage({ attempts }: { attempts: LocalAttempt[] }) {
  const correct = attempts.filter(
    (attempt) => attempt.results[0].status === "correct",
  ).length;
  return (
    <>
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">
            <Leaf size={17} aria-hidden="true" /> РУССКИЙ ЯЗЫК В СВОЁМ ТЕМПЕ
          </p>
          <h1>
            Русский язык
            <br />
            становится <em>понятнее.</em>
          </h1>
          <p className="lede">
            Изучайте правила, разбирайте примеры и тренируйтесь в заданиях ОГЭ и
            ЕГЭ. Последовательно, без спешки и с объяснением ошибок.
          </p>
          <div className="hero-actions">
            <a className="button" href="#exams">
              Выбрать экзамен <ArrowRight size={18} />
            </a>
            <LinkButton to="/theory/" secondary>
              Открыть учебник
            </LinkButton>
          </div>
          <p className="hero-footnote">
            <Check size={17} /> Правило → пример → практика → разбор
          </p>
        </div>
        <div className="hero-art">
          <div className="notebook">
            <div className="notebook-top">
              <BookOpen size={20} /> МАЛЕНЬКОЕ НАБЛЮДЕНИЕ
            </div>
            <p className="notebook-title">
              Запятая —<br />
              <em>это логика.</em>
            </p>
            <p className="example-sentence">
              Книги<span className="coral-comma">,</span> тетради
              <br />
              <span className="circled-and">и</span> карандаши.
            </p>
            <p className="notebook-rule">
              Одиночное «и» соединяет.
              <br />
              Лишняя запятая не нужна.
            </p>
            <a href={href("/theory/odnorodnye/")} className="text-link">
              Исследовать правило <ArrowRight size={18} />
            </a>
          </div>
          <div className="paper-label">
            <PencilLine size={17} /> Понимание начинается с примера
          </div>
        </div>
      </section>
      <section id="exams" className="home-section">
        <div className="section-heading">
          <h2>К какому экзамену готовимся?</h2>
          <span className="muted">Выберите направление</span>
        </div>
        <div className="exam-grid">
          <a className="exam-card oge" href={href("/oge/")}>
            <span className="exam-kicker">ОГЭ · 9 класс</span>
            <h3>
              От основ
              <br />к уверенному решению
            </h3>
            <p>Грамматическая основа, синтаксис, пунктуация и формы слов.</p>
            <span className="text-link">
              Открыть подготовку <ArrowRight size={19} />
            </span>
          </a>
          <a className="exam-card ege" href={href("/ege/")}>
            <span className="exam-kicker">ЕГЭ · 10–11 класс</span>
            <h3>
              Точность в каждом
              <br />
              слове и знаке
            </h3>
            <p>Орфоэпические нормы, НЕ с прилагательными и однородные члены.</p>
            <span className="text-link">
              Открыть подготовку <ArrowRight size={19} />
            </span>
          </a>
        </div>
      </section>
      <section className="home-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">УЧЕБНИК С ЖИВЫМИ ПРИМЕРАМИ</p>
            <h2>Одна тема — понятный следующий шаг</h2>
          </div>
          <a className="text-link" href={href("/theory/")}>
            Все темы <ArrowRight size={18} />
          </a>
        </div>
        <div className="topic-grid">
          {[publishedTopics[0], publishedTopics[5], publishedTopics[7]].map(
            (topic) => (
              <TopicCard key={topic.id} topic={topic} />
            ),
          )}
        </div>
      </section>
      <section className="learning-path">
        <h2>Как устроено обучение</h2>
        <ol>
          {[
            [
              "01",
              "Разберите правило",
              "Понятие, границы применения и типичные ошибки.",
            ],
            [
              "02",
              "Исследуйте пример",
              "Меняйте условия и проверяйте свои рассуждения.",
            ],
            [
              "03",
              "Решите задание",
              "Краткий ответ или учебный выбор — с ясной инструкцией.",
            ],
            [
              "04",
              "Закрепите навык",
              "Разбор ответа и следующее задание по тому же навыку.",
            ],
          ].map(([number, title, text]) => (
            <li key={number}>
              <span aria-hidden="true">{number}</span>
              <h3>{title}</h3>
              <p>{text}</p>
            </li>
          ))}
        </ol>
      </section>
      <section className="practice-banner">
        <div>
          <Badge>
            {publishedTopics.length} уроков · {exercises.length} заданий
          </Badge>
          <h2>Попробуйте самостоятельную практику</h2>
          <p>
            После ответа покажем причину выбора и поможем вернуться к нужному
            правилу.
          </p>
        </div>
        <LinkButton to="/practice/">Выбрать тренировку</LinkButton>
      </section>
      <section className="progress-strip">
        <div>
          <h2>
            {attempts.length
              ? "Продолжим с того места, где остановились"
              : "Ваш прогресс начинается с первого ответа"}
          </h2>
          <p>
            {attempts.length
              ? `${correct} верных из ${attempts.length} попыток. История сохранена в этом браузере.`
              : "История тренировок хранится только в этом браузере и помогает выбирать повторение."}
          </p>
        </div>
        <LinkButton to="/progress/" secondary>
          Мой прогресс
        </LinkButton>
      </section>
    </>
  );
}
