import raw from "../../../../content/oge-writing-workshops.json";
import type { PracticeSession, WritingAssignment } from "./model";
import { wordCount } from "./word-count";
import { useLessonState } from "../lib/lesson-state";
import { writingWorkshopPacketSchema, type ScoredWritingSample, type WritingMicrotask } from "./writing-workshop-model";

const packet = writingWorkshopPacketSchema.parse(raw);
type MicrotaskState = { text: string; firstAnswer?: string; firstRecordedAt?: string; revealed: boolean; assisted: boolean; selfReviewed: boolean };
function validMicrotask(value: unknown): value is MicrotaskState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  return typeof state.text === "string" && state.text.length <= 4000 && typeof state.revealed === "boolean" && typeof state.assisted === "boolean" && typeof state.selfReviewed === "boolean" && (state.firstAnswer === undefined || (typeof state.firstAnswer === "string" && state.firstAnswer.length <= 4000)) && (state.firstRecordedAt === undefined || typeof state.firstRecordedAt === "string");
}
function Microtask({ task, scope, title }: { task: WritingMicrotask; scope: string; title: string }) {
  const [state, update, saveError] = useLessonState<MicrotaskState>(scope, { text: "", revealed: false, assisted: false, selfReviewed: false }, validMicrotask);
  return <section className="oge-writing-microtask" aria-label={title}>
    <h5>{title}</h5>
    <p>{task.instruction}</p>
    <blockquote>{task.sourceExcerpt}</blockquote>
    <label>
      Ваш учебный фрагмент
      <textarea rows={4} maxLength={4000} value={state.text} onChange={(event) => update({ ...state, text: event.target.value, selfReviewed: false })} />
    </label>
    {saveError && <p role="status">Не удалось сохранить учебный фрагмент в браузере. Скопируйте его перед закрытием страницы.</p>}
    <div className="inline-actions">
      <button className="button secondary" disabled={!state.text.trim() || !!state.firstAnswer} onClick={() => update({ ...state, firstAnswer: state.text, firstRecordedAt: new Date().toISOString() })}>Зафиксировать первый вариант</button>
      <button className="button secondary" disabled={!state.firstAnswer} aria-expanded={state.revealed} onClick={() => update({ ...state, revealed: !state.revealed, assisted: true })}>{state.revealed ? "Скрыть образец" : "Открыть образец и вопросы"}</button>
    </div>
    {state.firstAnswer && <p className="muted">{state.assisted ? "Образец этой микрозадачи уже открывался: последующее редактирование выполняется с опорой на него." : "Первый вариант зафиксирован до открытия образца этой микрозадачи."} Это учебная попытка, содержательную точность проверяет человек.</p>}
    {state.firstAnswer && <details><summary>Первый вариант учебного фрагмента</summary><p className="oge-written-answer">{state.firstAnswer}</p></details>}
    {state.revealed && <div className="feedback">
      <h6>Один из возможных ответов</h6>
      <p className="oge-written-answer">{task.sampleAnswer}</p>
      <ul>{task.reviewQuestions.map((question) => <li key={question}>{question}</li>)}</ul>
      <p><strong>Частая ошибка:</strong> {task.commonError}</p>
      <label className="check-label"><input type="checkbox" checked={state.selfReviewed} onChange={(event) => update({ ...state, selfReviewed: event.target.checked })} /> Я сопоставил свой ответ с вопросами самопроверки.</label>
      {state.selfReviewed && <p role="status">Самопроверка отмечена. Это не автоматический зачёт содержания и не экспертный балл.</p>}
    </div>}
  </section>;
}
function ScoredSample({ sample }: { sample: ScoredWritingSample }) {
  return <details className="oge-scored-writing-sample">
    <summary>{sample.label} · {sample.contentTotal}/{sample.contentMax} по содержанию</summary>
    <p className="muted">Редакторская учебная оценка · примерно {wordCount(sample.text)} слов. Утверждение преподавателем ожидается.</p>
    <p className="oge-written-answer">{sample.text}</p>
    <h5>Почему выставлены эти баллы</h5>
    <ul>{sample.contentScores.map((score) => <li key={score.code}>
      <strong>{score.code}: {score.score}.</strong> {score.reason}
      {score.evidence.map((item) => <blockquote key={item.quote}>{item.quote}</blockquote>)}
    </li>)}</ul>
    <h5>Замечания к конкретным фрагментам</h5>
    {sample.comments.map((comment) => <section key={comment.quote}>
      <blockquote>{comment.quote}</blockquote>
      <p><strong>{comment.criterionCode}.</strong> {comment.reason}</p>
      <p><strong>Следующий шаг:</strong> {comment.nextAction}</p>
    </section>)}
  </details>;
}
export function WritingWorkshop({ session, writing }: { session: PracticeSession; writing: WritingAssignment }) {
  if (session.mode === "control" && !session.completedAt) return null;
  const promptId = session.selectedPrompts[writing.id] ?? writing.prompts[0].id;
  const source = session.texts.find((text) => text.id === writing.sourceTextId);
  const workshop = packet.workshops.find((value) => value.writingId === writing.id && value.writingRevision === writing.revision && value.sourceTextId === source?.id && value.sourceTextRevision === source.revision && value.promptId === promptId);
  if (!workshop) return <p>Для этой темы и редакции оценённый учебный практикум пока не подготовлен. Доступный выше маршрут, исходный текст и критерии остаются опорой для работы.</p>;
  return <section className="oge-writing-workshop" aria-label="Письменный практикум">
    <h4>{workshop.title}</h4>
    <p>{packet.assessmentNotice}</p>
    <p><a href={packet.model.sourcePageUrl} target="_blank" rel="noreferrer">Критерии ФИПИ-2027 · проект</a></p>
    <h4>Сначала выполните отдельную письменную операцию</h4>
    <p>Запишите свой вариант и зафиксируйте его, затем откройте один из возможных ответов. Самопроверка помогает редактировать текст и требует содержательного решения человека.</p>
    {workshop.microtasks.map((task, index) => <Microtask key={session.id + ":" + workshop.id + ":" + task.id} task={task} title={String(index + 1) + ". " + (packet.operations.find((operation) => operation.id === task.operationId)?.title ?? task.instruction)} scope={"writing-workshop:" + session.id + ":" + workshop.id + ":r" + workshop.revision + ":" + task.id} />)}
    <h4>Сравните цельные ответы и основания оценки</h4>
    {workshop.samples.map((sample) => <ScoredSample key={sample.id} sample={sample} />)}
    <h4>Теперь напишите цельный ответ</h4>
    <p>{workshop.wholeAnswerTask.instruction}</p>
    <p>Запишите не менее {workshop.wholeAnswerTask.minimumWords} слов в основное поле этой письменной работы. Учебные фрагменты сами не переносятся в ответ. После редактирования используйте ручной оценочный лист.</p>
  </section>;
}
