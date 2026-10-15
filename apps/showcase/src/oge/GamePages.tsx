import { nextGameControl } from "./game-control";
import { use, useState } from "react";
import { loadActivities } from "./materials";
import type { InteractiveActivity } from "./model";
import { Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { href } from "../routes";
import { wordCount } from "./engine";
import { ogeCatalog } from "./catalog";
import { checkActivity } from "./game-check";
export { checkActivity, normalizeActivity } from "./game-check";
import {
  makeGameDraft,
  readGameDraft,
  saveGameDraft,
  readGameRecords,
  saveGameRecord,
  gameOutcome,
  type GameDraft,
  type GameRecord,
} from "./game-storage";
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
        illustration="10-learning-stages"
        eyebrow="ДУМАТЬ И ДЕЙСТВОВАТЬ"
        title="Тематические тренажёры"
        text="Выделяйте, исправляйте, преобразуйте и сопоставляйте. Сохраняйте начатое действие и переходите от разбора ошибки к новому примеру."
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
  function initialIndex() {
    try {
      const key = localStorage.getItem(
        `polina-oge-game-position-v2:${activity.id}`,
      );
      return Math.max(
        0,
        activity.situations.findIndex(
          (situation) => `${situation.id}:${situation.revision ?? 1}` === key,
        ),
      );
    } catch {
      return 0;
    }
  }
  function loaded(index: number) {
    const situation = activity.situations[index];
    try {
      return (
        readGameDraft(window.localStorage, activity.id, situation) ??
        makeGameDraft(activity, situation)
      );
    } catch {
      return makeGameDraft(activity, situation);
    }
  }
  const [index, setIndex] = useState(initialIndex),
    [state, setState] = useState(() => loaded(initialIndex())),
    [saveError, setSaveError] = useState(""),
    [pendingRecord, setPendingRecord] = useState<GameRecord>();
  const { answers, checked, role } = state;
  const situation = activity.situations[index],
    results = checkActivity(situation, answers),
    outcome = gameOutcome(activity.kind, situation, answers),
    correct = outcome.correct;
  function persist(next: GameDraft) {
    next = { ...next, updatedAt: new Date().toISOString() };
    setState(next);
    try {
      saveGameDraft(window.localStorage, next);
      if (!pendingRecord) setSaveError("");
      return true;
    } catch {
      setSaveError(
        "Текущий ввод остаётся на странице, но браузер не сохранил его. Повторите запись или скачайте текущую попытку перед уходом.",
      );
      return false;
    }
  }
  const setRole = (role: GameDraft["role"]) => persist({ ...state, role });
  const change = (id: string, value: string) => {
    const next = { ...answers, [id]: value };
    if (activity.kind === "spelling") {
      const index = situation.fields.findIndex((field) => field.id === id);
      for (const field of situation.fields.slice(index + 1))
        delete next[field.id];
    }
    persist({ ...state, answers: next, checked: false });
  };
  function chooseWord(n: number) {
    const other = role === "subject" ? "predicate" : "subject";
    persist({
      ...state,
      checked: false,
      answers: {
        ...answers,
        [role]: toggled(answers[role] ?? "", n),
        [other]: (answers[other] ?? "")
          .split(",")
          .filter((v) => v !== String(n))
          .join(","),
      },
    });
  }
  const reset = () => {
    persist({
      ...state,
      answers: {},
      checked: false,
      hintUsed: state.hintUsed || state.checks > 0,
    });
  };
  function jump(next: number) {
    setIndex(next);
    const draft = loaded(next);
    setState(draft);
    try {
      saveGameDraft(window.localStorage, draft);
      setSaveError("");
    } catch {
      setSaveError(
        "Браузер не сохранил новую позицию. Выполненные редакции не удалены.",
      );
    }
  }
  function beginControl() {
    if (pendingRecord) return;
    const history = readGameRecords(window.localStorage);
    const selected = nextGameControl(
      activity,
      situation,
      history.records,
      history.historic,
      (candidate) => readGameDraft(window.localStorage, activity.id, candidate),
    );
    if (!selected) {
      setSaveError(
        "Новых случаев этой механики больше нет. Повторение доступно, но не считается независимой проверкой.",
      );
      return;
    }
    const next = {
      ...makeGameDraft(activity, selected.situation),
      mode: "control" as const,
      controlFrom: {
        situationId: situation.id,
        revision: situation.revision ?? 1,
        matchedSkillIds: selected.matchedSkillIds,
      },
    };
    setIndex(selected.index);
    persist(next);
  }
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
            : fieldId === "subject"
              ? "подлежащее отсутствует"
              : "ничего не выделено"
          : activity.kind === "correction" && fieldId === "position"
            ? situation.tokens![Number(value) - 1]
            : value || "знак не нужен",
      )
      .join(" / ");
  function actionReason(fieldId: string, expected: string) {
    if (activity.kind === "foundation") {
      const selected = (answers[fieldId] ?? "").split(",").filter(Boolean),
        required = expected.split(",").filter(Boolean);
      const words = (values: string[]) =>
        values.map((value) => situation.tokens?.[Number(value) - 1]).join(" ");
      return `Не выделено: ${words(required.filter((value) => !selected.includes(value))) || "нет"}. Лишнее выделение: ${words(selected.filter((value) => !required.includes(value))) || "нет"}.`;
    }
    if (activity.kind === "punctuation")
      return expected === ""
        ? "Поставлен лишний знак."
        : !answers[fieldId]
          ? "Пропущен необходимый знак."
          : "Выбран знак, который не соответствует связи частей или конструкции.";
    return "Сопоставьте своё действие с указанным условием правила.";
  }
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
      {state.mode === "control" && (
        <p role="status" className="control-stage">
          Самостоятельная контрольная операция на новом случае. До отправки
          ответа подсказка закрыта.
          {state.controlFrom?.matchedSkillIds.length
            ? " Сохранён общий поднавык исходного случая."
            : " Выбран другой случай этой механики; совпадение узкого поднавыка не подтверждено."}
          {activity.kind === "compression" &&
            " Автоматически проверяется только выбор информации; собственное сжатие проверяет человек."}
        </p>
      )}
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
                      state.mode !== "control" &&
                      n > 0 &&
                      !results.find(
                        (result) =>
                          result.field.id === situation.fields[n - 1].id,
                      )?.correct
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
                    disabled={
                      activity.kind === "spelling" &&
                      state.mode !== "control" &&
                      n > 0 &&
                      !results.find(
                        (result) =>
                          result.field.id === situation.fields[n - 1].id,
                      )?.correct
                    }
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
            disabled={!!pendingRecord}
            onClick={() => {
              const draftSaved = persist({
                ...state,
                checked: true,
                checks: state.checks + 1,
              });
              const history = readGameRecords(window.localStorage);
              const seen =
                history.records.some(
                  (record) =>
                    record.activityId === activity.id &&
                    record.situationId === situation.id &&
                    record.revision === (situation.revision ?? 1),
                ) ||
                history.historic.some(
                  (record) =>
                    record.activityId === activity.id &&
                    record.situationId === situation.id,
                );
              const record = {
                schemaVersion: 2 as const,
                id: crypto.randomUUID(),
                activityId: activity.id,
                revision: situation.revision ?? 1,
                situationId: situation.id,
                createdAt: new Date().toISOString(),
                answers,
                mode: state.mode,
                controlFrom: state.controlFrom,
                snapshot: {
                  kind: activity.kind,
                  title: activity.title,
                  topicId: activity.topicId,
                  skillId: activity.skillId,
                  situation: structuredClone(situation),
                },
                firstIndependent:
                  !seen && state.checks === 0 && !state.hintUsed,
                assisted: seen || state.checks > 0 || state.hintUsed,
              };
              try {
                saveGameRecord(window.localStorage, record);
                setPendingRecord(undefined);
                if (draftSaved) setSaveError("");
              } catch {
                setPendingRecord(record);
                setSaveError(
                  "Результат виден сейчас, но браузер не сохранил историю тренажёра. Повторите запись действия.",
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
              {activity.kind === "compression"
                ? outcome.informationCorrect
                  ? "Основная информация выбрана; содержание текста проверяет человек"
                  : "Исправьте выбор основной информации"
                : correct
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
                  {!correct && (
                    <>
                      . Ваше действие:{" "}
                      {expectedLabel(field.id, [answers[field.id] ?? ""]) ||
                        "не заполнено"}
                      . {actionReason(field.id, field.expected[0])}{" "}
                      {field.explanation ?? situation.explanation}
                    </>
                  )}
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
                {outcome.writingDraft
                  ? "Черновик написан."
                  : "Текст ещё не написан: заполните поле собственного сжатия для завершения этапа письма."}{" "}
                Проверено только выделение основной информации. Смысл и качество
                свободного сжатия автоматически не оценены.
              </p>
            )}
            <p>
              {state.hintUsed || state.checks > 1
                ? "Исправление после разбора или подсказки: результат не считается самостоятельным переносом навыка."
                : "Первая попытка этого случая. Для проверки переноса решите другой пример."}
            </p>
            <p>Вы можете исправить ответ и проверить снова.</p>
          </section>
        )}
        {checked && (
          <button
            className="button"
            disabled={!!pendingRecord}
            onClick={beginControl}
          >
            Самостоятельный контроль на новом случае
          </button>
        )}
        {saveError && <p role="status">{saveError}</p>}
        {saveError && (
          <button
            className="button secondary"
            onClick={() => {
              const draftSaved = persist(state);
              if (pendingRecord) {
                try {
                  saveGameRecord(window.localStorage, pendingRecord);
                  setPendingRecord(undefined);
                  if (draftSaved) setSaveError("");
                } catch {
                  setSaveError(
                    "Браузер по-прежнему не сохранил историю. Текущая попытка доступна для скачивания.",
                  );
                }
              }
            }}
          >
            Повторить запись действия
          </button>
        )}
        {(state.mode !== "control" || checked) && (
          <details
            className="hint"
            onToggle={(event) => {
              if (event.currentTarget.open && !state.hintUsed)
                persist({ ...state, hintUsed: true });
            }}
          >
            <summary>Подсказка к действию</summary>
            <p>{situation.hint ?? situation.details[0]}</p>
          </details>
        )}
        <button
          className="button secondary"
          onClick={() => {
            const url = URL.createObjectURL(
              new Blob(
                [
                  JSON.stringify(
                    {
                      format: "polina-oge-game-draft",
                      version: 2,
                      snapshot: situation,
                      draft: state,
                      pendingRecord,
                    },
                    null,
                    2,
                  ),
                ],
                { type: "application/json;charset=utf-8" },
              ),
            );
            const link = document.createElement("a");
            link.href = url;
            link.download = `polina-game-${activity.id}-${situation.id}.json`;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Скачать текущую попытку
        </button>
      </article>
      <div className="inline-actions">
        <button
          className="button secondary"
          disabled={index === 0}
          onClick={() => {
            jump(index - 1);
          }}
        >
          Предыдущая ситуация
        </button>
        <button
          className="button"
          disabled={index === activity.situations.length - 1}
          onClick={() => {
            jump(index + 1);
          }}
        >
          Следующая ситуация
        </button>
        <LinkButton to={`/theory/${activity.topicId}/?exam=OGE`} secondary>
          Правило этой темы
        </LinkButton>
        <button
          className="button secondary"
          onClick={() => {
            const unknown = activity.situations
              .map((candidate, index) => ({ candidate, index }))
              .filter(
                ({ candidate }) =>
                  !readGameDraft(window.localStorage, activity.id, candidate)
                    ?.checks && candidate.id !== situation.id,
              );
            const analogous =
              unknown.find(({ candidate }) =>
                candidate.skillIds?.some((skill) =>
                  situation.skillIds?.includes(skill),
                ),
              ) ?? unknown[0];
            if (analogous) jump(analogous.index);
            else
              setSaveError(
                "Новых случаев этой темы больше нет. Повторение прежнего примера доступно, но не считается независимой проверкой.",
              );
          }}
        >
          Новый пример этой темы
        </button>
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
