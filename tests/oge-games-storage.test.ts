import { describe, expect, it } from "vitest";
import activities from "../apps/showcase/src/oge/activities.json" with { type: "json" };
import type { InteractiveActivity } from "../apps/showcase/src/oge/model";
import {
  gameOutcome,
  makeGameDraft,
  readGameDraft,
  readGameRecords,
  saveGameDraft,
  saveGameRecord,
  type GameRecord,
} from "../apps/showcase/src/oge/game-storage";
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    key: (n: number) => [...values.keys()][n] ?? null,
    get length() {
      return values.size;
    },
  };
}
const games = activities as InteractiveActivity[];
function record(activity = games[0]): GameRecord {
  const situation = activity.situations[0];
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    activityId: activity.id,
    situationId: situation.id,
    revision: situation.revision ?? 1,
    createdAt: new Date().toISOString(),
    snapshot: {
      kind: activity.kind,
      title: activity.title,
      topicId: activity.topicId,
      skillId: activity.skillId,
      situation: structuredClone(situation),
    },
    answers: Object.fromEntries(
      situation.fields
        .filter((field) => field.expected.length)
        .map((field) => [field.id, field.expected[0]]),
    ),
    firstIndependent: true,
    assisted: false,
  };
}
describe("Снимки и незавершённые действия тематических тренажёров", () => {
  it("смена редакции условия не меняет правильность сохранённой попытки", () => {
    const store = storage(),
      first = record();
    saveGameRecord(store, first);
    const current = structuredClone(games);
    current[0].situations[0].revision = 2;
    current[0].situations[0].fields[0].expected = ["2"];
    const history = readGameRecords(store, current);
    expect(history.records[0].correct).toBe(true);
    expect(history.records[0].stale).toBe(true);
    expect(history.records[0].snapshot.situation.fields[0].expected).toEqual(
      first.snapshot.situation.fields[0].expected,
    );
  });
  it("для проверки редакции достаточно компактных метаданных без текущего текста и ключа", () => {
    const store = storage(),
      first = record();
    saveGameRecord(store, first);
    const metadata = games.map((activity) => ({
      id: activity.id,
      situations: activity.situations.map((situation) => ({
        id: situation.id,
        revision: (situation.revision ?? 1) + 1,
      })),
    }));
    const raw = store.getItem("polina-oge-games-v2");
    const history = readGameRecords(store, metadata);
    expect(history.records[0]).toMatchObject({
      stale: true,
      correct: true,
      firstIndependent: true,
    });
    expect(history.records[0].snapshot.situation.text).toBe(
      first.snapshot.situation.text,
    );
    expect(store.getItem("polina-oge-games-v2")).toBe(raw);
  });
  it("снятый с публикации случай исторический, отсутствие метаданных не выдаёт ложную смену", () => {
    const store = storage();
    saveGameRecord(store, record());
    expect(readGameRecords(store).records[0].stale).toBe(false);
    expect(readGameRecords(store, []).records[0].stale).toBe(true);
    expect(
      readGameRecords(store, [{ id: games[0].id, situations: [] }]).records[0],
    ).toMatchObject({ stale: true, correct: true });
  });
  it("несогласованный номер редакции не перепроверяется и не уничтожает исходную запись", () => {
    const store = storage(),
      first = record();
    saveGameRecord(store, first);
    const changed = { ...first, revision: first.revision + 1 };
    store.setItem("polina-oge-games-v2", JSON.stringify([changed]));
    const raw = store.getItem("polina-oge-games-v2");
    expect(readGameRecords(store, games)).toMatchObject({
      records: [],
      damaged: 1,
    });
    expect(store.getItem("polina-oge-games-v2")).toBe(raw);
  });
  it("старая история без снимка остаётся исторической и не перепроверяется новым условием", () => {
    const store = storage();
    store.setItem(
      "polina-oge-games-v1",
      JSON.stringify([
        {
          id: "old",
          activityId: "foundation",
          situationId: "phase",
          revision: 1,
          createdAt: new Date().toISOString(),
          answers: { subject: "99" },
          correct: true,
        },
      ]),
    );
    const before = store.getItem("polina-oge-games-v1"),
      history = readGameRecords(store, games);
    expect(history.records).toEqual([]);
    expect(history.historic[0].historic).toBe(true);
    expect(history.historic[0]).not.toHaveProperty("correct");
    expect(store.getItem("polina-oge-games-v1")).toBe(before);
  });
  it("ввод, роль и самостоятельность восстанавливаются только для той же редакции", () => {
    const store = storage(),
      situation = games[0].situations[0];
    const draft = {
      ...makeGameDraft(games[0], situation),
      answers: { subject: "1" },
      role: "predicate" as const,
      checks: 1,
      hintUsed: true,
    };
    saveGameDraft(store, draft);
    expect(readGameDraft(store, games[0].id, situation)).toEqual(draft);
    expect(
      readGameDraft(store, games[0].id, { ...situation, revision: 2 }),
    ).toBeUndefined();
    expect(readGameDraft(store, games[0].id, situation)?.answers.subject).toBe(
      "1",
    );
  });
  it("сжатие без текста не считается завершённым; написание не получает автоматической оценки содержания", () => {
    const compression = games.find((game) => game.kind === "compression")!,
      situation = compression.situations[0];
    const answers = Object.fromEntries(
      situation.fields
        .filter((field) => field.expected.length)
        .map((field) => [field.id, field.expected[0]]),
    );
    expect(gameOutcome(compression.kind, situation, answers)).toMatchObject({
      informationCorrect: true,
      writingDraft: false,
      correct: false,
      requiresExpert: true,
    });
    expect(
      gameOutcome(compression.kind, situation, {
        ...answers,
        draft: "Это ещё требует проверки человеком.",
      }),
    ).toMatchObject({
      correct: false,
      informationCorrect: true,
      writingDraft: true,
      requiresExpert: true,
    });
  });
});
