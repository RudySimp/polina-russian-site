import { QuickPracticeButton } from "../components/QuickPracticeButton";
import { ArrowRight, BookOpen, Check, Leaf, PencilLine } from "lucide-react";
import {
  publishedTopics,
  exerciseIndex as exercises,
} from "../content/catalog";
import { href } from "../routes";
import { Badge, LinkButton, TopicCard } from "../components/ui";

export function HomePage() {
  return (
    <>
      <section className="hero home-entry">
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
            Выберите экзамен, повторяйте правила и решайте задания с разбором
            ошибок. Начать можно без регистрации.
          </p>
          <div className="hero-actions" id="exams">
            <QuickPracticeButton label="Начать: 5 заданий ОГЭ" />
            <LinkButton to="/oge/">ОГЭ · 9 класс</LinkButton>
            <LinkButton to="/ege/" secondary>
              ЕГЭ · 10–11 класс
            </LinkButton>
          </div>
          <a href={href("/theory/")} className="text-link home-textbook-link">
            Открыть учебник <ArrowRight size={18} aria-hidden="true" />
          </a>
          <p className="hero-footnote">
            <Check size={17} aria-hidden="true" /> Правило → пример → практика →
            разбор
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
          <h2>Ваши сохранённые работы и результаты</h2>
          <p>
            Продолжайте черновики и повторяйте задания по истории этого
            браузера.
          </p>
        </div>
        <LinkButton to="/progress/" secondary>
          Мой прогресс
        </LinkButton>
      </section>
    </>
  );
}
