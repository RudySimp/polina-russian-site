import { useState } from "react";
import type {
  PracticeSession,
  WritingAssignment,
  WritingReview,
} from "./model";
import { wordCount } from "./word-count";
import {
  currentWordCountCorrection,
  writingPromptId,
  writingWordCount,
} from "./writing-review";

export function WritingWordCountPanel({
  session,
  writing,
  update,
}: {
  session: PracticeSession;
  writing: WritingAssignment;
  update: (patch: Partial<PracticeSession>) => void;
}) {
  const answer = session.answers[writing.id] ?? "";
  const promptId = writingPromptId(session, writing);
  const reviewId = writing.id + ":" + promptId;
  const review: WritingReview = session.writingReviews?.[reviewId] ?? {
    checks: [],
    scores: {},
    note: "",
    role: "self",
    promptId,
  };
  const stored = review.wordCountCorrection;
  const current = currentWordCountCorrection(session, writing);
  const automatic = wordCount(answer);
  const effective = writingWordCount(session, writing);
  const [count, setCount] = useState(stored?.count.toString() ?? "");
  const [reason, setReason] = useState(stored?.reason ?? "");
  const [reviewer, setReviewer] = useState(stored?.reviewer ?? "");
  const [role, setRole] = useState<WritingReview["role"]>(
    stored?.role ?? "self",
  );
  const [message, setMessage] = useState("");
  function change(next: WritingReview) {
    update({
      writingReviews: {
        ...session.writingReviews,
        [reviewId]: { ...next, reviewedAt: undefined },
      },
    });
  }
  return (
    <section
      className="oge-word-count"
      aria-label="Подсчёт слов письменной работы"
    >
      <p role="status">
        Слов: {effective}.{" "}
        {current
          ? "Ручное уточнение; автоматический ориентир — " + automatic + "."
          : "Предварительный автоматический подсчёт."}{" "}
        {effective < 70
          ? "До обязательного минимума: " + (70 - effective) + "."
          : ""}
      </p>
      {!current &&
        [70, 140].some((threshold) => Math.abs(automatic - threshold) <= 5) && (
          <p>
            Объём близок к порогу 70 или 140 слов. Проверьте сокращения и
            служебные пометы по правилам ФИПИ; при необходимости сохраните
            ручное уточнение.
          </p>
        )}
      {stored && (
        <p>
          {current
            ? "Подсчёт уточнён"
            : "Прежнее уточнение не применяется: ответ, тема или выбор счётчика изменены"}
          : {stored.count} слов.{" "}
          {stored.role === "expert" ? "Указанный проверяющий" : "Самопроверка"}:{" "}
          {stored.reviewer}. Дата:{" "}
          {new Date(stored.recordedAt).toLocaleString("ru-RU")}. Основание:{" "}
          {stored.reason}
        </p>
      )}
      <details>
        <summary>Уточнить подсчёт слов вручную</summary>
        <p>
          Считаются самостоятельные и служебные слова; дефисное слово и инициалы
          с фамилией — одна единица. Цифры, знаки препинания, сокращённые слова
          и служебные пометы не входят в объём. Слово «сочинение» внутри
          рассуждения сохраняется. Автоматический счётчик распознаёт только
          часть явных сокращений и отдельные строки-пометы: спорный контекст
          проверяет человек.
        </p>
        <label>
          Уточнённое количество слов
          <input
            type="number"
            min={0}
            max={50000}
            step={1}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </label>
        <label>
          Основание ручного подсчёта
          <textarea
            rows={3}
            maxLength={2000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>
        <label>
          Кто уточняет объём
          <select
            value={role}
            onChange={(event) =>
              setRole(event.target.value as WritingReview["role"])
            }
          >
            <option value="self">Самопроверка ученика</option>
            <option value="expert">Проверяющий работы</option>
          </select>
        </label>
        <label>
          Имя автора уточнения
          <input
            value={reviewer}
            maxLength={200}
            onChange={(event) => setReviewer(event.target.value)}
          />
        </label>
        <p>
          Роль и имя указаны пользователем; сайт не подтверждает квалификацию.
          Уточнение объёма не означает зачёт содержания и не создаёт официальный
          балл.
        </p>
        <div className="inline-actions">
          <button
            className="button secondary"
            disabled={!answer.trim()}
            onClick={() => {
              const numeric = Number(count);
              if (
                !count.trim() ||
                !Number.isInteger(numeric) ||
                numeric < 0 ||
                numeric > 50000 ||
                !reason.trim() ||
                !reviewer.trim()
              ) {
                setMessage(
                  "Укажите целое количество слов, имя и конкретное основание ручного подсчёта.",
                );
                return;
              }
              change({
                ...review,
                promptId,
                wordCountCorrection: {
                  count: numeric,
                  reason: reason.trim(),
                  reviewer: reviewer.trim(),
                  role,
                  recordedAt: new Date().toISOString(),
                  answerText: answer,
                  promptId,
                  writingRevision: writing.revision,
                },
              });
              setMessage(
                "Ручной подсчёт сохранён для этого ответа и темы. Прежнюю оценку нужно зафиксировать заново.",
              );
            }}
          >
            Сохранить ручной подсчёт
          </button>
          {current && (
            <button
              className="button secondary"
              onClick={() => {
                change({
                  ...review,
                  wordCountCorrection: {
                    ...current,
                    invalidatedAt: new Date().toISOString(),
                  },
                });
                setMessage(
                  "Используется автоматический ориентир. Прежнюю оценку нужно зафиксировать заново.",
                );
              }}
            >
              Использовать автоматический счётчик
            </button>
          )}
        </div>
        {message && <p role="status">{message}</p>}
        <a
          href="https://fipi.ru/oge/demoversii-specifikacii-kodifikatory"
          target="_blank"
          rel="noreferrer"
        >
          ФИПИ: проект демоверсии ОГЭ-2027, правила подсчёта слов
        </a>
      </details>
    </section>
  );
}
