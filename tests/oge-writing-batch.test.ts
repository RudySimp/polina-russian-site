import { describe, expect, it } from "vitest";
import data from "../apps/showcase/src/oge/writing-guides.json";
import materials from "../apps/showcase/src/oge/materials.json";
import { wordCount } from "../apps/showcase/src/oge/word-count";
const ids=["essay-audit-subtitles","essay-audit-printproof"] as const;
describe("New original writing routes are complete and scoped to the chosen text",()=>{
  it.each(ids)("keeps all three prompts, actual stages, and contextual criteria for %s",(writingId)=>{
    const guide=data.guides.find((item)=>item.writingId===writingId)!;
    const writing=materials.writing.find((item)=>item.id===writingId)!;
    expect(guide.sourceTextId).toBe(writing.sourceTextId);
    expect(guide.writingRevision).toBe(writing.revision);
    expect(guide.routes.map((route)=>route.promptId)).toEqual(writing.prompts.map((prompt)=>prompt.id));
    for(const route of guide.routes){
      expect(wordCount(route.strong.text)).toBeGreaterThanOrEqual(70);
      expect(wordCount(route.weak.text)).toBeGreaterThanOrEqual(70);
      expect(route.criteriaNotes.map((note)=>note.code)).toEqual(["СК1","СК2","СК3","СК4"]);
      for(const stage of route.stages)expect(route.strong.text).toContain(stage.text+" "+stage.explanation);
      expect(route.weak.analysis.length).toBeGreaterThanOrEqual(3);
    }
    expect(guide.provenance.teacherApproval).toBe("pending");
  });
});
