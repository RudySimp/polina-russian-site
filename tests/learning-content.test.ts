import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import type { Exercise, Lesson } from "../apps/showcase/src/content/model";
import { wordCount, gradeExercise } from "../apps/showcase/src/oge/engine";
import guidesData from "../apps/showcase/src/oge/writing-guides.json";
import materials from "../apps/showcase/src/oge/materials.json";
import readingPackage from "../content/audit-new-reading.json";

const lesson = (id: string) => JSON.parse(fs.readFileSync(path.join("apps/showcase/src/content/lessons", `${id}.json`), "utf8")) as Lesson;
const conclusions: Record<string, string[]> = {
  "analiz-teksta": ["Не подтверждено", "Не подтверждено", "Противоречит", "Не подтверждено", "Не подтверждено"],
  "glasnye-v-tekste": ["Е", "И", "Е", "И", "Ё"],
  "izlozhenie": ["Он взял принадлежности для рисования.", "При нехватке данных вывод откладывают.", "Друг поддержал самостоятельную работу.", "Дождь размочил тропу.", "Не зная ответа, он решил проверить сведения."],
  "leksika": ["Признательный = благодарный", "Охотно = с желанием", "Устойчивое выражение", "Открыта", "предусмотрительности"],
  "orfograficheskiy-analiz": ["С перед глухим П в приставке бес-", "ЕК: гласная выпадает", "И перед суффиксом -а- в бир-/бер-", "Ъ после приставки на согласную перед Е", "ПРИ-: близость"],
  "punktuacionnye-pravila": ["Тире между главными членами-инфинитивами", "Вторая часть раскрывает содержание понимания", "Следствие в бессоюзном сложном", "Обособленное обстоятельство", "Повторяющийся союз при однородных сказуемых"],
  "sochinenie": ["Ему важна помощь, а не публичное признание.", "Признание было добровольным и направлено на восстановление честности.", "Поддержка помогла вернуться к самостоятельному выступлению.", "Метафора показывает связь между поколениями.", "Он предпочёл доказательство удобной догадке."],
  "vyrazitelnost": ["Олицетворение", "Сравнение", "Метафора", "Фразеологизм", "Нейтральное указание материала"],
};

describe("Reviewed lesson decisions", () => {
  it.each(Object.entries(conclusions))("keeps the independently interpreted conclusions in %s", (id, expected) => {
    const comparisons = lesson(id).sections.flatMap((section) => section.blocks).find((block) => block.type === "interactive" && block.data.kind === "comparison");
    expect(comparisons?.type).toBe("interactive");
    if (!comparisons || comparisons.type !== "interactive") return;
    const examples = comparisons.data.examples;
    expect(examples.map((example) => example.options?.[example.expected[0] - 1])).toEqual(expected);
    expect(examples.filter((example) => example.expected[0] === 1).length).toBeGreaterThanOrEqual(2);
    expect(examples.filter((example) => example.expected[0] === 2).length).toBeGreaterThanOrEqual(2);
  });
  it("grounds each essay inference in visible facts instead of supplying missing motives", () => {
    const value = lesson("sochinenie");
    expect(value.revision).toBeGreaterThanOrEqual(4);
    const block = value.sections.flatMap((section) => section.blocks).find((candidate) => candidate.type === "interactive" && candidate.data.kind === "comparison");
    if (!block || block.type !== "interactive") throw new Error("Essay comparison is missing");
    const cases = block.data.examples;
    // The review independently identified the missing premises. These assertions
    // keep that evidence visible to pupils; they do not claim to infer logic automatically.
    const premises = [
      ["вместе с соседями восстановил скамейку", "чтобы людям было удобно", "а не чтобы меня хвалили"],
      ["Никто не заметил", "Она сама сказала", "исправить обман и назвать автора"],
      ["Друг продолжил отбивать ритм", "Попробуй вступить ещё раз", "Музыкант снова заиграл сам"],
      ["письмо бабушки о её детстве", "семейную историю", "связывает воспоминания бабушки с внучкой"],
      ["предложили угадать", "По одной догадке нельзя делать вывод", "лишь после наблюдения"],
    ];
    expect(cases).toHaveLength(5);
    for (let index = 0; index < premises.length; index += 1) {
      for (const fact of premises[index]) expect(cases[index].text, "case " + (index + 1) + ": " + fact).toContain(fact);
      expect(cases[index].explanation.length).toBeGreaterThan(100);
    }
    expect(cases.map((example) => example.expected[0])).toEqual([2, 1, 2, 1, 1]);
  });
  it("gives every OGE lesson addressable detailed paragraphs and preserves revisions", () => {
    for (const filename of fs.readdirSync("apps/showcase/src/content/lessons")) {
      const value = lesson(filename.replace(/\.json$/u, ""));
      if (value.topicId === "udarenie") continue;
      expect(value.revision, value.topicId).toBeGreaterThanOrEqual(3);
      expect(value.sections.length, value.topicId).toBeGreaterThanOrEqual(9);
      expect(new Set(value.sections.map((section) => section.id)).size).toBe(value.sections.length);
      expect(value.provenance.every((source) => source.teacherApproval === "pending")).toBe(true);
    }
  });
});

describe("Writing learning cycles", () => {
  it("links all 29 routes to the exact writing and source revisions", () => {
    expect(guidesData.schemaVersion).toBe(1);
    const writing = [...materials.writing, ...readingPackage.writing.filter((item) => !materials.writing.some((current) => current.id === item.id))];
    const texts = [...materials.texts, ...readingPackage.texts.filter((item) => !materials.texts.some((current) => current.id === item.id))];
    expect(guidesData.guides.length).toBe(13);
    expect(guidesData.guides.reduce((sum, guide) => sum + guide.routes.length, 0)).toBe(29);
    for (const guide of guidesData.guides) {
      const assignment = writing.find((item) => item.id === guide.writingId)!;
      const source = texts.find((item) => item.id === guide.sourceTextId)!;
      expect(assignment, guide.id).toBeDefined();
      expect(guide.writingRevision).toBe(assignment.revision);
      expect(guide.sourceTextId).toBe(assignment.sourceTextId);
      expect(guide.sourceTextRevision).toBe(source.revision);
      expect(guide.routes.map((route) => route.promptId)).toEqual(assignment.prompts.map((prompt) => prompt.id));
    }
  });
  it("uses the corrected yard wording in the stage and full strong response", () => {
    const guide = guidesData.guides.find((item) => item.writingId === "essay-audit-yard")!;
    const route = guide.routes.find((item) => item.promptId === "13.1")!;
    expect(guide.revision).toBeGreaterThanOrEqual(2);
    expect(route.stages.some((stage) => stage.explanation.includes("побуждает других присоединиться"))).toBe(true);
    expect(route.strong.text).toContain("побуждает других присоединиться");
    expect(JSON.stringify(guide)).not.toContain("вызывает новые участия");
  });
  it("teaches meaningful weaknesses at sufficient length without inventing expert scores", () => {
    for (const guide of guidesData.guides) {
      expect(guide.provenance.teacherApproval).toBe("pending");
      for (const route of guide.routes) {
        expect(wordCount(route.strong.text), `${guide.id}:${route.promptId}`).toBeGreaterThanOrEqual(70);
        expect(wordCount(route.weak.text), `${guide.id}:${route.promptId}`).toBeGreaterThanOrEqual(70);
        expect(route.plan.length).toBeGreaterThanOrEqual(3);
        expect(route.stages.length).toBeGreaterThanOrEqual(2);
        expect(route.strong.analysis.length).toBeGreaterThanOrEqual(3);
        expect(route.weak.analysis.length).toBeGreaterThanOrEqual(3);
        expect(route.criteriaNotes.length).toBeGreaterThanOrEqual(3);
        expect(route.checkpoints.length).toBeGreaterThanOrEqual(4);
        expect(route.strong).not.toHaveProperty("score");
        expect(route.weak).not.toHaveProperty("score");
      }
    }
  });
});

describe("New independently interpreted reading controls", () => {
  const find = (topic: string, source: string) => readingPackage.exercises.find((item) => item.id === `oge-${topic}-reading-audit-${source}`) as Exercise;
  // These expected decisions come from per-option textual/linguistic analysis,
  // rather than invoking the grader with an exercise's own answer field.
  it.each([
    ["voice", "14", "145", "135", "12345"],
    ["model", "2", "23", "3", "34"],
    ["yard", "1345", "12345", "1245", "12345"],
  ])("checks truth, inference and expressive boundaries in %s", (source, contentAnswer, falseContent, expressiveAnswer, falseExpressive) => {
    expect(gradeExercise(contentAnswer, find("analiz-teksta", source)).status).toBe("correct");
    expect(gradeExercise(falseContent, find("analiz-teksta", source)).status).toBe("incorrect");
    expect(gradeExercise(expressiveAnswer, find("vyrazitelnost", source)).status).toBe("correct");
    expect(gradeExercise(falseExpressive, find("vyrazitelnost", source)).status).toBe("incorrect");
  });
  it.each([
    ["voice", "упорство", "настойчивость"],
    ["model", "прочным", "прочный"],
    ["yard", "опустились руки", "руки"],
  ])("preserves the requested text form and phrase boundary in %s", (source, correct, incorrect) => {
    expect(gradeExercise(correct, find("leksika", source)).status).toBe("correct");
    expect(gradeExercise(incorrect, find("leksika", source)).status).toBe("incorrect");
  });
});
