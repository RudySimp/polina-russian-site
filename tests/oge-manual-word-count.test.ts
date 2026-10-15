import { describe, expect, it } from "vitest";
import data from "../apps/showcase/src/oge/materials.json" with { type: "json" };
import {
  createSession,
  writingStatus,
  wordCount,
  type Materials,
} from "../apps/showcase/src/oge/engine";
import {
  writingWordCount,
  literacyEligibility,
  currentWordCountCorrection,
} from "../apps/showcase/src/oge/writing-review";
import {
  advanceSession,
  parseSession,
  sessionState,
  applySessionState,
} from "../apps/showcase/src/oge/storage";
import {
  exportSessions,
  importSessions,
} from "../apps/showcase/src/oge/backup";
import {
  essayCriteria,
  literacyReviewId,
} from "../apps/showcase/src/oge/writing-rubric";
import type { WritingReview } from "../apps/showcase/src/oge/model";

function work(words = 139) {
  const materials = { ...data, exercises: [] } as unknown as Materials;
  const writing = materials.writing.find((item) => item.line === 13)!;
  const session = createSession([{ kind: "writing", writing }], materials, {
    title: "Синтетическая проверка ручного объёма",
    kind: "practice",
    mode: "learn",
    seed: "word-count-contract",
  });
  session.answers[writing.id] = "слово ".repeat(words);
  const promptId = writing.prompts[0].id;
  const key = writing.id + ":" + promptId;
  const review: WritingReview = {
    checks: [],
    note: "Тестовая запись; не настоящая оценка ученика",
    role: "expert",
    reviewer: "Синтетический проверяющий",
    contentAccepted: true,
    promptId,
    scores: Object.fromEntries(
      essayCriteria.map((criterion) => [
        criterion.code,
        criterion.levels.length - 1,
      ]),
    ),
    reviewedAt: new Date().toISOString(),
    answerText: session.answers[writing.id],
    writingRevision: writing.revision,
    reviewedWordCount: words,
  };
  session.writingReviews = { [key]: review };
  return { session, writing, review, key, promptId };
}
function correction(fixture: ReturnType<typeof work>, count: number) {
  return {
    count,
    reason: "Тестовый ручной подсчёт: пояснена пограничная запись",
    reviewer: "Синтетический проверяющий",
    role: "expert" as const,
    recordedAt: new Date().toISOString(),
    answerText: fixture.session.answers[fixture.writing.id],
    promptId: fixture.promptId,
    writingRevision: fixture.writing.revision,
  };
}
describe("Ручной объём связан с конкретным ответом, темой и названным человеком", () => {
  it("предварительный счётчик учитывает служебные слова, дефис, инициалы, цифры, явные сокращения и отдельные пометы, сохраняя смысловое «сочинение»", () => {
    expect(
      wordCount(
        "М.Ю.Лермонтов всё-таки читал, а всё же писал. 5 лет, пять лет.",
      ),
    ).toBe(10);
    expect(
      wordCount(
        "Сочинение\nМоё сочинение посвящено герою.\nСмотрите на обороте\nСм. стр. 5: герой и друг.",
      ),
    ).toBe(7);
    expect(
      wordCount("П. И. Чайковский и А. С. Пушкин: т. е. два автора."),
    ).toBe(5);
    expect(wordCount("123 + 7")).toBe(0);
  });
  it("69/70 применяются к текущему ручному объёму; самопроверка и пустой ответ не превращаются в зачёт содержания", () => {
    const f = work(69);
    expect(
      writingStatus(f.session, f.writing, f.session.answers[f.writing.id]),
    ).toBe("insufficient");
    f.review.wordCountCorrection = { ...correction(f, 70), role: "self" };
    f.review.role = "self";
    expect(writingWordCount(f.session, f.writing)).toBe(70);
    expect(
      writingStatus(f.session, f.writing, f.session.answers[f.writing.id]),
    ).toBe("expert");
    expect(literacyEligibility(f.session).acceptedCount).toBe(0);
    f.session.answers[f.writing.id] = "";
    expect(writingStatus(f.session, f.writing, "")).toBe("skipped");
    expect(writingWordCount(f.session, f.writing)).toBe(0);
  });
  it("139/140 для грамотности опираются на ручной объём только зафиксированной содержательной проверки", () => {
    const f = work(139);
    expect(literacyEligibility(f.session)).toEqual({
      total: 139,
      acceptedCount: 1,
      eligible: false,
    });
    f.review.wordCountCorrection = correction(f, 140);
    expect(literacyEligibility(f.session)).toEqual({
      total: 0,
      acceptedCount: 0,
      eligible: false,
    });
    f.review.reviewedWordCount = 140; // The synthetic human explicitly fixes the updated count and content.
    expect(literacyEligibility(f.session)).toEqual({
      total: 140,
      acceptedCount: 1,
      eligible: true,
    });
    f.review.reviewedAt = undefined;
    expect(literacyEligibility(f.session)).toEqual({
      total: 0,
      acceptedCount: 0,
      eligible: false,
    });
  });
  it("новая оценка и ручной объём не применяются к чужому ответу даже при сохранённой дате", () => {
    const f = work();
    f.review.wordCountCorrection = correction(f, 140);
    f.session.answers[f.writing.id] += "Другая мысль.";
    expect(currentWordCountCorrection(f.session, f.writing)).toBeUndefined();
    expect(
      writingStatus(f.session, f.writing, f.session.answers[f.writing.id]),
    ).toBe("expert");
    expect(literacyEligibility(f.session).acceptedCount).toBe(0);
  });
  it("изменение и возврат прежнего ответа сохраняют черновые баллы и причину, но никогда не оживляют фиксацию или ручной подсчёт", () => {
    const f = work();
    f.review.wordCountCorrection = correction(f, 140);
    f.session.writingReviews![literacyReviewId] = {
      ...f.review,
      wordCountCorrection: undefined,
      promptId: undefined,
      writingRevision: undefined,
      answerText: undefined,
      scores: {},
    };
    const old = f.session.answers[f.writing.id];
    const edited = advanceSession(f.session, {
      answers: { [f.writing.id]: old + "Новый вывод." },
    });
    expect(edited.writingReviews![f.key].reviewedAt).toBeUndefined();
    expect(edited.writingReviews![f.key].scores).toEqual(f.review.scores);
    expect(edited.writingReviews![f.key].wordCountCorrection?.reason).toBe(
      f.review.wordCountCorrection.reason,
    );
    expect(edited.writingReviews![literacyReviewId].reviewedAt).toBeUndefined();
    const reverted = advanceSession(edited, {
      answers: { [f.writing.id]: old },
    });
    expect(currentWordCountCorrection(reverted, f.writing)).toBeUndefined();
    expect(writingWordCount(reverted, f.writing)).toBe(139);
    expect(literacyEligibility(reverted).eligible).toBe(false);
  });
  it("смена 13.1→13.2→13.1 не оживляет прежние оценки и ручной объём", () => {
    const f = work();
    f.review.wordCountCorrection = correction(f, 140);
    const other = advanceSession(f.session, {
      selectedPrompts: { [f.writing.id]: "13.2" },
    });
    const returned = advanceSession(other, {
      selectedPrompts: { [f.writing.id]: f.promptId },
    });
    expect(returned.writingReviews![f.key].reviewedAt).toBeUndefined();
    expect(returned.writingReviews![f.key].note).toBe(f.review.note);
    expect(
      returned.writingReviews![f.key].wordCountCorrection?.invalidatedAt,
    ).toBeDefined();
    expect(writingWordCount(returned, f.writing)).toBe(139);
    expect(literacyEligibility(returned).acceptedCount).toBe(0);
  });
  it("экспорт/импорт и отдельный mutable state сохраняют автора, дату, причину и связь, старые листы продолжают читаться", () => {
    const f = work();
    f.review.wordCountCorrection = correction(f, 140);
    const restored = importSessions(exportSessions([f.session]))[0];
    expect(restored.writingReviews![f.key]).toEqual(f.review);
    expect(writingWordCount(restored, f.writing)).toBe(140);
    const state = sessionState(restored);
    expect(applySessionState(f.session, state)?.writingReviews![f.key]).toEqual(
      f.review,
    );
    delete f.review.wordCountCorrection;
    delete f.review.answerText;
    delete f.review.writingRevision;
    expect(
      parseSession(JSON.stringify(f.session))?.writingReviews![f.key],
    ).toEqual(f.review);
  });
  it("пустая причина/имя, другая тема/редакция и дата до работы отклоняются контрактом сохранения", () => {
    for (const patch of [
      { reason: " " },
      { reviewer: " " },
      { promptId: "13.2" },
      { writingRevision: 999 },
      { recordedAt: "2000-01-01T00:00:00.000Z" },
    ]) {
      const f = work();
      f.review.wordCountCorrection = { ...correction(f, 140), ...patch };
      expect(parseSession(JSON.stringify(f.session))).toBeUndefined();
      expect(applySessionState(f.session, f.session)).toBeUndefined();
    }
  });
});
