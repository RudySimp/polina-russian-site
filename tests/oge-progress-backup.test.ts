import { describe, expect, it } from "vitest";
import {
  exportProgress,
  parseProgressBackup,
  restoreProgress,
} from "../apps/showcase/src/lib/progress-backup";
import { storageKey } from "../apps/showcase/src/progress";
class Memory {
  data = new Map<string, string>();
  get length() {
    return this.data.size;
  }
  key(n: number) {
    return [...this.data.keys()][n] ?? null;
  }
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
const reading = "polina-lesson-state-v2:osnova@4:reading";
const checkpoint = "polina-lesson-state-v2:osnova@4:subject:2";
function raw(entries: { key: string; value: string }[]) {
  return JSON.stringify({
    format: "polina-guest-progress",
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    entries,
  });
}
function attempt(id: string) {
  return {
    id,
    createdAt: "2026-10-15T00:00:00.000Z",
    exerciseId: "e",
    revision: 1,
    skillId: "s",
    repeat: false,
    results: [{ answer: "1", status: "correct", exerciseId: "e" }],
  };
}
describe("P2-06 separate guest progress copy", () => {
  it("roundtrips reading/checkpoint/steps/interactive and omits unrelated work and account keys", () => {
    const source = new Memory();
    source.setItem(
      reading,
      JSON.stringify({ read: ["subject"], last: "predicate" }),
    );
    source.setItem(checkpoint, JSON.stringify({ selected: 2, checked: true }));
    source.setItem("polina-lesson-state-v2:osnova@4:subject:1:steps", "2");
    source.setItem(
      "polina-lesson-state-v2:osnova@4:subject:3",
      JSON.stringify({
        index: 0,
        cases: { 0: { selected: [1], checked: true, checks: 1 } },
      }),
    );
    source.setItem("polina-oge-work-v1:x", "work");
    source.setItem("auth", "secret");
    source.setItem(
      "polina-lesson-state-v2:writing-workshop:session:topic:r1:task",
      JSON.stringify({
        text: "Свой тезис",
        firstAnswer: "Первый тезис",
        firstRecordedAt: "2026-10-15T00:00:00.000Z",
        revealed: true,
        assisted: true,
        selfReviewed: false,
      }),
    );
    const copy = exportProgress(source);
    expect(copy).not.toContain("secret");
    expect(copy).not.toContain("polina-oge-work");
    const target = new Memory();
    expect(restoreProgress(target, copy)).toEqual({ restored: 5, skipped: 0 });
    expect(target.getItem(reading)).toBe(source.getItem(reading));
    expect(parseProgressBackup(copy).schemaVersion).toBe(1);
  });
  it("preserves current reading and existing attempt with same id, adding only missing attempts", () => {
    const target = new Memory();
    target.setItem(reading, JSON.stringify({ read: ["new"] }));
    target.setItem(storageKey, JSON.stringify([attempt("kept")]));
    const copy = raw([
      { key: reading, value: JSON.stringify({ read: ["old"] }) },
      {
        key: storageKey,
        value: JSON.stringify([
          { ...attempt("kept"), repeat: true },
          attempt("added"),
        ]),
      },
    ]);
    expect(restoreProgress(target, copy)).toEqual({ restored: 1, skipped: 1 });
    expect(target.getItem(reading)).toContain("new");
    const records = JSON.parse(target.getItem(storageKey)!);
    expect(records).toHaveLength(2);
    expect(records[0].repeat).toBe(false);
    expect(restoreProgress(target, copy).restored).toBe(0);
  });
  it("validates every entry before writing and refuses unknown namespace, duplicates and mismatched game draft identity", () => {
    for (const bad of [
      { key: "auth", value: "null" },
      { key: checkpoint, value: '{"selected":-1,"checked":true}' },
      {
        key: "polina-oge-game-drafts-v2:a:b:1",
        value: JSON.stringify({
          schemaVersion: 2,
          activityId: "other",
          situationId: "b",
          revision: 1,
          answers: {},
          checked: false,
          checks: 0,
          hintUsed: false,
          role: "subject",
          updatedAt: new Date().toISOString(),
        }),
      },
    ]) {
      const target = new Memory();
      expect(() =>
        restoreProgress(
          target,
          raw([{ key: reading, value: '{"read":[]}' }, bad]),
        ),
      ).toThrow();
      expect(target.length).toBe(0);
    }
    expect(() =>
      parseProgressBackup(
        raw([
          { key: reading, value: '{"read":[]}' },
          { key: reading, value: '{"read":[]}' },
        ]),
      ),
    ).toThrow(/повторяется/);
  });
  it("rolls back all preceding changes when a later local storage write fails", () => {
    const target = new Memory();
    target.setItem(storageKey, JSON.stringify([attempt("existing")]));
    const before = [...target.data];
    const set = target.setItem.bind(target);
    target.setItem = (key, value) => {
      if (key === checkpoint) throw Error("quota");
      set(key, value);
    };
    expect(() =>
      restoreProgress(
        target,
        raw([
          { key: storageKey, value: JSON.stringify([attempt("new")]) },
          { key: reading, value: '{"read":[]}' },
          { key: checkpoint, value: '{"selected":1,"checked":true}' },
        ]),
      ),
    ).toThrow(/отменены/);
    expect([...target.data]).toEqual(before);
  });
  it("refuses a merge beyond the attempt reader limit without silently truncating either history", () => {
    const target = new Memory();
    target.setItem(
      storageKey,
      JSON.stringify(
        Array.from({ length: 1000 }, (_, n) => attempt(String(n))),
      ),
    );
    const before = target.getItem(storageKey);
    expect(() =>
      restoreProgress(
        target,
        raw([{ key: storageKey, value: JSON.stringify([attempt("extra")]) }]),
      ),
    ).toThrow(/1000/);
    expect(target.getItem(storageKey)).toBe(before);
  });
});
