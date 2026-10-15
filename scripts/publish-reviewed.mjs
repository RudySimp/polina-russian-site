import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { vowelExerciseIssues } from "./lib/content-integrity.ts";
import { mergeReviewedImport, reviewedApprovalHash, reviewedPublishedHash } from "./lib/reviewed-import-publication.mjs";

const root = process.cwd();
const drafts = JSON.parse(
  await fs.readFile(
    path.join(root, "private-materials/import/candidates.json"),
    "utf8",
  ),
);
const inventory = JSON.parse(
  await fs.readFile(
    path.join(root, "private-materials/import/inventory.json"),
    "utf8",
  ),
);
const manifest = JSON.parse(
  await fs.readFile(path.join(root, "content/review-manifest.json"), "utf8"),
);
const output = path.join(root, "apps/showcase/src/content/exercises");
const specification = JSON.parse(await fs.readFile(path.join(root, 'apps/showcase/src/oge/specification.json'), 'utf8'));
await fs.mkdir(output, { recursive: true });
const groups = new Map();
const lockFile = path.join(root, "content/import-publication-lock.json");
const lock = JSON.parse(await fs.readFile(lockFile, "utf8"));
const existingCollections = new Map();
for (const filename of (await fs.readdir(output)).filter((name) => name.endsWith(".json"))) {
  const items = JSON.parse(await fs.readFile(path.join(output, filename), "utf8"));
  assert(Array.isArray(items), filename + ": expected an exercise collection");
  existingCollections.set(path.basename(filename, ".json"), items);
}
const nextLock = [];
let retained = 0, added = 0, revised = 0;
for (const approval of manifest.approved) {
  const candidate = drafts.find((c) => c.id === approval.candidateId);
  assert(candidate, `Не найден ${approval.candidateId}`);
  assert.equal(
    candidate.fingerprint,
    approval.fingerprint,
    `${candidate.id}: исходное условие изменилось; повторите проверку`,
  );
  const source = inventory.inventory.find(
    (s) => s.sourceId === candidate.sourceId,
  );
  assert(
    source?.declaredOriginal,
    `${candidate.id}: нет декларации оригинального проектного материала`,
  );
  assert(
    approval.rightsBasis &&
      approval.reviewNote &&
      approval.answer &&
      approval.reviewedAt,
    `${candidate.id}: неполное одобрение`,
  );
  assert.equal(
    candidate.answer,
    approval.answer,
    `${candidate.id}: эталон не совпадает с проверенным ключом`,
  );
  const question = [...candidate.question];
  let explanation = [...candidate.explanation];
  for (const correction of approval.corrections ?? []) {
    const list = correction.part === "question" ? question : explanation;
    assert(
      list.some((line) => line.includes(correction.before)),
      `${candidate.id}: фрагмент исправления не найден`,
    );
    for (let n = 0; n < list.length; n++)
      list[n] = list[n].replace(correction.before, correction.after);
  }
  let prompt, text;
  if ([2, 3].includes(candidate.taskLine)) {
    prompt = question.find((line) => /^Укажите/u.test(line));
    text = question.find((line) => /^\(1\)/u.test(line));
  } else {
    prompt = question[0];
    text = question.length > 1 ? question[1] : undefined;
  }
  const options = question.filter(line => /^\d\)/u.test(line)).map((option) =>
    option.replace(/^\d\)\s*/u, ""),
  );
  const detail = (approval.explanation ?? explanation).filter(
    (line) => !/^Ответ:|^Полный текст:/u.test(line),
  );
  const line = specification.lines.find(line => line.number === candidate.taskLine);
  assert(line && line.response !== 'extended', `${candidate.id}: нет проверенной политики линии`);
  const kind = line.response;
  if (candidate.taskLine === 4) { prompt = question[0]; text = undefined; }
  if (candidate.taskLine === 6) { prompt = question[0]; text = undefined; }
  const id = `oge-${approval.topicId}-${String(candidate.sourceNumber).padStart(3, "0")}`;
  const item = {
    id,
    slug: id,
    revision: approval.revision ?? 1,
    title: approval.title,
    prompt,
    text,
    topicId: approval.topicId,
    topicSlug: approval.topicId,
    topicTitle: approval.topicTitle,
    exam: "OGE",
    responseKind: kind,
    answers: approval.acceptedAnswers ?? [approval.answer],
    maxScore: 1,
    policy: {
      version: 1,
      trim: true,
      caseSensitive: false,
      collapseSpaces: kind === "short_text",
      allowYoAsE: [8, 9, 12].includes(candidate.taskLine),
      orderMatters: line.orderMatters,
      allowDigitSeparators: false,
      minLength: line.minLength,
      maxLength: line.maxLength,
    },
    source: {
      sourceType: "original_demo",
      sourceTitle: source.filename,
      sourceUrl: "",
      author: "Автор в предоставленном каталоге не указан",
      rightsStatus: "owned",
      licenseNote: approval.rightsBasis,
      verifiedAt: approval.reviewedAt,
      examYear: 2027,
      editorialStatus: "needs_review",
    },
    skillId: approval.skillId,
    misconceptionId: approval.misconceptionId,
    instruction:
      kind === "short_text"
        ? candidate.taskLine === 8
          ? "Запишите одно слово. Ё можно заменить на Е."
          : "Запишите словосочетание. Принимаются только явно проверенные нормативные варианты. Ё можно заменить на Е."
        : line.orderMatters ? 'Установите соответствие в порядке А, Б, В. Порядок цифр важен.' : "Запишите номера подряд, без пробелов и запятых. Порядок цифр не важен; повторять цифры нельзя.",
    options,
    optionExplanations: options.length ? (approval.optionExplanations ?? detail) : [],
    ...(candidate.taskLine === 4 ? { rules: question.filter(line => /^[АБВ]\)/u.test(line)) } : {}),
    steps: approval.steps,
    hint: approval.hint,
    explanation: detail.join("\n\n"),
    formatLabel: `ОГЭ · ${approval.topicTitle}`,
    input: line.input,
    level: approval.level,
    taskLine: candidate.taskLine,
    format: "exam-model",
    examModel: {
      year: 2027,
      status: "project",
      sourceUrl: "https://fipi.ru/oge/demoversii-specifikacii-kodifikatory",
    },
    provenance: {
      sourceId: candidate.sourceId,
      filename: candidate.filename,
      sourceNumber: candidate.sourceNumber,
      paragraph: candidate.parts[0].startParagraph,
      importedAt: candidate.importedAt,
      method: "local-original-import",
      rightsBasis: approval.rightsBasis,
      reviewNote: approval.reviewNote,
      reviewedAt: approval.reviewedAt,
      teacherApproval: "pending",
    },
    reviewStatus: "checked-demo",
    ...(approval.publicationReview ? {publicationReview:approval.publicationReview} : {}),
    reviewStages: ['extracted', 'answer-checked', 'explanation-checked', 'publication-approved'].map(stage => ({stage, at: approval.reviewedAt, by: 'Редакторская проверка демонстрационной редакции; утверждение преподавателя ожидается'})),
    subtopic: approval.subtopic ?? approval.title,
  };
  if (approval.prompt) item.prompt = approval.prompt;
  if (approval.text) item.text = approval.text;
  if (approval.sourceTextId) { item.sourceTextId = approval.sourceTextId; delete item.text; }
  if (approval.shortAnswerConstraints) item.shortAnswerConstraints = approval.shortAnswerConstraints;
  const existing = existingCollections.get(approval.topicId)?.find((entry) => entry.id === id);
  const finalItem = mergeReviewedImport(existing, item, approval, lock.entries.find((entry) => entry.id === id));
  if (!existing) added++;
  else if (finalItem === existing) retained++;
  else revised++;
  if (candidate.taskLine === 7) {
    const issues = vowelExerciseIssues(finalItem);
    assert.equal(issues.length, 0, `${id}: итоговое условие не прошло проверку пропусков: ${issues.join('; ')}`);
  }
  const list = groups.get(approval.topicId) ?? [];
  list.push(finalItem);
  nextLock.push({ candidateId: approval.candidateId, id, approvalHash: reviewedApprovalHash(approval), publishedRevision: finalItem.revision, publishedHash: reviewedPublishedHash(finalItem) });
  groups.set(approval.topicId, list);
}
// A missing approval must not silently erase previously published work.
// Explicit withdrawal needs a separately reviewed removal/migration operation.
const approvedIds = new Set([...groups.values()].flat().map((item) => item.id));
for (const items of existingCollections.values())
  for (const item of items.filter((entry) => entry.provenance?.method === "local-original-import"))
    assert(approvedIds.has(item.id), item.id + ": approval missing; explicit reviewed withdrawal required");
const writes = [];
for (const [topicId, items] of groups) {
  const previous = existingCollections.get(topicId) ?? [];
  const replacements = new Map(items.map((item) => [item.id, item]));
  const merged = previous.map((item) => replacements.get(item.id) ?? item);
  const present = new Set(previous.map((item) => item.id));
  for (const item of items) if (!present.has(item.id)) merged.push(item);
  if (JSON.stringify(merged) !== JSON.stringify(previous))
    writes.push([path.join(output, topicId + ".json"), JSON.stringify(merged, null, 2) + "\n"]);
}
const updatedLock = { ...lock, entries: nextLock };
if (JSON.stringify(updatedLock) !== JSON.stringify(lock))
  writes.push([lockFile, JSON.stringify(updatedLock, null, 2) + "\n"]);
// No collection is written until every approval, revision, receipt, and withdrawal
// has passed the guards above. Unchanged collections are not rewritten.
for (const [filename, contents] of writes) await fs.writeFile(filename, contents);
console.log("Reviewed imports: retained " + retained + ", added " + added + ", revised " + revised + ". Existing corrections, source groups, and metadata preserved; content validation remains required.");
