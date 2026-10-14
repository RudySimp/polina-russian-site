import { GenerationDetails } from "./GenerationDetails";
import { useEffect, useRef, useState } from "react";
import { AnswerControl } from "../components/AnswerControl";
import { Breadcrumbs, LinkButton, PageHeading } from "../components/ui";
import { href } from "../routes";
import { createAttempt, type LocalAttempt } from "../progress";
import {
  ExerciseFeedback,
  ExerciseStatement,
  SourcePassage,
} from "./ExercisePanel";
import {
  readSession,
  saveSession,
  sessionKeyPrefix,
  sessionStateKeyPrefix,
} from "./storage";
import {
  readSessionDurably,
  saveSessionDurably,
  sessionRevisions,
} from "./repository";
import { SessionDraft } from "./draft";
import { downloadBackup, sessionAnswerText } from "./backup";
import {
  gradeExercise,
  itemId,
  itemLine,
  remainingSeconds,
  resultsFor,
  wordCount,
} from "./engine";
import { specification } from "./specification";
import { WritingCriteria, LiteracyCriteria } from "./WritingReviewPanel";
import { literacyReviewId } from "./writing-rubric";
import { WritingGuide } from "./WritingGuide";
import type { PracticeSession, WritingAssignment } from "./model";

function initialWork(): PracticeSession | undefined {
  try {
    return readSession(
      window.localStorage,
      new URLSearchParams(window.location.search).get("id") ?? "",
    );
  } catch {
    return undefined;
  }
}
function SummaryAudio({
  session,
  writing,
  update,
}: {
  session: PracticeSession;
  writing: WritingAssignment;
  update: (patch: Partial<PracticeSession>) => void;
}) {
  const audio = useRef<HTMLAudioElement>(null),
    lastSaved = useRef(0);
  const [playing, setPlaying] = useState(false),
    [error, setError] = useState(""),
    [position, setPosition] = useState(
      () => session.audioPositions[writing.audioId ?? ""] ?? 0,
    ),
    [now, setNow] = useState(() => Date.now());
  const material = session.audio.find((a) => a.id === writing.audioId);
  const blocked =
    !!session.completedAt ||
    (session.mode === "control" && remainingSeconds(session, now) === 0);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const element = audio.current;
    return () => { element?.pause(); };
  }, []);
  useEffect(() => {
    if (blocked) audio.current?.pause();
  }, [blocked]);
  if (!material)
    return (
      <p role="alert">
        Аудиозапись отсутствует. Работа не может считаться полным вариантом.
      </p>
    );
  const completed = session.audioCompletedPlays[material.id] ?? 0,
    started = session.audioPlays[material.id] ?? 0;
  const waiting =
    session.mode === "control" && completed === 1
      ? Math.max(
          0,
          Math.ceil(
            (Date.parse(session.audioLastEndedAt[material.id] ?? "") +
              specification.writing.pauseMinutes * 60000 -
              now) /
              1000,
          ),
        )
      : 0;
  const limit = session.mode === "control" && completed >= 2;
  return (
    <section className="oge-audio">
      <h3>Аудиотекст изложения</h3>
      <p>
        {material.attribution}. Продолжительность:{" "}
        {Math.ceil(material.durationSeconds / 60)} мин.
      </p>
      <audio
        ref={audio}
        src={href(material.path)}
        controls={session.mode === "learn" && !blocked}
        preload="metadata"
        onLoadedMetadata={() => {
          if (audio.current)
            audio.current.currentTime = Math.min(
              session.audioPositions[material.id] ?? 0,
              audio.current.duration || material.durationSeconds,
            );
        }}
        onPlay={() => {
          if (blocked || limit || waiting > 0) {
            audio.current?.pause();
            return;
          }
          setPlaying(true);
          if (started === completed)
            update({
              audioPlays: { ...session.audioPlays, [material.id]: started + 1 },
            });
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={() => {
          const position = audio.current?.currentTime ?? 0;
          setPosition(position);
          if (Math.abs(position - lastSaved.current) >= 5) {
            lastSaved.current = position;
            update({
              audioPositions: {
                ...session.audioPositions,
                [material.id]: position,
              },
            });
          }
        }}
        onEnded={() => {
          setPlaying(false);
          lastSaved.current = 0;
          update({
            audioCompletedPlays: {
              ...session.audioCompletedPlays,
              [material.id]: completed + 1,
            },
            audioPositions: { ...session.audioPositions, [material.id]: 0 },
            audioLastEndedAt: {
              ...session.audioLastEndedAt,
              [material.id]: new Date().toISOString(),
            },
          });
        }}
        onError={() => {
          setError(
            "Не удалось открыть аудиозапись. Проверьте подключение и повторите воспроизведение.",
          );
          setPlaying(false);
        }}
      />
      <button
        className="button secondary"
        disabled={limit || waiting > 0 || blocked}
        onClick={async () => {
          setError("");
          if (!audio.current) return;
          if (playing) {
            audio.current.pause();
            setPlaying(false);
          } else {
            try {
              await audio.current.play();
              setPlaying(true);
            } catch {
              setError("Браузер не начал воспроизведение. Повторите нажатие.");
            }
          }
        }}
      >
        {playing
          ? "Пауза"
          : started > completed
            ? "Продолжить прослушивание"
            : "Слушать текст"}
      </button>
      {session.mode === "learn" && (
        <>
          <p>
            Позиция: {Math.floor(position / 60)}:
            {String(Math.floor(position % 60)).padStart(2, "0")} из{" "}
            {Math.floor(material.durationSeconds / 60)}:
            {String(Math.floor(material.durationSeconds % 60)).padStart(2, "0")}
            . Можно выбрать место на полосе аудиоплеера.
          </p>
          <button
            className="button secondary"
            disabled={blocked}
            onClick={async () => {
              if (!audio.current) return;
              audio.current.currentTime = Math.max(
                0,
                audio.current.currentTime - 10,
              );
              try {
                await audio.current.play();
              } catch {
                setError(
                  "Браузер не начал повтор фрагмента. Нажмите кнопку воспроизведения.",
                );
              }
            }}
          >
            Повторить последние 10 секунд
          </button>
        </>
      )}
      <p role="status">
        {session.mode === "control"
          ? `Завершено прослушиваний: ${completed} из 2. Между ними — пауза 5 минут.`
          : "Учебный режим: можно слушать повторно."}
        {waiting > 0 &&
          ` До второго прослушивания ${Math.floor(waiting / 60)}:${String(waiting % 60).padStart(2, "0")}.`}
      </p>
      {error && <p role="alert">{error}</p>}
      {(session.mode === "learn" || session.completedAt) && (
        <details>
          <summary>Текст и микротемы для разбора</summary>
          {material.transcript.split("\n\n").map((p, n) => (
            <p key={n}>{p}</p>
          ))}
          <ol>
            {writing.microtopics?.map((topic) => (
              <li key={topic}>{topic}</li>
            ))}
          </ol>
          <p>{writing.analysis}</p>
        </details>
      )}
    </section>
  );
}
export function SessionPage({
  saveAttempt,
}: {
  saveAttempt: (attempt: LocalAttempt) => void;
}) {
  const [session, setSession] = useState(initialWork),
    [saveError, setSaveError] = useState(""),
    [formatError, setFormatError] = useState(""),
    [confirm, setConfirm] = useState(false),
    [now, setNow] = useState(() => Date.now());
  const latest = useRef(session);
  const draft = useRef(session ? new SessionDraft(session) : undefined);
  const [copyMessage, setCopyMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadingWork, setLoadingWork] = useState(true);
  const [checkpoints, setCheckpoints] = useState<PracticeSession[]>([]);
  const finishRef = useRef<(timeout?: boolean) => void>(() => {});
  const [savedAt, setSavedAt] = useState(session?.updatedAt);
  const [remoteSession, setRemoteSession] = useState<PracticeSession>();
  useEffect(() => {
    let canceled = false;
    const id = new URLSearchParams(window.location.search).get("id") ?? "";
    void readSessionDurably(id).then((stored) => {
      if (canceled) return;
      if (stored) {
        if (draft.current) draft.current.receive(stored);
        else draft.current = new SessionDraft(stored);
        latest.current = draft.current.current;
        setSession(draft.current.current);
        setSaveError(draft.current.error);
        setSavedAt(draft.current.saved.updatedAt);
        setRemoteSession(draft.current.remote);
      }
      setLoadingWork(false);
    });
    return () => {
      canceled = true;
    };
  }, []);
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);
  useEffect(() => {
    const receive = async () => {
      const work = draft.current;
      if (!work) return;
      const remote = await readSessionDurably(work.current.id);
      if (!remote) return;
      work.receive(remote);
      latest.current = work.current;
      setSession(work.current);
      setSaveError(work.error);
      setSavedAt(work.saved.updatedAt);
      setRemoteSession(work.remote);
    };
    const listener = (event: StorageEvent) => {
      const id = draft.current?.current.id;
      if (
        id &&
        (event.key === sessionKeyPrefix + id ||
          event.key === sessionStateKeyPrefix + id)
      )
        void receive();
    };
    const channel =
      typeof BroadcastChannel === "undefined"
        ? undefined
        : new BroadcastChannel("polina-oge-work-changes");
    if (channel)
      channel.onmessage = (event) => {
        if (event.data === draft.current?.current.id) void receive();
      };
    window.addEventListener("storage", listener);
    return () => {
      window.removeEventListener("storage", listener);
      channel?.close();
    };
  }, []);
  useEffect(() => {
    function persist() {
      const work = draft.current;
      if (!work) return true;
      const saved = work.save((next, previous) =>
        saveSession(window.localStorage, next, previous),
      );
      setSaveError(work.error);
      setSavedAt(work.saved.updatedAt);
      setRemoteSession(work.remote);
      return saved;
    }
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!persist() || draft.current?.dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    const leaving = (event: MouseEvent) => {
      const link = (event.target as HTMLElement).closest?.("a[href]");
      if (!link || !draft.current?.dirty) return;
      const target = new URL(link.getAttribute("href")!, window.location.href);
      if (
        target.pathname === window.location.pathname &&
        target.search === window.location.search
      )
        return;
      if (
        !persist() &&
        !window.confirm(
          "Последние ответы не сохранены. Текст останется доступен только пока эта страница открыта. Покинуть работу?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") persist();
    };
    const interval = setInterval(() => {
      if (draft.current?.dirty && !draft.current.remote) {
        setSaving(true);
        void draft.current.saveAsync(saveSessionDurably).then(() => {
          setSaveError(draft.current?.error ?? "");
          setSavedAt(draft.current?.saved.updatedAt);
          setRemoteSession(draft.current?.remote);
          setSaving(false);
        });
      }
    }, 10000);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", leaving, true);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", leaving, true);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!session || !draft.current?.dirty || draft.current.remote) return;
    setSaving(true);
    const timer = setTimeout(() => {
      void draft.current!.saveAsync(saveSessionDurably).then(() => {
        setSaveError(draft.current?.error ?? "");
        setSavedAt(draft.current?.saved.updatedAt);
        setRemoteSession(draft.current?.remote);
        setSaving(false);
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [session]);
  useEffect(() => {
    finishRef.current = complete;
  });
  useEffect(() => {
    if (session && !session.completedAt && remainingSeconds(session, now) === 0)
      finishRef.current(true);
  }, [session, now]);
  if (loadingWork && !session)
    return (
      <p className="route-loading" role="status">
        Открываем сохранённую работу…
      </p>
    );
  if (!session)
    return (
      <>
        <PageHeading
          eyebrow="ЛОКАЛЬНАЯ РАБОТА"
          title="Работа не найдена"
          text="Черновик хранится только в браузере, где вы начали работу. Он мог быть удалён или не пройти проверку целостности."
        />
        <LinkButton to="/oge/results/">Открыть сохранённые работы</LinkButton>
        <LinkButton to="/oge/bank/" secondary>
          Выбрать задания
        </LinkButton>
      </>
    );
  const item = session.items[session.activeIndex],
    id = itemId(item),
    answer = session.answers[id] ?? "",
    checked = session.checkedIds.includes(id);
  const seconds = remainingSeconds(session, now),
    expired = seconds === 0 && !session.completedAt;
  function update(patch: Partial<PracticeSession>) {
    const work = draft.current!;
    if (patch.answers || patch.selectedPrompts) {
      const reviews = { ...work.current.writingReviews };
      for (const item of work.current.items)
        if (item.kind === "writing") {
          const id = item.writing.id;
          if (patch.answers && patch.answers[id] !== work.current.answers[id]) {
            for (const key of Object.keys(reviews))
              if (key === id || key.startsWith(`${id}:`))
                reviews[key] = { ...reviews[key], reviewedAt: undefined };
            if (reviews[literacyReviewId])
              reviews[literacyReviewId] = {
                ...reviews[literacyReviewId],
                reviewedAt: undefined,
              };
          }
          const before =
            work.current.selectedPrompts[id] ?? item.writing.prompts[0].id;
          const after = patch.selectedPrompts?.[id] ?? before;
          if (before !== after && reviews[literacyReviewId])
            reviews[literacyReviewId] = {
              ...reviews[literacyReviewId],
              reviewedAt: undefined,
            };
        }
      patch = { ...patch, writingReviews: reviews };
    }
    if (patch.writingReviews && Object.entries(patch.writingReviews).some(([key, review]) => key !== literacyReviewId && review !== work.current.writingReviews?.[key]) && patch.writingReviews[literacyReviewId]) {
      patch = { ...patch, writingReviews: { ...patch.writingReviews, [literacyReviewId]: { ...patch.writingReviews[literacyReviewId], reviewedAt: undefined } } };
    }
    const next = work.edit(patch);
    setSaving(true);
    latest.current = next;
    setSession(next);
  }
  function navigate(index: number) {
    update({ activeIndex: index });
    setFormatError("");
    document.getElementById("work-question")?.focus();
  }
  function complete(timeout = false) {
    const previous = latest.current!;
    if (previous.completedAt) return;
    for (const result of resultsFor(previous))
      if (
        result.item.kind === "exercise" &&
        result.grade &&
        result.grade.status !== "format_error" &&
        !previous.checkedIds.includes(itemId(result.item))
      )
        saveAttempt(createAttempt(result.item.exercise, result.answer, false));
    update({
      completedAt: new Date().toISOString(),
      ...(timeout ? { endedByTimeout: true } : {}),
    });
    setConfirm(false);
    document.getElementById("main")?.scrollIntoView({ behavior: "instant" });
  }

  const empty = session.items.filter(
    (item) => !(session.answers[itemId(item)] ?? "").trim(),
  );
  const recovery = (
    <section
      className="oge-draft-tools"
      aria-label="Сохранение и резервная копия"
    >
      <p role="status">
        {saving
          ? "Сохраняем изменения…"
          : session.updatedAt !== savedAt
            ? "Есть несохранённые изменения"
            : "Черновик сохранён"}
        {" · Последняя запись: "}
        {savedAt
          ? new Date(savedAt).toLocaleTimeString("ru-RU")
          : "ещё не выполнена"}
      </p>
      {saveError && (
        <p className="storage-error" role="alert">
          {saveError}
        </p>
      )}
      {saveError && (
        <button
          className="button"
          onClick={async () => {
            const work = draft.current!;
            setSaving(true);
            await work.saveAsync(saveSessionDurably);
            setSaveError(work.error);
            setSavedAt(work.saved.updatedAt);
            setRemoteSession(work.remote);
            setSaving(false);
          }}
        >
          Повторить сохранение
        </button>
      )}
      <button
        className="button secondary"
        onClick={() => downloadBackup([draft.current!.current])}
      >
        Скачать резервную копию
      </button>
      <details>
        <summary>Предыдущие сохранённые редакции</summary>
        <p>
          Контрольные копии создаются примерно раз в минуту и при завершении.
          Восстановление создаёт отдельную работу и сохраняет текущую редакцию.
        </p>
        <button
          className="button secondary"
          onClick={async () =>
            setCheckpoints(await sessionRevisions(session.id))
          }
        >
          Показать редакции
        </button>
        {checkpoints.map((checkpoint) => (
          <div key={checkpoint.updatedAt}>
            <span>
              {new Date(checkpoint.updatedAt).toLocaleString("ru-RU")} ·
              Ответов:{" "}
              {
                Object.values(checkpoint.answers).filter((answer) =>
                  answer.trim(),
                ).length
              }
            </span>
            <button
              className="button secondary"
              onClick={async () => {
                const copy = {
                  ...checkpoint,
                  id: crypto.randomUUID(),
                  title: "Восстановленная редакция: " + checkpoint.title,
                };
                try {
                  await saveSessionDurably(copy);
                  window.location.assign(
                    href(`/oge/practice/session/?id=${copy.id}`),
                  );
                } catch (error) {
                  setSaveError(
                    error instanceof Error
                      ? error.message
                      : "Не удалось восстановить редакцию.",
                  );
                }
              }}
            >
              Открыть отдельной работой
            </button>
          </div>
        ))}
        {!checkpoints.length && (
          <p>
            После загрузки здесь появятся доступные контрольные копии. Старые
            работы до миграции могут иметь только одну редакцию.
          </p>
        )}
      </details>
      <button
        className="button secondary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(
              sessionAnswerText(draft.current!.current),
            );
            setCopyMessage("Все текущие ответы скопированы.");
          } catch {
            setCopyMessage(
              "Копирование недоступно. Скачайте резервную копию или выделите текст ответов вручную.",
            );
          }
        }}
      >
        Скопировать ответы
      </button>
      {copyMessage && <p role="status">{copyMessage}</p>}
      {remoteSession && (
        <>
          <p>
            Редакция другой вкладки:{" "}
            {new Date(remoteSession.updatedAt).toLocaleString("ru-RU")}. Текущая
            редакция: {new Date(session.updatedAt).toLocaleString("ru-RU")}.
          </p>
          <button
            className="button secondary"
            onClick={() =>
              downloadBackup([draft.current!.current, draft.current!.remote!])
            }
          >
            Скачать обе редакции
          </button>
          <button
            className="button"
            onClick={async () => {
              const copy = {
                ...draft.current!.current,
                id: crypto.randomUUID(),
                title: "Отдельный черновик: " + draft.current!.current.title,
              };
              try {
                await saveSessionDurably(copy);
                draft.current = new SessionDraft(copy);
                latest.current = copy;
                setSession(copy);
                setSaveError("");
                setSavedAt(copy.updatedAt);
                setRemoteSession(undefined);
                const url = new URL(window.location.href);
                url.searchParams.set("id", copy.id);
                window.history.replaceState(null, "", url);
              } catch (error) {
                setSaveError(
                  error instanceof Error
                    ? error.message
                    : "Не удалось сохранить отдельный черновик.",
                );
              }
            }}
          >
            Сохранить текущую редакцию отдельно
          </button>
        </>
      )}
    </section>
  );
  if (session.completedAt)
    return (
      <>
        {recovery}
        <SessionResults session={session} update={update} />
      </>
    );
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "ОГЭ", path: "/oge/" },
          { label: "Работы", path: "/oge/results/" },
          { label: session.title },
        ]}
      />
      <PageHeading
        eyebrow={
          session.mode === "control" ? "КОНТРОЛЬНАЯ РАБОТА" : "УЧЕБНАЯ ПОДБОРКА"
        }
        title={session.title}
        text="ОГЭ-2027, проект модели. Ответы и состав работы сохраняются в этом браузере."
      />
      <div className="oge-work-status">
        <span>
          Ответов: {session.items.length - empty.length} из{" "}
          {session.items.length}
        </span>
        {seconds !== undefined && (
          <span>
            Осталось: {Math.floor(seconds / 3600)}:
            {String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:
            {String(seconds % 60).padStart(2, "0")}
          </span>
        )}
      </div>
      {recovery}
      {expired && (
        <p role="alert">
          Время истекло. Ответы фиксируются, открывается разбор.
        </p>
      )}
      <nav className="oge-work-nav" aria-label="Задания работы">
        {session.items.map((i, n) => (
          <button
            key={itemId(i)}
            className="button secondary"
            aria-current={n === session.activeIndex ? "step" : undefined}
            onClick={() => navigate(n)}
          >
            {session.kind === "practice" ? n + 1 : `№ ${itemLine(i)}`}
            <span className="sr-only">
              {(session.answers[itemId(i)] ?? "").trim()
                ? " — ответ записан"
                : " — без ответа"}
            </span>
            <span aria-hidden="true">
              {(session.answers[itemId(i)] ?? "").trim() ? " ✓" : ""}
            </span>
          </button>
        ))}
      </nav>
      <article className="question-card" id="work-question" tabIndex={-1}>
        <h2>
          {item.kind === "exercise" ? item.exercise.title : item.writing.title}
        </h2>
        {item.kind === "exercise" ? (
          <>
            <ExerciseStatement
              exercise={item.exercise}
              text={session.texts.find(
                (t) => t.id === item.exercise.sourceTextId,
              )}
            />
            <AnswerControl
              exercise={item.exercise}
              answer={answer}
              locked={checked || expired}
              change={(value) => {
                update({
                  answers: { ...latest.current!.answers, [id]: value },
                });
                setFormatError("");
              }}
            />
            <p className="answer-instruction">{item.exercise.instruction}</p>
            {session.mode === "learn" && (
              <>
                <button
                  className="button"
                  disabled={checked || expired}
                  onClick={() => {
                    const grade = gradeExercise(answer, item.exercise);
                    if (grade.status === "format_error")
                      setFormatError(grade.message);
                    else {
                      update({ checkedIds: [...session.checkedIds, id] });
                      saveAttempt(createAttempt(item.exercise, answer, false));
                    }
                  }}
                >
                  Проверить ответ
                </button>
                {checked && (
                  <ExerciseFeedback exercise={item.exercise} answer={answer} />
                )}
                <details className="hint">
                  <summary>Подсказка</summary>
                  <p>{item.exercise.hint}</p>
                </details>
              </>
            )}
          </>
        ) : (
          <>
            {item.writing.line === 1 && (
              <SummaryAudio
                key={id}
                session={session}
                writing={item.writing}
                update={update}
              />
            )}
            <fieldset disabled={expired}>
              <legend>Тема письменной работы</legend>
              {item.writing.prompts.length > 1 && (
                <label>
                  Выберите один вопрос
                  <select
                    value={
                      session.selectedPrompts[id] ?? item.writing.prompts[0].id
                    }
                    onChange={(e) =>
                      update({
                        selectedPrompts: {
                          ...session.selectedPrompts,
                          [id]: e.target.value,
                        },
                      })
                    }
                  >
                    {item.writing.prompts.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <p>
                {
                  (
                    item.writing.prompts.find(
                      (p) =>
                        p.id ===
                        (session.selectedPrompts[id] ??
                          item.writing.prompts[0].id),
                    ) ?? item.writing.prompts[0]
                  ).text
                }
              </p>
              {item.writing.line === 13 &&
                session.texts.find(
                  (t) => t.id === item.writing.sourceTextId,
                ) && (
                  <div className="oge-source">
                    {session.texts
                      .find((t) => t.id === item.writing.sourceTextId)!
                      .paragraphs.map((p, n) => (
                        <p key={n}>{p}</p>
                      ))}
                  </div>
                )}
              <label>
                Ваш письменный ответ
                <textarea
                  rows={14}
                  value={answer}
                  maxLength={30000}
                  onChange={(e) =>
                    update({
                      answers: {
                        ...latest.current!.answers,
                        [id]: e.target.value,
                      },
                    })
                  }
                />
              </label>
              <p role="status">
                Слов: {wordCount(answer)}.{" "}
                {wordCount(answer) < 70
                  ? "До обязательного минимума: " +
                    (70 - wordCount(answer)) +
                    "."
                  : ""}{" "}
                Сложные сокращения и служебные пометы проверьте вручную.
              </p>
            </fieldset>
            <WritingCriteria
              writing={item.writing}
              session={session}
              update={update}
            />
            <LiteracyCriteria session={session} update={update} />
            <WritingGuide
              key={`${item.writing.id}:${item.writing.revision}`}
              writing={item.writing}
              session={session}
            />
          </>
        )}
        {formatError && (
          <p role="alert">
            {formatError} Такая ошибка не влияет на оценку навыка.
          </p>
        )}
      </article>
      <div className="inline-actions">
        <button
          className="button secondary"
          disabled={session.activeIndex === 0}
          onClick={() => navigate(session.activeIndex - 1)}
        >
          Предыдущее задание
        </button>
        <button
          className="button"
          disabled={session.activeIndex === session.items.length - 1}
          onClick={() => navigate(session.activeIndex + 1)}
        >
          Следующее задание
        </button>
        <button className="button secondary" onClick={() => setConfirm(true)}>
          Завершить работу
        </button>
      </div>
      {confirm && (
        <section className="editorial-note" role="alert">
          <h2>Завершить и открыть разбор?</h2>
          <p>
            {empty.length
              ? `Без ответа осталось заданий: ${empty.length}. Вы можете вернуться и заполнить их.`
              : "Все поля заполнены. После завершения ответы этой попытки будут зафиксированы."}
          </p>
          <button className="button" onClick={() => complete()}>
            Подтвердить завершение
          </button>
          <button
            className="button secondary"
            onClick={() => setConfirm(false)}
          >
            Продолжить работу
          </button>
        </section>
      )}
    </>
  );
}
export function SessionResults({
  session,
  update,
}: {
  session: PracticeSession;
  update: (patch: Partial<PracticeSession>) => void;
}) {
  const results = resultsFor(session),
    correct = results.filter((r) => r.status === "correct").length,
    incorrect = results.filter((r) => r.status === "incorrect"),
    skipped = results.filter(
      (r) => r.status === "skipped" && r.item.kind === "exercise",
    ),
    format = results.filter((r) => r.status === "format_error"),
    expert = results.filter((r) => r.status === "expert"),
    missingWriting = results.filter(
      (r) => r.item.kind === "writing" && r.status === "skipped",
    ),
    insufficient = results.filter((r) => r.status === "insufficient"),
    reviewed = results.filter((r) => r.status === "reviewed");
  return (
    <>
      <Breadcrumbs
        items={[
          { label: "ОГЭ", path: "/oge/" },
          { label: "Результаты", path: "/oge/results/" },
          { label: session.title },
        ]}
      />
      <PageHeading
        eyebrow="РАБОТА ЗАВЕРШЕНА"
        title="Результаты и разбор"
        text={session.title}
      />
      {session.endedByTimeout && (
        <p role="status">
          Контрольное время истекло. Ответы зафиксированы автоматически,
          продолжить эту попытку нельзя.
        </p>
      )}
      <div className="inline-actions oge-print-tools">
        <button
          className="button secondary"
          onClick={() => {
            document
              .querySelectorAll<HTMLDetailsElement>(
                ".oge-result details, .oge-criteria",
              )
              .forEach((detail) => {
                detail.open = true;
              });
            window.print();
          }}
        >
          Распечатать полную работу
        </button>
      </div>
      <p>
        Состав: {session.id.slice(0, 8)} · Код выбора: {session.seed} · Модель:{" "}
        {session.specificationId}. Задания и редакции взяты из сохранённого
        снимка этой работы.
      </p>
      <GenerationDetails session={session} />
      <div className="stats-grid">
        <div>
          <strong>{correct}</strong>
          <span>верных ответов</span>
        </div>
        <div>
          <strong>{incorrect.length}</strong>
          <span>предметных ошибок</span>
        </div>
        <div>
          <strong>{skipped.length}</strong>
          <span>пропущенных тестовых заданий</span>
        </div>
      </div>
      <p>
        Автоматически проверенная часть: {correct} из{" "}
        {results.filter((r) => r.item.kind === "exercise").length}. Ошибок
        формата: {format.length}. Развёрнутых ответов для эксперта:{" "}
        {expert.length}.
      </p>
      <p>
        Письменная часть: не написано — {missingWriting.length}; меньше 70 слов
        — {insufficient.length}; требует проверки — {expert.length}; записана
        оценка эксперта — {reviewed.length}.
      </p>
      {results.some((result) => result.item.kind === "writing") && (
        <p className="editorial-note">
          Изложение, сочинение и общую грамотность оценивает человек.
          Сохранённая локальная оценка не является официальным экзаменационным
          результатом. Общий официальный балл и школьная отметка не вычисляются.
        </p>
      )}
      {incorrect.length > 0 && (
        <div className="inline-actions">
          <button
            className="button"
            onClick={async () => {
              try {
                const ids = incorrect
                  .filter((r) => r.item.kind === "exercise")
                  .map((r) => itemId(r.item));
                const repeat = {
                  ...structuredClone(session),
                  id: crypto.randomUUID(),
                  title: "Повторение ошибок: " + session.title,
                  kind: "practice" as const,
                  mode: "learn" as const,
                  items: session.items.filter((item) =>
                    ids.includes(itemId(item)),
                  ),
                  answers: {},
                  checkedIds: [],
                  selectedPrompts: {},
                  activeIndex: 0,
                  startedAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                  completedAt: undefined,
                  durationMinutes: undefined,
                  writingReviews: undefined,
                  endedByTimeout: undefined,
                };
                await saveSessionDurably(repeat);
                window.location.assign(
                  href(`/oge/practice/session/?id=${repeat.id}`),
                );
              } catch (error) {
                window.alert(
                  error instanceof Error
                    ? error.message
                    : "Не удалось сохранить повторение",
                );
              }
            }}
          >
            Повторить только ошибки
          </button>
          <LinkButton to="/oge/generator/?mode=thematic" secondary>
            Новая тематическая подборка
          </LinkButton>
        </div>
      )}
      <p>
        Один результат показывает правильность этой работы. Для вывода об
        освоении навыка нужны разные задания и повторные проверки.
      </p>
      {results.map((result, n) => {
        const item = result.item;
        const sourceId =
          item.kind === "exercise"
            ? item.exercise.sourceTextId
            : item.writing.sourceTextId;
        const source = session.texts.find((text) => text.id === sourceId);
        const selected =
          item.kind === "writing"
            ? (item.writing.prompts.find(
                (prompt) =>
                  prompt.id === session.selectedPrompts[item.writing.id],
              ) ?? item.writing.prompts[0])
            : undefined;
        return (
          <section
            className="question-card oge-result"
            key={itemId(result.item)}
          >
            <h2>
              {session.kind === "practice"
                ? `Упражнение ${n + 1}`
                : `Задание № ${itemLine(result.item)}`}
              :{" "}
              {result.item.kind === "exercise"
                ? result.item.exercise.title
                : result.item.writing.title}
            </h2>
            {result.item.kind === "exercise" ? (
              <>
                <ExerciseStatement
                  exercise={result.item.exercise}
                  text={source}
                />
                <p className="muted">
                  Сохранённая редакция: {result.item.exercise.id}, revision{" "}
                  {result.item.exercise.revision}.
                </p>
                {result.status === "skipped" ? (
                  <>
                    <p>
                      Пропущено. Эталон:{" "}
                      {result.item.exercise.answers.join(" / ")}.
                    </p>
                    <p>{result.item.exercise.explanation}</p>
                    <a
                      href={href(
                        `/theory/${result.item.exercise.topicSlug}/?exam=OGE`,
                      )}
                    >
                      Повторить правило
                    </a>
                  </>
                ) : (
                  <ExerciseFeedback
                    exercise={result.item.exercise}
                    answer={result.answer}
                    revealKey
                  />
                )}
              </>
            ) : (
              <>
                {source && <SourcePassage text={source} />}
                <p className="question-prompt">
                  Выбранная тема: {selected?.label}
                </p>
                <p>{selected?.text}</p>
                <p>
                  {result.status === "skipped"
                    ? "Не написано"
                    : result.status === "insufficient"
                      ? "Недостаточный объём: обязательный минимум — 70 слов"
                      : result.status === "reviewed"
                        ? "Сохранена локальная оценка эксперта"
                        : "Требуется экспертная проверка"}{" "}
                  · {wordCount(result.answer)} слов.
                </p>
                <div className="oge-written-answer">
                  {result.answer || "Письменный ответ не записан."}
                </div>
                <WritingCriteria
                  writing={result.item.writing}
                  session={session}
                  update={update}
                />
                <WritingGuide writing={result.item.writing} session={session} />
                <details>
                  <summary>Пример анализа содержания</summary>
                  <p>{result.item.writing.analysis}</p>
                  {result.item.writing.microtopics && (
                    <ol>
                      {result.item.writing.microtopics.map((t) => (
                        <li key={t}>{t}</li>
                      ))}
                    </ol>
                  )}
                </details>
              </>
            )}
          </section>
        );
      })}
      <LiteracyCriteria session={session} update={update} />
      <div className="inline-actions">
        <LinkButton to="/oge/results/">Все сохранённые работы</LinkButton>
        <LinkButton to="/oge/bank/" secondary>
          Вернуться к банку
        </LinkButton>
      </div>
    </>
  );
}
