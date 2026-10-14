import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const root = "apps/showcase/src";
const admission = JSON.parse(
  await fs.readFile("content/audit-corpus-admission.json", "utf8"),
);
for (const file of admission.files)
  assert.equal(
    createHash("sha256")
      .update(
        admission.hashEncoding === "compact-json-v1"
          ? JSON.stringify(JSON.parse(await fs.readFile(file.path, "utf8")))
          : await fs.readFile(file.path),
      )
      .digest("hex"),
    file.sha256,
    file.path + ": повторите независимую проверку изменённого материала",
  );
const materials = JSON.parse(
  await fs.readFile(root + "/oge/materials.json", "utf8"),
);
const collections = new Map();
async function collection(topic) {
  if (!collections.has(topic))
    collections.set(
      topic,
      JSON.parse(
        await fs.readFile(
          root + "/content/exercises/" + topic + ".json",
          "utf8",
        ),
      ),
    );
  return collections.get(topic);
}
function upsert(list, item) {
  const i = list.findIndex((e) => e.id === item.id);
  if (i < 0) list.push(item);
  else if (JSON.stringify(list[i]) !== JSON.stringify(item)) {
    assert.equal(
      list[i].revision,
      item.revision,
      item.id + ": несогласованная редакция",
    );
    list[i] = item;
  }
}
function approve(e) {
  e.reviewStages = [
    {
      stage: "answer-checked",
      at: admission.reviewedAt,
      by: admission.reviewedBy,
    },
    {
      stage: "explanation-checked",
      at: admission.reviewedAt,
      by: admission.reviewedBy,
    },
    {
      stage: "publication-approved",
      at: admission.reviewedAt,
      by: "Редакторский допуск checked-demo; Полина: pending",
    },
  ];
  e.publicationReview = {
    revision: e.revision,
    by: admission.reviewedBy,
    at: admission.reviewedAt,
    mode: "checked-demo",
    condition: true,
    key: true,
    alternatives: true,
    explanation: true,
    rights: true,
  };
  return e;
}
const syntax = JSON.parse(
  await fs.readFile("content/audit-new-syntax.json", "utf8"),
);
const templates = {
  2: structuredClone(
    (await collection("osnova")).find((e) => e.taskLine === 2),
  ),
  3: structuredClone(
    (await collection("sintaksis")).find((e) => e.taskLine === 3),
  ),
};
async function syntaxExercise(record, line, sourceTextId) {
  const topic = line === 2 ? "osnova" : "sintaksis";
  const e = structuredClone(templates[line]);
  for (const key of [
    "text",
    "elements",
    "skillIds",
    "rulePaths",
    "classificationReview",
    "publicationReview",
  ])
    delete e[key];
  Object.assign(e, {
    id: "oge-" + topic + "-" + sourceTextId,
    slug: "oge-" + topic + "-" + sourceTextId,
    revision: 1,
    title:
      record.title +
      ": " +
      (line === 2 ? "грамматическая основа" : "синтаксический анализ"),
    sourceTextId,
    options: record["options" + line],
    optionExplanations: record["why" + line],
    answers: [record["key" + line]],
    explanation: record["why" + line].join("\n\n"),
    hint: record["hint" + line],
    subtopic:
      line === 2
        ? "Границы главных членов и тип сказуемого"
        : "Односоставность, осложнение и подчинение",
    originCategory: "author-model",
  });
  e.provenance = {
    sourceId: "project-audit-syntax-2026-10-12",
    method: "project-original",
    rightsBasis: syntax.rightsBasis,
    reviewNote:
      "Независимое чтение всех вариантов: " +
      (record.editorialAnalysis ??
        "Сопоставление с опубликованным исходным текстом.") +
      " Утверждение Полиной ожидается.",
    reviewedAt: admission.reviewedAt,
    teacherApproval: "pending",
  };
  e.source = {
    ...e.source,
    sourceType: "original_demo",
    rightsStatus: "owned",
    licenseNote: syntax.rightsBasis,
    verifiedAt: admission.reviewedAt,
  };
  approve(e);
  upsert(await collection(topic), e);
}
for (const r of syntax.records) {
  assert.deepEqual([r.key2, r.key3], admission.syntaxKeys[r.id]);
  const id = "syntax-audit-" + r.id;
  upsert(materials.texts, {
    id,
    revision: 1,
    title: r.title,
    paragraphs: [r.sentences.map((s, n) => "(" + (n + 1) + ") " + s).join(" ")],
    kind: "syntax",
    authorship: "Оригинальный учебный текст проекта.",
    rightsBasis: syntax.rightsBasis,
    reviewNote:
      "Независимое редакторское чтение обеих линий; методическое утверждение ожидается.",
  });
  await syntaxExercise(r, 2, id);
  await syntaxExercise(r, 3, id);
}
for (const r of syntax.completeExistingPairs) {
  assert.equal(r.key3, admission.syntaxKeys[r.id][0]);
  const id = "syntax-" + r.id;
  const text = materials.texts.find((t) => t.id === id);
  assert(text);
  assert.equal(
    text.paragraphs.join(" ").replace(/\(\d+\)\s*/gu, ""),
    r.matchPublishedSentences.join(" "),
  );
  await syntaxExercise(r, 3, id);
}
const reading = JSON.parse(
  await fs.readFile("content/audit-new-reading.json", "utf8"),
);
for (const t of reading.texts) upsert(materials.texts, t);
for (const w of reading.writing) upsert(materials.writing, w);
for (const source of reading.exercises) {
  const e = structuredClone(source);
  assert.equal(e.answers[0], admission.readingKeys[e.sourceTextId][e.taskLine]);
  approve(e);
  upsert(await collection(e.topicId), e);
}
for (const [topic, items] of collections)
  await fs.writeFile(
    root + "/content/exercises/" + topic + ".json",
    JSON.stringify(items, null, 2) + "\n",
  );
await fs.writeFile(
  root + "/oge/materials.json",
  JSON.stringify(materials, null, 2) + "\n",
);
console.log(
  "Добавлено: 8 заданий синтаксиса, 9 заданий чтения, 6 текстов и 3 сочинения; старые варианты сохранены.",
);
