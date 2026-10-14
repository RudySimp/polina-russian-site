import { describe, it, expect } from "vitest";
import { exercises } from "../apps/showcase/src/content/registry";
import { exerciseIndex } from "../apps/showcase/src/content/catalog";
import data from "../apps/showcase/src/oge/materials.json";
import {
  generateVariant,
  generateVariantMetadata,
  validateVariant,
  gradeExercise,
  sessionFromVariant,
  type Materials,
} from "../apps/showcase/src/oge/engine";
import {
  exportSessions,
  importSessions,
  reproductionFor,
} from "../apps/showcase/src/oge/backup";
const materials = { ...data, exercises } as Materials;
describe("Audit regression at the final condition boundary", () => {
  it("rejects unavailable positions and incomplete matching as input errors", () => {
    const matching = exercises.find((e) => e.taskLine === 4)!,
      numbered = exercises.find(
        (e) => e.taskLine === 5 && !e.text?.includes("(9)"),
      )!;
    expect(gradeExercise("9", numbered).status).toBe("format_error");
    for (const answer of ["12", "1234", "129", "111"])
      expect(gradeExercise(answer, matching).status, answer).toBe(
        "format_error",
      );
    const alternative = ["123", "124", "125", "132"].find(
      (a) => !matching.answers.includes(a),
    )!;
    expect(gradeExercise(alternative, matching).status).toBe("incorrect");
  });
  it("distinguishes a valid transformed phrase with exam whitespace policy from an unchanged relation", () => {
    const e = exercises.find((e) => e.id === "oge-slovosochetaniya-013")!;
    for (const answer of [
      "золотое кольцо",
      "золотоекольцо",
      " кольцо  золотое ",
    ])
      expect(gradeExercise(answer, e).status).toBe("correct");
    expect(gradeExercise("кольцо из золота", e).status).toBe("incorrect");
    expect(gradeExercise("gold ring", e).status).toBe("format_error");
  });
  it("gives the same checked composition from lightweight catalog and complete bank for repeated seeds", () => {
    for (const kind of ["full", "test"] as const)
      for (let n = 0; n < 30; n++) {
        const seed = "audit-seed-" + n,
          full = generateVariant(materials, kind, seed),
          plan = generateVariantMetadata(
            { ...materials, exercises: exerciseIndex },
            kind,
            seed,
          );
        expect(plan).toEqual(full);
        validateVariant(plan, {
          ...materials,
          exercises: exercises.filter((e) =>
            plan.assignments.some((ref) => ref.id === e.id),
          ),
        });
      }
  });
  it("only-new rejects reusing writing, associated source text or an audio revision", () => {
    const seenWritingIds = data.writing
      .filter((w) => w.line === 1)
      .map((w) => w.id + "@" + w.revision);
    expect(() =>
      generateVariantMetadata(
        { ...materials, exercises: exerciseIndex },
        "full",
        "writing-used",
        { only: "new", seenWritingIds },
      ),
    ).toThrow(/аудиозаписи изложения/u);
    const seenTextIds = data.texts
      .filter((t) => t.kind === "syntax")
      .map((t) => t.id + "@" + t.revision);
    expect(() =>
      generateVariantMetadata(
        { ...materials, exercises: exerciseIndex },
        "test",
        "texts-used",
        { only: "new", seenTextIds },
      ),
    ).toThrow(/2, 3/u);
    const seenAudioIds = data.audio.map((a) => a.id + "@" + a.revision);
    expect(() =>
      generateVariantMetadata(
        { ...materials, exercises: exerciseIndex },
        "full",
        "audio-used",
        { only: "new", seenAudioIds },
      ),
    ).toThrow(/аудиозаписи изложения/u);
  });
  it("keeps reproducible code and complete immutable conditions in validated backups after catalog change", () => {
    const variant = generateVariant(materials, "full", "saved-code"),
      session = sessionFromVariant(variant, materials, "learn", true),
      original = session.items[1];
    expect(reproductionFor(session).seed).toBe("saved-code");
    expect(session.catalogVersion).toMatch(/^[0-9a-f]{64}$/u);
    const backup = exportSessions([session]);
    const changed = structuredClone(materials);
    changed.exercises.forEach((e) => {
      e.prompt = "Новая редакция";
      e.revision++;
    });
    const restored = importSessions(backup)[0];
    expect(restored.items[1]).toEqual(original);
    expect(reproductionFor(restored)).toEqual(reproductionFor(session));
    expect(restored.catalogVersion).toBe(session.catalogVersion);
  });
});
