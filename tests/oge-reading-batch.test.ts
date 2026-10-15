import { describe, expect, it } from "vitest";
import { exercises } from "../apps/showcase/src/content/registry";
import data from "../apps/showcase/src/oge/materials.json";
import { eligible, generateVariant, gradeExercise, validateVariant, type Materials } from "../apps/showcase/src/oge/engine";
const suffixes = ["subtitles", "printproof"] as const;
const itemFor = (topic: string, suffix: string) => exercises.find((item) => item.id === "oge-"+topic+"-reading-audit-"+suffix)!;

describe("Original reading groups preserve contextual grading", () => {
  it.each([
    ["subtitles","25","235"],
    ["printproof","4","45"],
  ])("distinguishes explicit facts from changed speaker, scope, and chronology in %s", (suffix,key,wrong) => {
    const item=itemFor("analiz-teksta",suffix);
    expect(eligible(item)).toBe(true);
    expect(gradeExercise(key,item).status).toBe("correct");
    expect(gradeExercise(wrong,item).status).toBe("incorrect");
    expect(item.options).toHaveLength(5);
    expect(item.optionExplanations).toHaveLength(5);
  });
  it("accepts all three actual comparisons without requiring the familiar two-answer pattern", () => {
    const item=itemFor("vyrazitelnost","subtitles");
    expect(gradeExercise("145",item).status).toBe("correct");
    for(const answer of ["14","45","15","12345"])expect(gradeExercise(answer,item).status).toBe("incorrect");
  });
  it("requires four metaphorical epithets while excluding the literal colour", () => {
    const item=itemFor("vyrazitelnost","printproof");
    expect(gradeExercise("1235",item).status).toBe("correct");
    expect(gradeExercise("12345",item).status).toBe("incorrect");
    expect(gradeExercise("135",item).status).toBe("incorrect");
    expect(item.optionExplanations[3]).toContain("буквально");
  });
  it("accepts either reviewed synonym from the requested range, but no answer from the next sentence", () => {
    const item=itemFor("leksika","subtitles");
    for(const answer of ["робко","несмело"])expect(gradeExercise(answer,item).status).toBe("correct");
    for(const answer of ["неловко","неуверенно","робко несмело"])expect(gradeExercise(answer,item).status).toBe("incorrect");
  });
  it("requires the actual antonym rather than an absent free synonym", () => {
    const item=itemFor("leksika","printproof");
    expect(gradeExercise("неторопливо",item).status).toBe("correct");
    for(const answer of ["неспешно","медленно","спокойно"])expect(gradeExercise(answer,item).status).toBe("incorrect");
  });
  it.each(suffixes)("keeps all reading lines and the three writing choices on one actual source for %s", (suffix) => {
    const textId="reading-audit-"+suffix;
    const materials={...data,exercises:exercises.filter((item)=>![10,11,12].includes(item.taskLine??0)||item.sourceTextId===textId)} as Materials;
    const variant=generateVariant(materials,"full","reading-review-"+suffix);
    expect(()=>validateVariant(variant,materials)).not.toThrow();
    const chosen=variant.assignments.map((ref)=>materials.exercises.find((item)=>item.id===ref.id)!).filter((item)=>[10,11,12].includes(item.taskLine??0));
    expect(chosen.map((item)=>item.sourceTextId)).toEqual([textId,textId,textId]);
    const writing=materials.writing.find((item)=>item.line===13&&variant.writingIds.includes(item.id))!;
    expect(writing.sourceTextId).toBe(textId);
    expect(writing.prompts.map((prompt)=>prompt.id)).toEqual(["13.1","13.2","13.3"]);
    expect(writing.analysis).toContain("Вопросы для смыслового чтения");
  });
});
