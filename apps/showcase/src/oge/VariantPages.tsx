import { LoadRecovery } from "../components/LoadRecovery";
import { use, useState } from "react";
import { Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { loadOriginals, loadFixedVariant } from "./materials";
import { generateVariantMetadata, sessionFromVariant } from "./engine";
import { listSessionSummaries } from "./storage";
import { saveSessionDurably, listSessionSummariesDurably } from "./repository";
import { href } from "../routes";
import { historyIds, TrainingLaunch } from "./BankPage";
import type { LocalAttempt } from "../progress";
import { loadExercises } from "../content/load";
import { exerciseIndex, topics } from "../content/catalog";
import { ogeCatalog } from "./catalog";
import {
  restoreGenerationCode,
  generationCodeMaxBytes,
} from "./generation-code";

export function VariantCatalog() {
  const data = ogeCatalog;
  let sessions: ReturnType<typeof listSessionSummaries> = [];
  try {
    sessions = listSessionSummaries(window.localStorage);
  } catch {}
  return (
    <>
      <Breadcrumbs
        items={[{ label: "ОГЭ", path: "/oge/" }, { label: "Готовые варианты" }]}
      />
      <PageHeading
        illustration="27-book-bookmark"
        eyebrow="ПОСТОЯННЫЕ КОМПЛЕКТЫ"
        title="Готовые учебные варианты ОГЭ"
        text="Каждый номер имеет фиксированный состав. Полные работы включают аудиоизложение, задания 2–12 и выбор сочинения 13.1, 13.2 или 13.3."
      />
      <p className="editorial-note">
        Оригинальные учебные материалы по проекту ФИПИ-2027. Озвучка
        синтезирована; это учебные варианты, а не официальные КИМ. Ответы и
        разборы проверены редакцией, утверждение Полиной ожидается.
      </p>
      <div className="topic-grid">
        {data.variants.map((v) => (
          <article className="question-card" key={v.id}>
            <h2>{v.title}</h2>
            <p>
              {v.kind === "full"
                ? "Полный учебный вариант · 13 заданий"
                : "Тестовая часть · 11 заданий"}{" "}
              · ОГЭ-2027
            </p>
            <p>
              {sessions.find((s) => s.originVariantId === v.id)?.completedAt
                ? "Есть завершённая попытка"
                : sessions.some((s) => s.originVariantId === v.id)
                  ? "Есть сохранённый черновик"
                  : "Ещё не начат"}
            </p>
            <LinkButton to={`/oge/variants/${v.number}/`}>
              Открыть и начать
            </LinkButton>
          </article>
        ))}
      </div>
    </>
  );
}
export function FixedVariantPage({ number }: { number: number }) {
  const data = use(loadFixedVariant(number)),
    variant = data.variants.find((v) => v.number === number);
  const [mode, setMode] = useState<"learn" | "control">("control"),
    [error, setError] = useState("");
  if (!variant)
    return (
      <p>
        Такой опубликованный вариант не найден.{" "}
        <a href={href("/oge/variants/")}>Каталог вариантов</a>
      </p>
    );
  let drafts: ReturnType<typeof listSessionSummaries> = [];
  try {
    drafts = listSessionSummaries(window.localStorage).filter(
      (s) => s.originVariantId === variant.id && !s.completedAt,
    );
  } catch {}
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "ОГЭ", path: "/oge/" },
          { label: "Варианты", path: "/oge/variants/" },
          { label: `Вариант № ${number}` },
        ]}
      />
      <PageHeading
        illustration="27-book-bookmark"
        eyebrow="ФИКСИРОВАННЫЙ СОСТАВ · ПРОЕКТ 2027"
        title={variant.title}
        text="Изложение с оригинальным учебным аудио, согласованная тестовая часть и сочинение. В контрольном режиме разбор раскрывается после завершения."
      />
      <div className="oge-launch">
        <label>
          Режим
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as "learn" | "control")}
          >
            <option value="control">Контрольный · 235 минут</option>
            <option value="learn">Учебный · без ограничения времени</option>
          </select>
        </label>
        <button
          className="button"
          onClick={async () => {
            try {
              const session = sessionFromVariant(variant, data, mode);
              await saveSessionDurably(session);
              window.location.assign(
                href(`/oge/practice/session/?id=${session.id}`),
              );
            } catch (error) {
              setError(
                error instanceof Error
                  ? error.message
                  : "Работа не сформирована",
              );
            }
          }}
        >
          Начать новую попытку
        </button>
        {drafts.map((s) => (
          <LinkButton
            key={s.id}
            to={`/oge/practice/session/?id=${s.id}`}
            secondary
          >
            Продолжить черновик от{" "}
            {new Date(s.startedAt).toLocaleDateString("ru")}
          </LinkButton>
        ))}
        {error && <p role="alert">{error}</p>}
      </div>
      <section className="home-section">
        <h2>Содержание варианта</h2>
        <ol className="oge-variant-outline">
          <li>
            № 1 · Сжатое изложение:{" "}
            {
              data.writing.find(
                (w) => variant.writingIds.includes(w.id) && w.line === 1,
              )?.title
            }
          </li>
          {variant.assignments.map((ref) => {
            const e = data.exercises.find((e) => e.id === ref.id)!;
            return (
              <li key={ref.id}>
                № {e.taskLine} · {e.title} · {e.topicTitle}
              </li>
            );
          })}
          <li>№ 13 · Сочинение по общему тексту · три вопроса на выбор</li>
        </ol>
      </section>
      <p>
        Состав и версии заданий фиксированы. Развёрнутые ответы и общая
        грамотность требуют экспертной оценки.
      </p>
    </>
  );
}
export function Generator({
  attempts,
  compact = false,
}: {
  attempts: LocalAttempt[];
  compact?: boolean;
}) {
  const [kind, setKind] = useState(() =>
      new URLSearchParams(window.location.search).get("mode") === "thematic"
        ? "thematic"
        : "full",
    ),
    [mode, setMode] = useState<"learn" | "control">("control"),
    [only, setOnly] = useState(""),
    [topic, setTopic] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <section className="oge-launch">
      <h2>{compact ? "Генератор" : "Сформировать свою работу"}</h2>
      <div className="catalog-controls">
        <label>
          Тип работы
          <select
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setError("");
            }}
          >
            <option value="full">Полный учебный вариант</option>
            <option value="test">Тестовая часть № 2–12</option>
            <option value="thematic">Тематическая подборка</option>
          </select>
        </label>
        {kind !== "thematic" && (
          <>
            <label>
              Режим
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as "learn" | "control")}
              >
                <option value="control">Контрольный</option>
                <option value="learn">Учебный</option>
              </select>
            </label>
            <label>
              Отбор
              <select value={only} onChange={(e) => setOnly(e.target.value)}>
                <option value="">Весь учебный банк</option>
                <option value="new">Исключить выполненные</option>
                <option value="errors">Только неисправленные ошибки</option>
              </select>
            </label>
            <button
              className="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const originals = await loadOriginals(),
                    history = historyIds(
                      attempts,
                      await listSessionSummariesDurably(),
                    ),
                    seed = crypto.randomUUID();
                  const variant = generateVariantMetadata(
                    { ...originals, exercises: exerciseIndex },
                    kind as "full" | "test",
                    seed,
                    {
                      only: only as "new" | "errors",
                      seenIds: history.seen,
                      errorIds: history.errors,
                      seenWritingIds: history.seenWritingIds,
                      seenTextIds: history.seenTextIds,
                      seenAudioIds: history.seenAudioIds,
                    },
                  );
                  const conditions = await loadExercises(
                    variant.assignments.map((ref) => ref.id),
                  );
                  const session = sessionFromVariant(
                    variant,
                    { ...originals, exercises: conditions },
                    mode,
                    true,
                  );
                  await saveSessionDurably(session);
                  window.location.assign(
                    href(`/oge/practice/session/?id=${session.id}`),
                  );
                } catch (error) {
                  setError(
                    error instanceof Error
                      ? error.message
                      : "Не удалось сформировать работу.",
                  );
                  setBusy(false);
                }
              }}
            >
              {busy ? "Подбираем задания…" : "Сформировать вариант"}
            </button>
          </>
        )}
        {kind === "thematic" && (
          <label>
            Тема
            <select value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">Смешанная тренировка</option>
              {topics
                .filter(
                  (t) =>
                    t.examTags.includes("OGE") &&
                    t.status === "published" &&
                    !["izlozhenie", "sochinenie"].includes(t.id),
                )
                .map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      {kind === "thematic" && (
        <TrainingLaunch
          bank={exerciseIndex.filter(
            (e) =>
              e.exam === "OGE" && e.taskLine && (!topic || e.topicId === topic),
          )}
          attempts={attempts}
          title={
            topic
              ? "Тренировка: " + topics.find((t) => t.id === topic)?.title
              : "Смешанная тренировка ОГЭ"
          }
        />
      )}
      <p>
        ОГЭ-2027 · проект модели. Общие тексты для № 2–3 и № 10–13 подбираются
        совместно. После сохранения состав этой работы не меняется.
      </p>
      {error && <LoadRecovery message={error} />}
    </section>
  );
}
export function GeneratorPage({ attempts }: { attempts: LocalAttempt[] }) {
  return (
    <>
      <Breadcrumbs
        items={[{ label: "ОГЭ", path: "/oge/" }, { label: "Генератор" }]}
      />
      <PageHeading
        illustration="25-time-book"
        eyebrow="РАБОТА ИЗ ПРОВЕРЕННОГО БАНКА"
        title="Генератор варианта ОГЭ"
        text="Создайте полный учебный вариант, тестовую часть или подборку навыков. Сохранённую работу можно открыть в локальных результатах."
      />
      <Generator attempts={attempts} />
      <RestoreGenerationCode />
    </>
  );
}

function RestoreGenerationCode() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <details className="oge-launch">
      <summary>Восстановить состав по коду</summary>
      <p>
        Загрузите код состава, скачанный из результатов работы. Будет создана
        новая попытка с теми же условиями. Для старой редакции нужен сохранённый
        снимок в этом браузере; на другом устройстве используйте полную
        резервную копию.
      </p>
      <label>
        Файл кода состава
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setBusy(true);
            setError("");
            try {
              if (file.size > generationCodeMaxBytes)
                throw Error("Код состава слишком большой: максимум 1 МБ.");
              const session = await restoreGenerationCode(await file.text());
              await saveSessionDurably(session);
              window.location.assign(
                href("/oge/practice/session/?id=" + session.id),
              );
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Не удалось восстановить состав работы.",
              );
              setBusy(false);
            }
          }}
        />
      </label>
      {busy && <p role="status">Восстанавливаем состав…</p>}
      {error && <LoadRecovery message={error} />}
    </details>
  );
}
