import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import raw from "../content/oge-writing-workshops.json";
import materials from "../apps/showcase/src/oge/materials.json";
import guides from "../apps/showcase/src/oge/writing-guides.json";
import { writingWorkshopPacketSchema } from "../apps/showcase/src/oge/writing-workshop-model";
import { wordCount } from "../apps/showcase/src/oge/word-count";
import { specification } from "../apps/showcase/src/oge/specification";

const packet = writingWorkshopPacketSchema.parse(raw);
describe("Письменные операции: образцы и основания оценивания", () => {
  it("связывает каждый практикум с точной редакцией источника, задания и темы", () => {
    expect(packet.model.specificationId).toBe(specification.id);
    expect(packet.model.status).toBe("project");
    for (const workshop of packet.workshops) {
      const writing = materials.writing.find((item) => item.id === workshop.writingId);
      const source = materials.texts.find((item) => item.id === workshop.sourceTextId);
      expect(writing?.revision).toBe(workshop.writingRevision);
      expect(writing?.sourceTextId).toBe(source?.id);
      expect(writing?.prompts.some((prompt) => prompt.id === workshop.promptId)).toBe(true);
      expect(source?.revision).toBe(workshop.sourceTextRevision);
      for (const task of workshop.microtasks)
        for (const quote of task.sourceExcerpt.split(" […] "))
          expect(source?.paragraphs.join(" ").includes(quote)).toBe(true);
    }
  });
  it("сохраняет независимые контрольные суммы и не выдаёт короткий фрагмент за полный образец", () => {
    const samples = packet.workshops.flatMap((workshop) => workshop.samples);
    expect(samples).toHaveLength(12);
    for (const sample of samples) {
      expect(createHash("sha256").update(sample.text).digest("hex")).toBe(sample.textSha256);
      expect(wordCount(sample.text)).toBeGreaterThanOrEqual(70);
      expect(sample.review.teacherApproval).toBe("pending");
    }
  });
  it("фиксирует педагогически разные основания баллов, а не одну оценку на все уровни", () => {
    const summary = packet.workshops.find((workshop) => workshop.promptId === "1")!;
    expect(summary.samples.map((sample) => sample.contentScores.map((score) => score.score))).toEqual([[2, 2, 2], [1, 1, 2], [0, 0, 1]]);
    for (const workshop of packet.workshops.filter((workshop) => workshop.promptId !== "1"))
      expect(workshop.samples.map((sample) => sample.contentScores.map((score) => score.score))).toEqual([[1, 4, 2, 1], [1, 3, 2, 1], [1, 1, 2, 1]]);
    // Недостаток примера/пояснения учитывается по СК2; повторный выдуманный штраф за логику не добавлен.
  });
  it("сверяет ранее опубликованные сильные тексты с редакцией соответствующего разбора", () => {
    for (const workshop of packet.workshops)
      for (const sample of workshop.samples.filter((sample) => !!sample.origin)) {
        const guide = guides.guides.find((item) => item.id === sample.origin!.guideId)!;
        expect(guide.revision).toBe(sample.origin!.guideRevision);
        expect(guide.routes.find((route) => route.promptId === workshop.promptId)?.[sample.origin!.variant].text).toBe(sample.text);
      }
  });
  it("отклоняет невозможный балл и замечание к отсутствующему фрагменту", () => {
    const impossible = structuredClone(raw);
    impossible.workshops[0].samples[0].contentScores[0].score = 9;
    expect(writingWorkshopPacketSchema.safeParse(impossible).success).toBe(false);
    const wrongQuote = structuredClone(raw);
    wrongQuote.workshops[0].samples[0].comments[0].quote = "Несуществующая строка образца";
    expect(writingWorkshopPacketSchema.safeParse(wrongQuote).success).toBe(false);
  });
  it("не применяет критерии сочинения к изложению и не пропускает неизвестную операцию", () => {
    const wrongPrompt = structuredClone(raw);
    wrongPrompt.workshops[0].promptId = "13.1";
    expect(writingWorkshopPacketSchema.safeParse(wrongPrompt).success).toBe(false);
    const missingOperation = structuredClone(raw);
    missingOperation.workshops[0].microtasks[0].operationId = "unknown-writing-operation";
    expect(writingWorkshopPacketSchema.safeParse(missingOperation).success).toBe(false);
  });
  it("оставляет свободные ответы для содержательной проверки и не подменяет их тестовым ключом", () => {
    expect(packet.operations).toHaveLength(8);
    const tasks = packet.workshops.flatMap((workshop) => workshop.microtasks);
    expect(tasks).toHaveLength(13);
    for (const operation of packet.operations) expect(tasks.some((task) => task.operationId === operation.id)).toBe(true);
    for (const task of tasks) {
      expect(task.responseKind).toBe("free-text");
      expect("answer" in task).toBe(false);
      expect("expected" in task).toBe(false);
      expect(task.reviewQuestions.length).toBeGreaterThanOrEqual(3);
    }
  });
});
