import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// This bounded merger never re-publishes previously admitted exercises.
const root = "apps/showcase/src";
const batchPath = "content/oge-corpus-batch-2026-10-15.json";
const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const batch = await read(batchPath);
const admission = await read("content/oge-corpus-admission-2026-10-15.json");
assert.equal(admission.mode, "checked-demo");
assert.equal(admission.teacherApproval, "pending");
assert.equal(admission.hashEncoding, "compact-json-v1");
assert.equal(createHash("sha256").update(JSON.stringify(batch)).digest("hex"), admission.sha256, "Changed batch requires independent review");
const candidates = await read("private-materials/import/candidates.json");
const inventory = await read("private-materials/import/inventory.json");
const manifest = await read("content/review-manifest.json");
const specification = await read(root + "/oge/specification.json");
const materials = await read(root + "/oge/materials.json");
const collections = new Map();
const pending = [];
const rephraseHeadWords = { 17: "прогулки", 20: "прошептал", 21: "говорил", 26: "перчатки" };
const upsert = (list, item) => {
  const index = list.findIndex((record) => record.id === item.id);
  if (index < 0) list.push(item);
  else {
    const derived = new Set(["elements", "ruleElements", "skillIds", "rulePaths", "classificationReview"]);
    const fields = Object.keys(item).filter((key) => !derived.has(key));
    assert.deepEqual(Object.fromEntries(fields.map((key) => [key, list[index][key]])), Object.fromEntries(fields.map((key) => [key, item[key]])), item.id + ": existing revision cannot be silently replaced");
  }
};
async function collection(topic) {
  if (!collections.has(topic)) collections.set(topic, await read(root + "/content/exercises/" + topic + ".json"));
  return collections.get(topic);
}
function receipt(item) {
  item.reviewStatus = "checked-demo";
  item.originCategory = "author-model";
  item.classificationReview = "editorial-draft";
  item.reviewStages = ["answer-checked", "explanation-checked", "publication-approved"].map((stage) => ({ stage, at: admission.reviewedAt, by: admission.reviewedBy }));
  item.publicationReview = { revision: item.revision, by: admission.reviewedBy, at: admission.reviewedAt, mode: "checked-demo", condition: true, key: true, alternatives: true, explanation: true, rights: true };
  return item;
}
function base(line, topicId, topicTitle) {
  const config = specification.lines.find((item) => item.number === line);
  assert(config && config.response !== "extended");
  return { revision: 1, topicId, topicSlug: topicId, topicTitle, exam: "OGE", responseKind: config.response, answers: [], maxScore: 1, policy: { version: 1, trim: true, caseSensitive: false, collapseSpaces: config.response === "short_text", allowYoAsE: [8,9,12].includes(line), orderMatters: config.orderMatters, allowDigitSeparators: false, minLength: config.minLength, maxLength: config.maxLength }, options: [], optionExplanations: [], formatLabel: "ОГЭ · " + topicTitle, input: config.input, level: "standard", taskLine: line, format: "exam-model", examModel: { year: specification.year, status: specification.status, sourceUrl: specification.sourceUrl }, elements: [] };
}
for (const entry of batch.approved) {
  const candidate = candidates.find((item) => item.id === entry.candidateId);
  const source = inventory.inventory.find((item) => item.sourceId === candidate?.sourceId);
  assert(source?.declaredOriginal, entry.candidateId + ": no original declaration");
  assert.equal(candidate.fingerprint, entry.fingerprint);
  assert.deepEqual(candidate.question, entry.condition);
  assert.equal(candidate.answer, entry.answer);
  assert.equal(entry.answer, admission.localKeys[entry.candidateId]);
  assert(entry.acceptedAnswers.includes(entry.answer));
  const options = candidate.question.filter((line) => /^\d\)/u.test(line)).map((line) => line.replace(/^\d\)\s*/u, ""));
  const pair = batch.pairedSyntax.find((item) => item.candidateId === candidate.id);
  const id = "oge-" + entry.topicId + "-" + String(candidate.sourceNumber).padStart(3, "0");
  const item = receipt({ ...base(entry.taskLine, entry.topicId, entry.topicTitle), id, slug: id, title: entry.title, prompt: entry.taskLine === 3 ? candidate.question.find((line) => /^Укажите/u.test(line)) : candidate.question[0], ...(pair ? { sourceTextId: pair.sourceTextId } : candidate.question[1] ? { text: candidate.question[1] } : {}), answers: entry.acceptedAnswers, options, optionExplanations: entry.optionExplanations ?? [], steps: entry.steps, hint: entry.hint, explanation: entry.explanation.join("\n\n"), instruction: entry.taskLine === 8 ? "Запишите одно слово. Ё можно заменить на Е." : entry.taskLine === 9 ? "Запишите словосочетание. Принимаются только явно проверенные нормативные варианты. Ё можно заменить на Е." : "Запишите номера подряд, без пробелов и запятых. Порядок цифр не важен; повторять цифры нельзя.", level: entry.level, subtopic: entry.subtopic, skillId: entry.skillId, misconceptionId: entry.misconceptionId, ...(entry.taskLine === 9 ? { shortAnswerConstraints: { requiredWords: [rephraseHeadWords[candidate.sourceNumber]] } } : {}), source: { sourceType: "original_demo", sourceTitle: source.filename, sourceUrl: "", author: "Автор в предоставленном каталоге не указан", rightsStatus: "owned", licenseNote: entry.rightsBasis, verifiedAt: admission.reviewedAt, examYear: specification.year, editorialStatus: "needs_review" }, provenance: { sourceId: candidate.sourceId, filename: candidate.filename, sourceNumber: candidate.sourceNumber, paragraph: candidate.parts[0].startParagraph, importedAt: candidate.importedAt, method: "local-original-import", rightsBasis: entry.rightsBasis, reviewNote: entry.reviewNote, reviewedAt: admission.reviewedAt, teacherApproval: "pending" } });
  pending.push({ item, entry });
}
for (const pair of batch.pairedSyntax) {
  assert.equal(pair.key, admission.pairedKeys[pair.id]);
  const entry = batch.approved.find((item) => item.candidateId === pair.candidateId);
  assert(entry && pair.options.length === 5 && pair.why.length === 5);
  upsert(materials.texts, { id: pair.sourceTextId, revision: 1, title: entry.title, paragraphs: [pair.text.trim()], kind: "syntax", authorship: "Локальный авторский текст из предоставленного каталога задания 3; автор в каталоге не указан.", rightsBasis: pair.rightsBasis, reviewNote: "Исходный локальный текст и оба задания независимо прочитаны; новое задание №2 создано для проекта. Методическое утверждение преподавателем ожидается." });
  const item = receipt({ ...base(2, "osnova", "Грамматическая основа"), id: pair.id, slug: pair.id, title: pair.title, prompt: "Укажите варианты ответов, в которых верно определена грамматическая основа одного из предложений или одной из частей сложного предложения текста. Запишите номера ответов.", sourceTextId: pair.sourceTextId, answers: [pair.key], options: pair.options, optionExplanations: pair.why, explanation: pair.why.join("\n\n"), hint: pair.hint, steps: ["Найдите главные члены каждой части.", "Сохраните все части составного и однородные сказуемые.", "Исключите зависимые второстепенные члены.", "Сверьте полный состав каждой предложенной основы."], instruction: "Запишите номера подряд, без пробелов и запятых. Порядок цифр не важен; повторять цифры нельзя.", skillId: "OGE:syntax.foundation", misconceptionId: "foundation-extra-or-missing", subtopic: "Границы основы, составное и однородные сказуемые", source: { sourceType: "original_demo", sourceTitle: "Парное учебное задание проекта к локальному авторскому тексту", sourceUrl: "", author: "Редакция проекта; автор исходного текста в каталоге не указан", rightsStatus: "owned", licenseNote: pair.rightsBasis, verifiedAt: admission.reviewedAt, examYear: specification.year, editorialStatus: "needs_review" }, provenance: { sourceId: "project-audit-syntax-2026-10-15", method: "project-original", rightsBasis: pair.rightsBasis, reviewNote: "Новое самостоятельное задание №2 к тексту " + pair.candidateId + "; не дополнительный импорт. Все пять вариантов и их состав основ независимо разобраны; утверждение преподавателем ожидается.", reviewedAt: admission.reviewedAt, teacherApproval: "pending" } });
  pending.push({ item });
}
assert.equal(pending.length, 16);
assert.equal(pending.filter(({item}) => item.provenance.method === "local-original-import").length, 14);
for (const { item, entry } of pending) {
  upsert(await collection(item.topicId), item);
  if (entry) {
    const clean = { ...entry, publicationReview: item.publicationReview };
    delete clean.condition;
    delete clean.primaryReferences;
    delete clean.sourceNumber;
    delete clean.taskLine;
    const pair = batch.pairedSyntax.find((record) => record.candidateId === entry.candidateId);
    if (pair) clean.sourceTextId = pair.sourceTextId;
    const existing = manifest.approved.find((record) => record.candidateId === entry.candidateId);
    if (existing) assert.deepEqual(existing, clean, entry.candidateId + ": existing approval changed");
    else manifest.approved.push(clean);
  }
}
// All validation above precedes any writes; old collection members remain intact.
for (const [topic, items] of collections) await fs.writeFile(root + "/content/exercises/" + topic + ".json", JSON.stringify(items, null, 2) + "\n");
await fs.writeFile(root + "/oge/materials.json", JSON.stringify(materials, null, 2) + "\n");
await fs.writeFile("content/review-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
console.log("Merged 14 independently reviewed declared-original imports and 2 paired project exercises; index/build validation remains required.");
