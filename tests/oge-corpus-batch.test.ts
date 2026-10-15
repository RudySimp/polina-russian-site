import { describe, expect, it } from "vitest";
import { exercises } from "../apps/showcase/src/content/registry";
import data from "../apps/showcase/src/oge/materials.json";
import { eligible, generateVariant, gradeExercise, validateVariant, type Materials } from "../apps/showcase/src/oge/engine";
const exercise = (topic: string, number: number) => exercises.find((item) => item.id === "oge-" + topic + "-" + String(number).padStart(3,"0"))!;

describe("Reviewed local forms preserve the contextual norm", () => {
  it.each([
    [14, ["мандаринов"], ["мандарин", "мандарины"]],
    [16, ["доктора"], ["докторы", "докторов"]],
    [25, ["полотенец"], ["полотенцев", "полотенца"]],
    [27, ["пути"], ["путя", "путей"]],
    [30, ["тоньше", "потоньше"], ["тонее", "тоньший"]],
    [31, ["шестьюдесятью"], ["шестидесятью", "шестьюдесяти"]],
    [32, ["четырёмстам", "четыремстам"], ["четырёхстам", "четыреста"]],
    [33, ["обеими"], ["обоими", "обеих"]],
  ])("grades contextual form %s and rejects plausible wrong inflections", (number, accepted, rejected) => {
    const item = exercise("formy-slov", Number(number));
    expect(eligible(item)).toBe(true);
    for (const answer of accepted) expect(gradeExercise(String(answer),item).status, String(answer)).toBe("correct");
    for (const answer of rejected) expect(gradeExercise(String(answer),item).status, String(answer)).toBe("incorrect");
    expect(gradeExercise("более тонкая",exercise("formy-slov",30)).status).toBe("format_error");
  });
});

describe("Phrase conversion keeps the head word and requested relation", () => {
  it.each([
    [17,["прогулки зимой","зимой прогулки"],["зимние прогулки","гулять зимой"]],
    [20,["прошептал тревожно","тревожно прошептал"],["прошептал с тревогой","тревожный шёпот"]],
    [21,["говорил с лаской","с лаской говорил"],["говорил ласково","ласковый разговор"]],
    [26,["кожаные перчатки","перчатки кожаные"],["перчатки из кожи","перчатки с кожей"]],
  ])("accepts both checked orders for phrase %s without accepting a different transformation", (number, accepted, rejected) => {
    const item = exercise("slovosochetaniya",Number(number));
    expect(item.shortAnswerConstraints?.requiredWords).toEqual([{17:"прогулки",20:"прошептал",21:"говорил",26:"перчатки"}[Number(number) as 17|20|21|26]]);
    for (const answer of accepted) {
      expect(gradeExercise(String(answer),item).status).toBe("correct");
      expect(gradeExercise(String(answer).replaceAll(" ",""),item).status).toBe("correct");
    }
    for (const answer of rejected) expect(gradeExercise(String(answer),item).status).toBe("incorrect");
  });
});

describe("Independently reviewed syntax pairs remain usable together", () => {
  it.each([
    ["oge-sintaksis-017","134","1345"],
    ["oge-sintaksis-019","134","1234"],
    ["oge-osnova-syntax-local-school-017","145","1245"],
    ["oge-osnova-syntax-local-school-019","235","1235"],
  ])("retains reviewed key and excludes the diagnosed distractor for %s", (id,key,wrong) => {
    const item = exercises.find((record)=>record.id===id)!;
    expect(item.options).toHaveLength(5);
    expect(item.optionExplanations).toHaveLength(5);
    expect(gradeExercise(key,item).status).toBe("correct");
    expect(gradeExercise(wrong,item).status).toBe("incorrect");
  });
  it.each(["syntax-local-school-017","syntax-local-school-019"])("generates and validates a full work using the actual new source group %s", (textId) => {
    const bank = exercises.filter((item)=>![2,3].includes(item.taskLine??0)||item.sourceTextId===textId);
    const materials = {...data,exercises:bank} as Materials;
    const variant = generateVariant(materials,"full","reviewed-local-"+textId);
    expect(()=>validateVariant(variant,materials)).not.toThrow();
    const chosen = variant.assignments.filter((item)=>[2,3].includes(bank.find((entry)=>entry.id===item.id)!.taskLine??0));
    expect(chosen).toHaveLength(2);
    expect(chosen.map((item)=>bank.find((entry)=>entry.id===item.id)!.sourceTextId)).toEqual([textId,textId]);
    expect(variant.sourceTextIds).toContain(textId);
  });
});
