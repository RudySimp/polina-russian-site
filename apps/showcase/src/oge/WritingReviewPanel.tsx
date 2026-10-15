import { useState } from "react";
import type {
  PracticeSession,
  WritingAssignment,
  WritingReview,
} from "./model";
import { specification } from "./specification";
import { literacyEligibility, writingWordCount } from "./writing-review";
import {
  essayCriteria,
  literacyCriteria,
  literacyReviewId,
  summaryCriteria,
  type WritingCriterion,
} from "./writing-rubric";

function EvaluationSheet({
  session,
  reviewId,
  criteria,
  checklist,
  promptId,
  eligible,
  writing,
  update,
}: {
  session: PracticeSession;
  reviewId: string;
  criteria: WritingCriterion[];
  checklist: string[];
  promptId?: string;
  eligible: boolean;
  writing?: WritingAssignment;
  update: (patch: Partial<PracticeSession>) => void;
}) {
  const review: WritingReview = session.writingReviews?.[reviewId] ?? {
    checks: [],
    scores: {},
    note: "",
    role: "self",
    promptId,
  };
  const [message, setMessage] = useState("");
  function change(patch: Partial<WritingReview>) {
    setMessage("");
    update({
      writingReviews: {
        ...session.writingReviews,
        [reviewId]: { ...review, ...patch, promptId, reviewedAt: undefined },
      },
    });
  }
  const complete = criteria.every(
    (criterion) => review.scores[criterion.code] !== undefined,
  );
  return (
    <div className="oge-evaluation-sheet">
      {checklist.length > 0 && (
        <fieldset>
          <legend>Отметки самопроверки</legend>
          {checklist.map((item, index) => (
            <label className="check-label" key={item}>
              <input
                type="checkbox"
                checked={review.checks.includes(index)}
                onChange={(event) =>
                  change({
                    checks: event.target.checked
                      ? [...review.checks, index]
                      : review.checks.filter((n) => n !== index),
                  })
                }
              />{" "}
              {item}
            </label>
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Локальный оценочный лист</legend>
        <label>
          Кто оценивает
          <select
            value={review.role}
            onChange={(event) =>
              change({ role: event.target.value as WritingReview["role"] })
            }
          >
            <option value="self">Самопроверка ученика</option>
            <option value="expert">Экспертная проверка человеком</option>
          </select>
        </label>
        {review.role === "expert" && (
          <label>
            Имя проверяющего
            <input
              value={review.reviewer ?? ""}
              maxLength={200}
              onChange={(event) => change({ reviewer: event.target.value })}
            />
          </label>
        )}
        {promptId && review.role === "expert" && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={!!review.contentAccepted}
              onChange={(event) =>
                change({ contentAccepted: event.target.checked })
              }
            />{" "}
            Содержание этой работы зачтено проверяющим
          </label>
        )}
        {criteria.map((criterion) => (
          <label key={criterion.code}>
            {criterion.code} · {criterion.title}
            <select
              value={review.scores[criterion.code] ?? ""}
              onChange={(event) => {
                const scores = { ...review.scores };
                if (event.target.value === "") delete scores[criterion.code];
                else scores[criterion.code] = Number(event.target.value);
                change({ scores });
              }}
            >
              <option value="">Не оценено</option>
              {criterion.levels.map((description, score) => (
                <option key={score} value={score}>
                  {score} · {description}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          Замечания и план исправления
          <textarea
            rows={3}
            value={review.note}
            maxLength={50000}
            onChange={(event) => change({ note: event.target.value })}
          />
        </label>
        {!eligible && (
          <p>
            Оценочный лист можно заполнить как черновик. Фиксация оценки
            доступна после написания ответа достаточного объёма.
          </p>
        )}
        <button
          className="button secondary"
          disabled={!eligible}
          onClick={() => {
            if (
              !complete ||
              (review.role === "expert" && !review.reviewer?.trim())
            ) {
              setMessage(
                "Оцените каждый критерий. Для экспертной проверки также укажите имя проверяющего.",
              );
              return;
            }
            const next = {
              ...review,
              promptId,
              ...(writing
                ? {
                    answerText: session.answers[writing.id] ?? "",
                    writingRevision: writing.revision,
                    reviewedWordCount: writingWordCount(session, writing),
                  }
                : {}),
              reviewedAt: new Date().toISOString(),
            };
            update({
              writingReviews: { ...session.writingReviews, [reviewId]: next },
            });
            setMessage(
              review.role === "expert"
                ? "Локальная оценка эксперта записана."
                : "Самооценка записана; она не заменяет экспертную проверку.",
            );
          }}
        >
          Зафиксировать оценку
        </button>
        {review.reviewedAt && (
          <p>
            {review.role === "expert"
              ? `Указанный проверяющий: ${review.reviewer}.`
              : "Самооценка ученика."}{" "}
            Дата: {new Date(review.reviewedAt).toLocaleString("ru-RU")}. По этим
            критериям:{" "}
            {criteria.reduce(
              (sum, criterion) => sum + (review.scores[criterion.code] ?? 0),
              0,
            )}{" "}
            из{" "}
            {criteria.reduce(
              (sum, criterion) => sum + criterion.levels.length - 1,
              0,
            )}
            .
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </fieldset>
      <p>
        Баллы вводит человек. Выбор роли не подтверждает квалификацию; лист
        хранится в этом браузере и в резервной копии. Сайт не выставляет
        официальный итоговый балл.
      </p>
    </div>
  );
}
function Rubric({ criteria }: { criteria: WritingCriterion[] }) {
  return (
    <>
      {criteria.map((criterion) => (
        <details key={criterion.code}>
          <summary>
            {criterion.code} · {criterion.title}: 0–
            {criterion.levels.length - 1} баллов
          </summary>
          <ul>
            {[...criterion.levels].reverse().map((description, n) => (
              <li key={description}>
                <strong>{criterion.levels.length - 1 - n}:</strong>{" "}
                {description}
              </li>
            ))}
          </ul>
          <p>{criterion.example}</p>
        </details>
      ))}
    </>
  );
}
export function WritingCriteria({
  session,
  writing,
  update,
}: {
  session: PracticeSession;
  writing: WritingAssignment;
  update: (patch: Partial<PracticeSession>) => void;
}) {
  const criteria = writing.line === 1 ? summaryCriteria : essayCriteria;
  const promptId = session.selectedPrompts[writing.id] ?? writing.prompts[0].id;
  return (
    <details className="oge-criteria" open>
      <summary>Критерии и самопроверка</summary>
      <p>
        Проект ОГЭ-2027:{" "}
        {writing.line === 1
          ? "изложение, максимум 6 баллов за содержание"
          : "сочинение, максимум 8 баллов за содержание"}
        . Обязательный минимум — 70 слов. Ответ короче 70 слов не засчитывается.
        Счётчик предварительный: сокращения и служебные пометы проверяются
        вручную.
      </p>
      <p>
        {writing.line === 1
          ? "Работа без опоры на прослушанный текст не оценивается. Сжатие должно сохранять микротемы исходного текста."
          : "Нужно отвечать на выбранный вопрос, опираться на исходный текст и самостоятельно рассуждать. Полное переписывание или пересказ без комментариев, ответ на другой вопрос и работа короче 70 слов дают 0 по СК1–СК4. Работа по другому исходному тексту не оценивается."}
      </p>
      {writing.line === 13 && (
        <p>
          {promptId === "13.1"
            ? "13.1: объясните роль указанного языкового средства, докажите вывод двумя примерами и поясните действие средства в каждом случае."
            : promptId === "13.2"
              ? "13.2: объясните смысл выбранного фрагмента в контексте. Два примера с пояснениями должны подтверждать именно это толкование."
              : "13.3: ответьте на нравственный вопрос, раскройте понятие через поступки героев и поясните два примера из текста."}
        </p>
      )}
      <Rubric criteria={criteria} />
      <EvaluationSheet
        session={session}
        reviewId={`${writing.id}:${promptId}`}
        criteria={criteria}
        checklist={writing.checklist}
        promptId={promptId}
        writing={writing}
        eligible={writingWordCount(session, writing) >= 70}
        update={update}
      />
      <a href={specification.sourceUrl} target="_blank" rel="noreferrer">
        ФИПИ: проект модели и полные критерии
      </a>
    </details>
  );
}
export function LiteracyCriteria({
  session,
  update,
}: {
  session: PracticeSession;
  update: (patch: Partial<PracticeSession>) => void;
}) {
  const writing = session.items.filter((item) => item.kind === "writing");
  if (!writing.length) return null;
  const counts = writing.map((item) =>
    item.kind === "writing" ? writingWordCount(session, item.writing) : 0,
  );
  const accepted = literacyEligibility(session);
  return (
    <details className="oge-criteria">
      <summary>Общая грамотность и фактическая точность · до 13 баллов</summary>
      <p>
        ГК1–ГК4 и ФК1 применяются один раз к изложению и сочинению вместе. Нужен
        суммарный объём не менее 140 слов в зачтённых по содержанию работах.
        Если зачтена только одна работа, в ней самой должно быть не менее 140
        слов. При 139 словах или меньше по всем этим критериям выставляется 0.
      </p>
      <p>
        Сейчас во всех письменных полях:{" "}
        {counts.reduce((sum, count) => sum + count, 0)} слов. Этот счётчик не
        определяет, зачтено ли содержание. Это решает проверяющий.
      </p>
      <p>
        В работах с явно зачтённым содержанием: {accepted.total} слов; зачтено
        работ: {accepted.acceptedCount}. Сначала проверяющий должен заполнить и
        зафиксировать содержательный оценочный лист каждой работы, указать имя и
        отметить, что содержание зачтено. Самооценка ученика этого решения не
        заменяет.
      </p>
      {[1, 13].some(
        (line) =>
          writing.filter(
            (item) => item.kind === "writing" && item.writing.line === line,
          ).length > 1,
      ) && (
        <p>
          В этой подборке несколько изложений или сочинений. Общий лист
          грамотности применяется к одной работе объёмом от 140 слов либо к
          одной паре «изложение + сочинение». Для этой подборки фиксация общего
          листа отключена; отдельные содержательные листы остаются доступны.
        </p>
      )}
      <Rubric criteria={literacyCriteria} />
      <EvaluationSheet
        session={session}
        reviewId={literacyReviewId}
        criteria={literacyCriteria}
        checklist={[]}
        eligible={accepted.eligible}
        update={update}
      />
    </details>
  );
}
