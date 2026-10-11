import { use, useState } from "react";
import { loadActivities } from "./materials";
import type { ActivitySituation, InteractiveActivity } from "./model";
import { Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { href } from "../routes";
import { wordCount } from "./engine";
import { ogeCatalog } from "./catalog";

export function normalizeActivity(answer: string) {
  return answer
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/gu, "е")
    .replace(/\s+/gu, " ");
}
export function checkActivity(
  situation: ActivitySituation,
  answers: Record<string, string>,
) {
  return situation.fields
    .filter((f) => f.expected.length)
    .map((field) => ({
      field,
      correct: field.expected.some(
        (expected) =>
          normalizeActivity(expected) ===
          normalizeActivity(answers[field.id] ?? ""),
      ),
    }));
}
export function GamesCatalog() {
  const activities = ogeCatalog.activities;
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "ОГЭ", path: "/oge/" },
          { label: "Тематические тренажёры" },
        ]}
      />
      <PageHeading
        eyebrow="ДУМАТЬ И ДЕЙСТВОВАТЬ"
        title="Тематические тренажёры"
        text="Выделяйте, исправляйте, преобразуйте и сопоставляйте. Каждая механика содержит пять разных ситуаций с объяснением и возможностью исправления."
      />
      <div className="topic-grid">
        {activities.map((a) => (
          <article className="question-card" key={a.id}>
            <h2>{a.title}</h2>
            <p>{a.description}</p>
            <p>{a.situationCount} ситуаций</p>
            <LinkButton to={`/oge/games/${a.id}/`}>Открыть тренажёр</LinkButton>
          </article>
        ))}
      </div>
    </>
  );
}
function toggled(value: string, index: number) {
  const values = value ? value.split(",") : [];
  return (
    values.includes(String(index))
      ? values.filter((v) => v !== String(index))
      : [...values, String(index)]
  )
    .sort((a, b) => Number(a) - Number(b))
    .join(",");
}
export function GamePage({ id }: { id: string }) {
  const activity = use(loadActivities()).find((a) => a.id === id);
  if (!activity)
    return (
      <p>
        Тренажёр не найден. <a href={href("/oge/games/")}>Все тренажёры</a>
      </p>
    );
  return <ActivityPlayer key={id} activity={activity} />;
}
function ActivityPlayer({ activity }: { activity: InteractiveActivity }) {
  const [index, setIndex] = useState(0),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [checked, setChecked] = useState(false),
    [role, setRole] = useState("subject"),
    [saveError, setSaveError] = useState("");
  const situation = activity.situations[index],
    results = checkActivity(situation, answers),
    correct = results.every((r) => r.correct);
  const change = (id: string, value: string) => {
    setAnswers((a) => ({ ...a, [id]: value }));
    setChecked(false);
  };
  function chooseWord(n: number) {
    const other = role === "subject" ? "predicate" : "subject";
    setAnswers((a) => ({
      ...a,
      [role]: toggled(a[role] ?? "", n),
      [other]: (a[other] ?? "")
        .split(",")
        .filter((v) => v !== String(n))
        .join(","),
    }));
    setChecked(false);
  }
  const reset = () => {
    setAnswers({});
    setChecked(false);
    setSaveError("");
  };
  const expectedLabel = (fieldId: string, values: string[]) =>
    values
      .map((value) =>
        activity.kind === "foundation" ||
        (activity.kind === "compression" && fieldId === "essential")
          ? value
            ? value
                .split(",")
                .map((n) => situation.tokens![Number(n) - 1])
                .join(" ")
            : "подлежащее отсутствует"
          : activity.kind === "correction" && fieldId === "position"
            ? situation.tokens![Number(value) - 1]
            : value || "знак не нужен",
      )
      .join(" / ");
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "ОГЭ", path: "/oge/" },
          { label: "Тренажёры", path: "/oge/games/" },
          { label: activity.title },
        ]}
      />
      <PageHeading
        eyebrow="ИНТЕРАКТИВНАЯ ПРАКТИКА"
        title={activity.title}
        text={activity.description}
      />
      <p>
        Ситуация {index + 1} из {activity.situations.length} · {situation.title}
      </p>
      <article className="interactive-card oge-game">
        <h2>{situation.title}</h2>
        <p>{situation.instruction}</p>
        {activity.kind === "foundation" ? (
          <>
            <div className="segmented" role="group" aria-label="Что выделяем">
              <button
                aria-pressed={role === "subject"}
                onClick={() => setRole("subject")}
              >
                Подлежащее
              </button>
              <button
                aria-pressed={role === "predicate"}
                onClick={() => setRole("predicate")}
              >
                Сказуемое
              </button>
            </div>
            <p>
              Нажимайте слова для выбранной роли. Для предложения без
              подлежащего оставьте роль «Подлежащее» пустой.
            </p>
            <div className="word-buttons">
              {situation.tokens!.map((token, n) => (
                <button
                  key={n}
                  aria-label={`${token}: ${(answers.subject ?? "").split(",").includes(String(n + 1)) ? "подлежащее" : (answers.predicate ?? "").split(",").includes(String(n + 1)) ? "сказуемое" : "не выделено"}`}
                  data-role={
                    (answers.subject ?? "").split(",").includes(String(n + 1))
                      ? "subject"
                      : (answers.predicate ?? "")
                            .split(",")
                            .includes(String(n + 1))
                        ? "predicate"
                        : undefined
                  }
                  aria-pressed={(answers[role] ?? "")
                    .split(",")
                    .includes(String(n + 1))}
                  onClick={() => chooseWord(n + 1)}
                >
                  {token}
                </button>
              ))}
            </div>
          </>
        ) : activity.kind === "punctuation" ? (
          <div className="oge-punctuation">
            {situation.tokens!.map((token, n) => (
              <span key={n}>
                <span>{token}</span>
                {n < situation.tokens!.length - 1 && (
                  <label>
                    <span className="sr-only">Знак после «{token}»</span>
                    <select
                      aria-label={`Знак после «${token}»`}
                      value={answers[`slot-${n + 1}`] ?? ""}
                      onChange={(e) => change(`slot-${n + 1}`, e.target.value)}
                    >
                      <option value="">∅</option>
                      <option value=",">,</option>
                      <option value="—">—</option>
                      <option value=":">:</option>
                    </select>
                  </label>
                )}
              </span>
            ))}
          </div>
        ) : activity.kind === "correction" ? (
          <>
            <p>Найдите ошибочную форму:</p>
            <div className="word-buttons">
              {situation.tokens!.map((token, n) => (
                <button
                  key={n}
                  aria-pressed={answers.position === String(n + 1)}
                  onClick={() => change("position", String(n + 1))}
                >
                  {token}
                </button>
              ))}
            </div>
            <label>
              Исправленная форма
              <input
                value={answers.replacement ?? ""}
                onChange={(e) => change("replacement", e.target.value)}
                spellCheck={false}
              />
            </label>
          </>
        ) : activity.kind === "compression" ? (
          <>
            <p>Выделите предложения с основной информацией:</p>
            <div className="oge-compression">
              {situation.tokens!.map((token, n) => (
                <button
                  key={n}
                  aria-pressed={(answers.essential ?? "")
                    .split(",")
                    .includes(String(n + 1))}
                  onClick={() =>
                    change("essential", toggled(answers.essential ?? "", n + 1))
                  }
                >
                  {token}
                </button>
              ))}
            </div>
            <label>
              Ваше сжатие
              <textarea
                value={answers.draft ?? ""}
                rows={5}
                onChange={(e) => change("draft", e.target.value)}
              />
            </label>
            <p>
              {wordCount(answers.draft ?? "")} слов. Свободный пересказ
              сравнивается с образцом вручную.
            </p>
          </>
        ) : (
          <>
            <p className="lab-sentence oge-multiline">{situation.text}</p>
            {situation.fields.map((field, n) => (
              <label key={field.id}>
                {field.label}
                {field.options ? (
                  <select
                    disabled={
                      activity.kind === "spelling" &&
                      n > 0 &&
                      !answers[situation.fields[n - 1].id]
                    }
                    value={answers[field.id] ?? ""}
                    onChange={(e) => change(field.id, e.target.value)}
                  >
                    <option value="">Выберите</option>
                    {field.options.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={answers[field.id] ?? ""}
                    onChange={(e) => change(field.id, e.target.value)}
                    spellCheck={false}
                  />
                )}
              </label>
            ))}
          </>
        )}
        <div className="inline-actions">
          <button
            className="button"
            onClick={() => {
              setChecked(true);
              const record = {
                id: crypto.randomUUID(),
                activityId: activity.id,
                revision: 1,
                situationId: situation.id,
                createdAt: new Date().toISOString(),
                answers,
                correct,
              };
              try {
                const raw = JSON.parse(
                  window.localStorage.getItem("polina-oge-games-v1") ?? "[]",
                );
                const previous = Array.isArray(raw) ? raw : [];
                window.localStorage.setItem(
                  "polina-oge-games-v1",
                  JSON.stringify([...previous, record].slice(-500)),
                );
                setSaveError("");
              } catch {
                setSaveError(
                  "Результат виден сейчас, но браузер не сохранил историю тренажёра.",
                );
              }
            }}
          >
            Проверить действие
          </button>
          <button className="button secondary" onClick={reset}>
            Начать заново
          </button>
        </div>
        {checked && (
          <section
            className={`feedback ${correct ? "correct" : "incorrect"}`}
            aria-live="polite"
          >
            <h3>
              {correct
                ? "Действие выполнено верно"
                : "Исправьте выделение или ответ"}
            </h3>
            <ul>
              {results.map(({ field, correct }) => (
                <li key={field.id}>
                  {field.label}:{" "}
                  {correct
                    ? "верно"
                    : `ожидается ${expectedLabel(field.id, field.expected)}`}
                </li>
              ))}
            </ul>
            <p>{situation.explanation}</p>
            <ul>
              {situation.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
            {activity.kind === "compression" && (
              <p>
                Проверено выделение основной информации. Смысл и качество
                свободного сжатия автоматически не оценены.
              </p>
            )}
            <p>Вы можете исправить ответ и проверить снова.</p>
          </section>
        )}
        {saveError && <p role="status">{saveError}</p>}
      </article>
      <div className="inline-actions">
        <button
          className="button secondary"
          disabled={index === 0}
          onClick={() => {
            setIndex(index - 1);
            reset();
          }}
        >
          Предыдущая ситуация
        </button>
        <button
          className="button"
          disabled={index === activity.situations.length - 1}
          onClick={() => {
            setIndex(index + 1);
            reset();
          }}
        >
          Следующая ситуация
        </button>
        <LinkButton to={`/theory/${activity.topicId}/?exam=OGE`} secondary>
          Правило этой темы
        </LinkButton>
      </div>
      {index === activity.situations.length - 1 && checked && (
        <p>
          Вы дошли до последней ситуации. Повторите трудный пример или перейдите
          к заданиям темы.
        </p>
      )}
    </>
  );
}
