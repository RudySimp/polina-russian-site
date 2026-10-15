import { z } from "zod";

const criterionCode = z.enum(["ИК1", "ИК2", "ИК3", "СК1", "СК2", "СК3", "СК4"]);
const text = z.string().trim().min(1);
const review = z.object({
  mode: z.literal("editorial"),
  by: text,
  date: text,
  teacherApproval: z.literal("pending"),
});
const evidence = z.object({ quote: text, comment: text });
const sampleSchema = z.object({
  id: text,
  label: text,
  level: z.enum(["strong", "developing", "needs-work"]),
  text,
  textSha256: z.string().regex(/^[a-f0-9]{64}$/u),
  contentScores: z.array(z.object({ code: criterionCode, score: z.number().int().min(0), reason: text, evidence: z.array(evidence).min(1) })).min(1),
  contentTotal: z.number().int().min(0),
  contentMax: z.union([z.literal(6), z.literal(8)]),
  comments: z.array(z.object({ quote: text, criterionCode, reason: text, nextAction: text })).min(1),
  review,
  origin: z.object({ kind: z.literal("existing-guide"), guideId: text, guideRevision: z.number().int().positive(), variant: z.enum(["strong", "weak"]) }).optional(),
}).superRefine((sample, context) => {
  const maxima = { ИК1: 2, ИК2: 2, ИК3: 2, СК1: 1, СК2: 4, СК3: 2, СК4: 1 };
  if (new Set(sample.contentScores.map((score) => score.code)).size !== sample.contentScores.length)
    context.addIssue({ code: "custom", message: "Повтор критерия образца" });
  for (const score of sample.contentScores) {
    if (score.score > maxima[score.code]) context.addIssue({ code: "custom", message: "Баллы за пределами критерия" });
    for (const item of score.evidence)
      if (!sample.text.includes(item.quote)) context.addIssue({ code: "custom", message: "Фрагмент оценки отсутствует в образце" });
  }
  for (const item of sample.comments)
    if (!sample.text.includes(item.quote)) context.addIssue({ code: "custom", message: "Замечание относится к отсутствующему фрагменту" });
  if (sample.contentTotal !== sample.contentScores.reduce((sum, score) => sum + score.score, 0))
    context.addIssue({ code: "custom", message: "Сумма содержательных баллов не совпадает" });
  if (sample.contentMax !== sample.contentScores.reduce((sum, score) => sum + maxima[score.code], 0))
    context.addIssue({ code: "custom", message: "Максимум не соответствует набору критериев" });
});
const microtaskSchema = z.object({
  id: text,
  operationId: text,
  instruction: text,
  sourceExcerpt: text,
  responseKind: z.literal("free-text"),
  sampleAnswer: text,
  reviewQuestions: z.array(text).min(1),
  commonError: text,
});
const workshopSchema = z.object({
  id: text,
  revision: z.number().int().positive(),
  writingId: text,
  writingRevision: z.number().int().positive(),
  sourceTextId: text,
  sourceTextRevision: z.number().int().positive(),
  promptId: text,
  title: text,
  operationIds: z.array(text).min(1),
  samples: z.array(sampleSchema).min(2),
  microtasks: z.array(microtaskSchema).min(1),
  wholeAnswerTask: z.object({ instruction: text, minimumWords: z.literal(70), reviewRequired: z.literal(true) }),
}).superRefine((workshop, context) => {
  const expectedCodes = workshop.promptId === "1" ? ["ИК1", "ИК2", "ИК3"] : ["СК1", "СК2", "СК3", "СК4"];
  for (const sample of workshop.samples) {
    if (sample.contentScores.length !== expectedCodes.length || expectedCodes.some((code) => !sample.contentScores.some((score) => score.code === code)))
      context.addIssue({ code: "custom", message: "Образец не соответствует критериям своей темы" });
  }
  if (new Set(workshop.microtasks.map((task) => task.id)).size !== workshop.microtasks.length)
    context.addIssue({ code: "custom", message: "Повтор микрозадачи" });
});
export const writingWorkshopPacketSchema = z.object({
  schemaVersion: z.literal(1),
  model: z.object({ specificationId: text, year: z.literal(2027), status: z.literal("project"), sourceUrl: z.url(), sourcePageUrl: z.url(), documentSha256: z.string().regex(/^[a-f0-9]{64}$/u), physicalPdfPages: z.array(z.number().int().positive()), printedPages: z.array(z.number().int().positive()), checkedAt: text }),
  assessmentNotice: text,
  review,
  operations: z.array(z.object({ id: text, line: z.union([z.literal(1), z.literal(13)]), title: text, criteriaCodes: z.array(criterionCode).min(1) })).min(1),
  workshops: z.array(workshopSchema).min(1),
}).superRefine((packet, context) => {
  const operationIds = new Set(packet.operations.map((operation) => operation.id));
  if (operationIds.size !== packet.operations.length || new Set(packet.workshops.map((workshop) => workshop.id)).size !== packet.workshops.length)
    context.addIssue({ code: "custom", message: "Повтор идентификатора учебного маршрута" });
  for (const workshop of packet.workshops) {
    for (const id of workshop.operationIds)
      if (!operationIds.has(id)) context.addIssue({ code: "custom", message: "Неизвестная письменная операция" });
    for (const task of workshop.microtasks)
      if (!workshop.operationIds.includes(task.operationId)) context.addIssue({ code: "custom", message: "Микрозадача не связана с операцией маршрута" });
  }
});
export type WritingWorkshopPacket = z.infer<typeof writingWorkshopPacketSchema>;
export type ScoredWritingSample = WritingWorkshopPacket["workshops"][number]["samples"][number];
export type WritingMicrotask = WritingWorkshopPacket["workshops"][number]["microtasks"][number];
