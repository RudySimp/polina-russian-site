import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const root = "apps/showcase/src";
const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const batch = await read("content/oge-reading-batch-2026-10-15.json");
const admission = await read("content/oge-reading-admission-2026-10-15.json");
assert.equal(batch.stage, "checked-demo");
assert.equal(admission.mode, "checked-demo");
assert.equal(admission.teacherApproval, "pending");
assert.equal(admission.hashEncoding, "compact-json-v1");
for (const file of admission.files) assert.equal(createHash("sha256").update(JSON.stringify(await read(file.path))).digest("hex"), file.sha256, file.path + ": changed source requires independent review");
const materials = await read(root + "/oge/materials.json");
const collections = new Map();
const derived = new Set(["elements", "ruleElements", "skillIds", "rulePaths", "classificationReview"]);
function upsert(list, item) {
  const previous = list.find((value) => value.id === item.id);
  if (!previous) list.push(item);
  else {
    const fields = Object.keys(item).filter((key) => !derived.has(key));
    assert.deepEqual(Object.fromEntries(fields.map((key) => [key, previous[key]])), Object.fromEntries(fields.map((key) => [key, item[key]])), item.id + ": existing saved edition cannot be changed");
  }
}
async function collection(topic) {
  if (!collections.has(topic)) collections.set(topic, await read(root + "/content/exercises/" + topic + ".json"));
  return collections.get(topic);
}
const checkedNote = "Полные тексты, каждый вариант, ключ, альтернативы и все шесть тем сочинений независимо прочитаны Codex root 15.10.2026. Редакторский допуск демонстрационной авторской модели; утверждение преподавателем ожидается.";
for (const text of batch.texts) {
  assert.equal(text.kind, "reading");
  assert(text.authorship.includes("Оригинальный") && text.rightsBasis.trim());
  upsert(materials.texts, { ...text, reviewNote: checkedNote });
}
for (const source of batch.exercises) {
  const item = structuredClone(source);
  assert.equal(item.originCategory, "author-model");
  assert.deepEqual(item.answers, admission.keys[item.sourceTextId][item.taskLine]);
  assert.equal(item.source.rightsStatus, "owned");
  assert(batch.texts.some((text) => text.id === item.sourceTextId));
  item.reviewStatus = "checked-demo";
  item.provenance.reviewNote = checkedNote;
  item.reviewStages = ["answer-checked", "explanation-checked", "publication-approved"].map((stage) => ({ stage, at: admission.reviewedAt, by: admission.reviewedBy }));
  item.publicationReview = { revision: item.revision, by: admission.reviewedBy, at: admission.reviewedAt, mode: "checked-demo", condition: true, key: true, alternatives: true, explanation: true, rights: true };
  upsert(await collection(item.topicId), item);
}
for (const writing of batch.writing) {
  assert.equal(writing.line, 13);
  assert.deepEqual(writing.prompts.map((prompt) => prompt.id), ["13.1", "13.2", "13.3"]);
  assert(batch.texts.some((text) => text.id === writing.sourceTextId));
  upsert(materials.writing, writing);
}
assert.equal(batch.texts.length, 2);
assert.equal(batch.exercises.length, 6);
assert.equal(batch.writing.length, 2);
// All checks precede writes. Previous collection members and fixed works are retained.
for (const [topic, list] of collections) await fs.writeFile(root + "/content/exercises/" + topic + ".json", JSON.stringify(list, null, 2) + "\n");
await fs.writeFile(root + "/oge/materials.json", JSON.stringify(materials, null, 2) + "\n");
console.log("Merged 2 independently reviewed original reading groups: 6 exercises and 2 writing assignments with 6 prompts. Teacher approval pending; official items 0.");
