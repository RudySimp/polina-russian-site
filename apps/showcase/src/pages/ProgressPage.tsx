import { useState } from "react";
import { confidence, localMetrics, type LocalAttempt } from "../progress";
import { exerciseIndex as exercises } from "../content/catalog";
import { recommendations } from "../lib/recommendations";
import { examName } from "../lib/search";
import {
  Breadcrumbs,
  EmptyState,
  ExerciseCard,
  LinkButton,
  PageHeading,
} from "../components/ui";
import { href } from "../routes";

export function ProgressPage({
  attempts,
  clear,
}: {
  attempts: LocalAttempt[];
  clear: () => void;
}) {
  const [exam, setExam] = useState(() =>
    new URLSearchParams(window.location.search).get("exam") === "EGE"
      ? "EGE"
      : "OGE",
  );
  const [confirm, setConfirm] = useState(false);
  const filtered = attempts.filter(
    (attempt) =>
      exercises.find((exercise) => exercise.id === attempt.exerciseId)?.exam ===
      exam,
  );
  const correct = filtered.filter(
    (attempt) => attempt.results[0].status === "correct",
  ).length;
  const independent = new Set(filtered.map((attempt) => attempt.exerciseId))
    .size;
  const metrics = localMetrics(filtered);
  const suggested = recommendations(attempts, exam);
  return (
    <>
      <Breadcrumbs items={[{ label: "Мой прогресс" }]} />
      <PageHeading
        eyebrow="САМОСТОЯТЕЛЬНАЯ ПРАКТИКА"
        title="Маленькие шаги становятся заметны"
        text="Фактические результаты тренировок в этом браузере. Они помогают выбрать повторение, но не заменяют оценку преподавателя."
      />
      <div
        className="segmented"
        role="group"
        aria-label="Направление прогресса"
      >
        {["OGE", "EGE"].map((item) => (
          <button
            key={item}
            aria-pressed={exam === item}
            onClick={() => {
              setExam(item);
              window.history.replaceState(
                null,
                "",
                href(`/progress/?exam=${item}`),
              );
            }}
          >
            {examName(item)}
          </button>
        ))}
      </div>
      <p className="storage-note">
        История хранится локально, не синхронизируется и не отправляется Полине.
        Очистка данных браузера удалит её. Сохраняются последние 1 000 попыток.
      </p>
      {!filtered.length ? (
        <EmptyState
          title="Здесь появятся ваши первые результаты"
          text={`Начните практику ${examName(exam)}. Форматные ошибки не считаются ошибками по предметному навыку.`}
        >
          <LinkButton to={exam === "OGE" ? "/oge/bank/" : `/practice/?exam=${exam}`}>
            Начать практику
          </LinkButton>
        </EmptyState>
      ) : (
        <>
          <div className="stats-grid">
            <div>
              <strong>{filtered.length}</strong>
              <span>выполненных попыток</span>
            </div>
            <div>
              <strong>{independent}</strong>
              <span>разных заданий</span>
            </div>
            <div>
              <strong>{correct}</strong>
              <span>верных ответов</span>
            </div>
          </div>
          <p>
            {correct} верных из {filtered.length} попыток · {examName(exam)}.
          </p>
          <section className="home-section">
            <h2>Результаты по навыкам</h2>
            <div className="metrics-list">
              {metrics.map((metric) => (
                <article key={metric.skillId}>
                  <div>
                    <h3>{metric.title}</h3>
                    <p>
                      {metric.correct} верных из {metric.total} попыток ·{" "}
                      {metric.independent} разных заданий
                    </p>
                    <p className="muted">{confidence(metric.independent)}</p>
                  </div>
                  <LinkButton
                    to={`/theory/${metric.slug}/?exam=${exam}`}
                    secondary
                  >
                    Повторить правило
                  </LinkButton>
                </article>
              ))}
            </div>
          </section>
          <section className="home-section">
            <h2>Что можно повторить</h2>
            <p>
              Подборка учитывает последние ответы на задания: выбираем ещё не
              выполненное упражнение того же экзамена и навыка, где были ошибки.
            </p>
            {suggested.length ? (
              <div className="topic-grid">
                {suggested.map((exercise) => (
                  <ExerciseCard key={exercise.id} exercise={exercise} />
                ))}
              </div>
            ) : (
              <p className="editorial-note">
                Новых заданий по навыкам с последними ошибками сейчас нет. Можно
                повторить правило или выбрать другую тему.
              </p>
            )}
          </section>
          <section className="home-section">
            <h2>Последние попытки</h2>
            <ol className="attempt-history">
              {filtered
                .slice(-12)
                .reverse()
                .map((attempt) => {
                  const exercise = exercises.find(
                    (exercise) => exercise.id === attempt.exerciseId,
                  )!;
                  return (
                    <li key={attempt.id}>
                      <div>
                        <a href={href(`/practice/${exercise.slug}/`)}>
                          {exercise.title}
                        </a>
                        <p>
                          {exercise.topicTitle} ·{" "}
                          {attempt.repeat ? "повторение" : "первая тренировка"}
                        </p>
                      </div>
                      <span>
                        {attempt.results[0].status === "correct"
                          ? "Верно"
                          : "Есть ошибка"}
                      </span>
                      <time dateTime={attempt.createdAt}>
                        {new Date(attempt.createdAt).toLocaleDateString(
                          "ru-RU",
                        )}
                      </time>
                    </li>
                  );
                })}
            </ol>
          </section>
        </>
      )}
      {attempts.length > 0 && (
        <div className="clear-history">
          {confirm ? (
            <>
              <p>
                Удалить все результаты ОГЭ и ЕГЭ в этом браузере? Восстановить
                их будет нельзя.
              </p>
              <div className="inline-actions">
                <button
                  className="button secondary"
                  onClick={() => {
                    clear();
                    setConfirm(false);
                  }}
                >
                  Удалить историю
                </button>
                <button
                  className="text-button"
                  onClick={() => setConfirm(false)}
                >
                  Отмена
                </button>
              </div>
            </>
          ) : (
            <button className="text-button" onClick={() => setConfirm(true)}>
              Очистить локальную историю
            </button>
          )}
        </div>
      )}
    </>
  );
}
