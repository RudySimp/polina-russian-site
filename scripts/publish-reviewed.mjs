import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";

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
await fs.mkdir(output, { recursive: true });
const groups = new Map();
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
  const options = candidate.options.map((option) =>
    option.replace(/^\d\)\s*/u, ""),
  );
  const detail = explanation.filter(
    (line) => !/^Ответ:|^Полный текст:/u.test(line),
  );
  const kind = candidate.taskLine >= 8 ? "short_text" : "digits_sequence";
  const id = `oge-${approval.topicId}-${String(candidate.sourceNumber).padStart(3, "0")}`;
  const item = {
    id,
    slug: id,
    revision: 1,
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
      allowYoAsE: false,
      orderMatters: candidate.taskLine >= 8,
      allowDigitSeparators: false,
      minLength: 1,
      maxLength: kind === "short_text" ? 70 : 9,
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
          ? "Запишите одно слово. Буквы Ё и Е различаются."
          : "Запишите всё словосочетание. Допустимые варианты порядка слов учтены. Буквы Ё и Е различаются."
        : "Запишите номера подряд, без пробелов и запятых. Порядок цифр не важен; повторять цифры нельзя.",
    options,
    optionExplanations: options.length ? detail : [],
    steps: approval.steps,
    hint: approval.hint,
    explanation: detail.join("\n\n"),
    formatLabel: `ОГЭ · ${approval.topicTitle}`,
    input: kind === "short_text" ? "text" : "digits",
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
  };
  const list = groups.get(approval.topicId) ?? [];
  list.push(item);
  groups.set(approval.topicId, list);
}
// Отозванное разрешение не должно оставлять старую коллекцию опубликованной.
for (const filename of (await fs.readdir(output)).filter((name) =>
  name.endsWith(".json"),
)) {
  const topicId = path.basename(filename, ".json");
  if (groups.has(topicId)) continue;
  const file = path.join(output, filename);
  const items = JSON.parse(await fs.readFile(file, "utf8"));
  if (
    Array.isArray(items) &&
    items.some((item) => item.provenance?.method === "local-original-import")
  ) {
    await fs.writeFile(
      file,
      JSON.stringify(
        items.filter(
          (item) => item.provenance?.method !== "local-original-import",
        ),
        null,
        2,
      ) + "\n",
    );
  }
}
for (const [topicId, items] of groups) {
  const file = path.join(output, `${topicId}.json`);
  let originals = [];
  try {
    const existing = JSON.parse(await fs.readFile(file, "utf8"));
    assert(Array.isArray(existing), `${file}: коллекция должна быть массивом`);
    originals = existing.filter(
      (item) => item.provenance?.method !== "local-original-import",
    );
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await fs.writeFile(
    file,
    JSON.stringify([...originals, ...items], null, 2) + "\n",
  );
}
console.log(
  `Подготовлено ${manifest.approved.length} проверенных импортированных заданий. Проверка целостности и сборка обязательны.`,
);
