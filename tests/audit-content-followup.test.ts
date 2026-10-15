import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { exercises, topics } from "../apps/showcase/src/content/registry";
import { lessons } from "../apps/showcase/src/content/library";
import subskills from "../apps/showcase/src/content/subskills.json";
import { reviewedSourceScope } from "../scripts/lib/source-scope.mjs";
import { matchingRuleMetadata } from "../scripts/lib/annotate-subskills.mjs";
import { answerDifference, feedbackRuleTargets } from "../apps/showcase/src/oge/rule-feedback";
import { exerciseRuleLinkIssues, rulePathIssue } from "../scripts/lib/rule-link-integrity";
import { validateContent } from "../scripts/validate-content";
const fixture = exercises.find((exercise) => exercise.id === "oge-punktuacionnye-pravila-002")!;
describe("Source numbers and OGE target lines", () => {
  it.each([
    ["22a3bc45d5c234759ec5ccb55c8dd0ad355d7e78dbb8294d7e2863f3b462c78f",9,"Правописание гласных в корне"],
    ["5760816d047c4226b7b46a2c36e8fd2744f9f7563870b1b922e30f4cc800a0c5",10,"Правописание приставок"],
    ["131b1895ad518e073a802c621d81829629b20d4ae02b930ce6e26e6ede949914",11,"Правописание суффиксов"],
    ["debdd6457f42451cc8d77b41f7e5fa5c9c1789ecf39db2a0f39a35596e4c442c",12,"Личные окончания глаголов и суффиксы причастий"],
  ])("keeps the source number separate for %s", (hash,number,theme) => {
    expect(reviewedSourceScope(String(hash))).toMatchObject({sourceExam:"unknown",sourceTaskNumber:number,sourceYear:null,targetOgeLines:[6,7],targetLiteracyCriteria:["ГК1"],taskLine:null,theme});
  });
  it("does not transfer a heading review to changed bytes", () => expect(reviewedSourceScope("0".repeat(64))).toBeNull());
});
describe("Matching errors are attached to the wrong pair", () => {
  it.each([
    ["125",[1],"OGE:4.address","introductory-address"],
    ["143",[2],"OGE:4.ellipsis","ellipsis-dash"],
    ["123",[1,2],"OGE:4.address","introductory-address"],
  ])("diagnoses answer %s without unrelated distractor skills", (answer,indices,skill,anchor) => {
    // Independently read the three rules: SSP, address, omitted predicate.
    expect(fixture.answers).toEqual(["145"]);
    const differences=answerDifference(fixture,String(answer));
    expect(differences.map((item)=>item.ruleIndex)).toEqual(indices);
    const diagnosis=feedbackRuleTargets(fixture,differences);
    expect(diagnosis.errorSkill).toBe(skill);
    expect(diagnosis.paths[0]).toBe("/theory/punktuacionnye-pravila/?exam=OGE#"+anchor);
    expect(diagnosis.errorSkill).not.toBe("OGE:4.homogeneous");
  });
  it("shows both relevant rules when two pairs are wrong", () => {
    expect(feedbackRuleTargets(fixture,answerDifference(fixture,"123")).paths).toEqual(["/theory/punktuacionnye-pravila/?exam=OGE#introductory-address","/theory/punktuacionnye-pravila/?exam=OGE#ellipsis-dash"]);
  });
  it("keeps unknown rules general and does not invent exact skill from the card", () => {
    const unknown={...fixture,rules:["Неизвестное основание","Другое неизвестное основание","Третье неизвестное основание"]};
    const metadata=matchingRuleMetadata(unknown,subskills);
    expect(metadata.every((item: {skillIds: string[]; rulePath: string})=>!item.skillIds.length && item.rulePath.endsWith("#match"))).toBe(true);
    const historical={...fixture,ruleElements:undefined};
    expect(feedbackRuleTargets(historical,answerDifference(historical,"123"))).toMatchObject({paths:["/theory/punktuacionnye-pravila/?exam=OGE#match"],errorSkill:undefined});
  });
  it("classifies each of the 32 current stated rules once with project metadata", () => {
    const matching=exercises.filter((exercise)=>exercise.exam==="OGE"&&exercise.input==="matching");
    expect(new Set(matching.flatMap((exercise)=>(exercise.rules??[]).map((rule)=>rule.replace(/^[АБВ]\)\s*/u,"")))).size).toBe(32);
    for(const exercise of matching){expect(exercise.ruleElements).toHaveLength(3);for(const item of exercise.ruleElements??[])expect(item.skillIds).toHaveLength(1);}
  });
});
describe("Exact theory links and particle wording", () => {
  it("rejects unknown, blank, and wrong-lesson anchors", () => {
    for(const path of ["/theory/punktuacionnye-pravila/?exam=OGE#algorithm","/theory/glasnye-v-tekste/?exam=OGE#algorithm","/theory/osnova/?exam=OGE#ellipsis-dash","/theory/osnova/?exam=OGE#"]){expect(rulePathIssue(path,lessons,topics)).toContain("раздел правила не найден");}
    expect(rulePathIssue("https://other.invalid/theory/osnova/#subject-forms",lessons,topics)).toBe("неверный маршрут правила");
  });
  it("checks all exercised metadata locations, not only the taxonomy", () => {
    expect(() => validateContent()).not.toThrow();
    const mutated=structuredClone(exercises);
    const value=mutated.find((exercise)=>exercise.id===fixture.id)!;
    value.elements![0].rulePath="/theory/punktuacionnye-pravila/?exam=OGE#missing";
    expect(()=>validateContent(mutated)).toThrow("раздел правила не найден");
    value.elements![0].rulePath=fixture.elements![0].rulePath;
    value.ruleElements![1].rulePath="/theory/punktuacionnye-pravila/?exam=OGE#missing-rule";
    expect(exerciseRuleLinkIssues(value,lessons,topics)).toContain("/theory/punktuacionnye-pravila/?exam=OGE#missing-rule: раздел правила не найден: missing-rule");
    for(const exercise of exercises) expect(exerciseRuleLinkIssues(exercise,lessons,topics),exercise.id).toEqual([]);
  });
  it("states unambiguously that particles are considered while the predicate stays simple", () => {
    const value=lessons.find((lesson)=>lesson.topicId==="osnova")!;
    const rule=value.sections.find((section)=>section.id==="predicate-boundaries")!.blocks.find((block)=>block.type==="rule"&&block.title==="Простое глагольное")!;
    expect(value.revision).toBeGreaterThanOrEqual(4);
    if(rule.type!=="rule")throw Error("Wrong block");
    expect(rule.text).toContain("учитывайте частицы «пусть», «бы», «не»");
    expect(rule.text).toContain("не превращает простое глагольное сказуемое в составное");
    expect(readFileSync("scripts/deepen-oge-lessons.mjs","utf8")).not.toContain("Частицы пусть, бы, не учитывайте");
  });
});
