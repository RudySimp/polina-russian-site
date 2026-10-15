import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { nextGameControl } from "../apps/showcase/src/oge/game-control";
import {
  makeGameDraft,
  gameDraftSchema,
  gameRecordSchema,
  gameOutcome,
} from "../apps/showcase/src/oge/game-storage";
import { checkActivity } from "../apps/showcase/src/oge/game-check";
import type { InteractiveActivity } from "../apps/showcase/src/oge/model";
const data = JSON.parse(
  readFileSync("apps/showcase/src/oge/activities.json", "utf8"),
) as InteractiveActivity[];
const source = JSON.parse(
  readFileSync("content/oge-game-control-cases.json", "utf8"),
);
const foundation = data.find((a) => a.kind === "foundation")!;
describe("Independent game control keeps old conditions and distinguishes assistance", () => {
  it("preserves all previous 70 conditions and keys exactly while adding two cases per mechanic", () => {
    const added = new Set(
      source.activities.flatMap(
        (a: { activityId: string; situations: { id: string }[] }) =>
          a.situations.map((s) => a.activityId + ":" + s.id),
      ),
    );
    const before = data.map((a) => ({
      ...a,
      situations: a.situations.filter((s) => !added.has(a.id + ":" + s.id)),
    }));
    expect(
      createHash("sha256").update(JSON.stringify(before)).digest("hex"),
    ).toBe(source.baseline.sha256);
    expect(before.reduce((n, a) => n + a.situations.length, 0)).toBe(70);
    expect(data.every((a) => a.situations.length === 12)).toBe(true);
    expect(added.size).toBe(14);
  });
  it("prefers an unseen case of the same actual specific skill", () => {
    const target = foundation.situations.find(
      (s) => s.id === "control-other-agent",
    )!;
    const current = {
      ...foundation.situations[0],
      skillIds: ["OGE:2.compound-verbal"],
    };
    const chosen = nextGameControl(
      {...foundation, situations:[current,{...foundation.situations[1],skillIds:[]},target]},
      current,
      [],
      [],
      () => undefined,
    )!;
    expect(chosen.situation).toBe(target);
    expect(chosen.matchedSkillIds).toEqual(["OGE:2.compound-verbal"]);
  });
  it("never calls a broad label an exact diagnostic match", () => {
    const current = {
      ...foundation.situations[0],
      skillIds: ["OGE:syntax.foundation"],
    };
    expect(
      nextGameControl(foundation, current, [], [], () => undefined)!
        .matchedSkillIds,
    ).toEqual([]);
  });
  it("excludes historical conditions and any previously opened draft, even without a check", () => {
    const chosen = nextGameControl(
      foundation,
      foundation.situations[0],
      [
        {
          activityId: foundation.id,
          situationId: foundation.situations[1].id,
          revision: foundation.situations[1].revision ?? 1,
        },
      ],
      [{ activityId: foundation.id, situationId: foundation.situations[2].id }],
      (s) =>
        s.id === foundation.situations[3].id
          ? makeGameDraft(foundation, s)
          : undefined,
    )!;
    expect([0,1,2,3]).not.toContain(chosen.index);
    expect(
      nextGameControl(foundation, foundation.situations[0], [], [], (s) =>
        makeGameDraft(foundation, s),
      ),
    ).toBeUndefined();
  });
  it("round-trips the control source and retains pre-existing v2 drafts unchanged", () => {
    const old = makeGameDraft(foundation, foundation.situations[0]);
    expect(gameDraftSchema.parse(old)).toEqual(old);
    const control = {
      ...makeGameDraft(foundation, foundation.situations[1]),
      mode: "control" as const,
      controlFrom: {
        situationId: old.situationId,
        revision: old.revision,
        matchedSkillIds: [],
      },
    };
    expect(gameDraftSchema.parse(control)).toEqual(control);
    const record = {
      schemaVersion: 2,
      id: crypto.randomUUID(),
      activityId: foundation.id,
      situationId: control.situationId,
      revision: control.revision,
      createdAt: control.updatedAt,
      answers: {},
      snapshot: {
        kind: foundation.kind,
        title: foundation.title,
        topicId: foundation.topicId,
        skillId: foundation.skillId,
        situation: foundation.situations[1],
      },
      mode: control.mode,
      controlFrom: control.controlFrom,
      firstIndependent: true,
      assisted: false,
    };
    expect(gameRecordSchema.parse(record)).toEqual(record);
  });
  it("checks concrete new counterexamples instead of including an infinitive with a different agent", () => {
    const other = foundation.situations.find(
      (s) => s.id === "control-other-agent",
    )!;
    expect(
      checkActivity(other, { subject: "1", predicate: "2" }).every(
        (r) => r.correct,
      ),
    ).toBe(true);
    expect(
      checkActivity(other, { subject: "1", predicate: "2,4" }).every(
        (r) => r.correct,
      ),
    ).toBe(false);
  });
  it("keeps compression content under human review even for a complete selection and draft", () => {
    const compression = data.find((a) => a.kind === "compression")!,
      situation = compression.situations.find(
        (s) => s.id === "control-teamwork",
      )!;
    expect(
      gameOutcome("compression", situation, {
        essential: "1,2,3",
        draft:
          "Команда смогла закончить макет, когда участники разделили обязанности.",
      }),
    ).toEqual({
      informationCorrect: true,
      writingDraft: true,
      requiresExpert: true,
      correct: false,
    });
  });
  it("all new option keys belong to visible choices and work against their own saved conditions", () => {
    for (const a of data)
      for (const s of a.situations.filter((s) => s.id.startsWith("control-"))) {
        for (const f of s.fields)
          if (f.options)
            expect(
              f.expected.every((v) => f.options!.includes(v)),
              a.id + ":" + s.id + ":" + f.id,
            ).toBe(true);
        expect(
          checkActivity(
            s,
            Object.fromEntries(
              s.fields
                .filter((f) => f.expected.length)
                .map((f) => [f.id, f.expected[0]]),
            ),
          ).every((r) => r.correct),
        ).toBe(true);
      }
  });
});
