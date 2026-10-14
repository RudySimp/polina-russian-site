import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

// Source files and extracted paragraphs stay private. This command never
// changes the published bank, the review manifest, or a teacher's decision.
const roots = ["ЗАДАНИЯ ОГЭ И ЕГЭ", "Русский ОГЭ 2027", "Учебники"];
const destination = "private-materials/import";
const digest = (value) => createHash("sha256").update(value).digest("hex");
const normalized = (value) => value.normalize("NFC").replaceAll("ё", "е").toLocaleLowerCase("ru").replace(/\s+/gu, " ").trim();
const old = JSON.parse(await fs.readFile(`${destination}/inventory.json`, "utf8"));
const candidates = JSON.parse(await fs.readFile(`${destination}/candidates.json`, "utf8"));
const manifest = JSON.parse(await fs.readFile("content/review-manifest.json", "utf8"));
const admitted = new Set(manifest.approved.map((record) => record.candidateId));
const selection = await fs.readFile("content/oge-editorial-selection.json", "utf8").then(JSON.parse).catch(() => ({ records: [], returnedForCorrection: [] }));
const selected = new Map(selection.records.map((record) => [record.candidateId, record]));
const returned = new Map(selection.returnedForCorrection.map((record) => [record.candidateId, record]));
const oldSources = new Map(old.inventory.map((record) => [record.path.replaceAll("\\", "/"), record]));
const inspectedAt = new Date().toISOString();

async function scan(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await scan(filename));
    else if (entry.isFile() && /\.(?:pdf|docx)$/iu.test(entry.name)) result.push(filename);
  }
  return result;
}

function bookScope(filename) {
  if (/10.?11|10-klass|11-klass/iu.test(filename)) return { exam: "EGE-reference", theme: "Русский язык старшей школы; вне текущего расширения ОГЭ" };
  if (/868-Текст/iu.test(filename)) return { exam: "needs-scope-review", theme: "Статья: релевантность ОГЭ требует ручной проверки" };
  return { exam: "OGE-reference", theme: "Школьный курс русского языка 5–9 классов: самостоятельные объяснения правил" };
}

const records = [];
for (const root of roots) {
  for (const file of (await scan(root)).sort()) {
    const relative = file.replaceAll("\\", "/");
    const bytes = await fs.readFile(file);
    const hash = digest(bytes);
    const source = oldSources.get(relative);
    const format = path.extname(file).toLowerCase();
    const filename = path.basename(file);
    const sourceId = source?.sourceId ?? `file-${hash.slice(0, 12)}`;
    const linked = candidates.filter((candidate) => candidate.sourceId === sourceId);
    const published = linked.filter((candidate) => admitted.has(candidate.id)).length;
    const isBook = root === "Учебники";
    const scope = isBook ? bookScope(filename) : { exam: source?.exam ?? (/ЕГЭ/u.test(filename) ? "EGE-reference" : "OGE"), theme: source?.title?.split("\n")[0]?.slice(0, 200) ?? filename };
    const record = {
      sourceId, filename, path: relative, sha256: hash, bytes: bytes.length,
      format: format.slice(1), ...scope, taskLine: source?.taskLine ?? (Number(filename.match(/^(9|10|11|12)\s+задание/iu)?.[1]) || null),
      containsConditions: source?.practice ?? "not-assessed",
      containsAnswers: source?.answers ?? "not-assessed",
      containsExplanations: source?.explanations ?? "not-assessed",
      origin: source?.category ?? (isBook ? "third-party-textbook" : "unknown"),
      rightsStatus: source?.rightsStatus ?? "unconfirmed-reference-only",
      processingStatus: bytes.length === 0 ? "empty-unusable" : source ? "extracted-awaiting-subject-review" : "metadata-recorded",
      teacherApproval: "pending", candidates: linked.length, admittedDemo: published,
      inspectedAt, pages: source?.pages ?? null, issues: [],
    };
    if (bytes.length === 0) record.issues.push("Пустой файл: не является рабочим учебным источником.");
    if (record.origin === "third-party-compilation") record.issues.push("671 кандидат в карантине; право публичного воспроизведения не подтверждено.");
    if (record.exam === "EGE-reference") record.issues.push("Материал старшей школы зарегистрирован; ЕГЭ не расширяется.");
    if (!source && format === ".pdf" && bytes.length > 0) {
      let pdf;
      try {
        pdf = await getDocument({ data: new Uint8Array(bytes), disableFontFace: true, useSystemFonts: true, isEvalSupported: false }).promise;
        record.pages = pdf.numPages;
        const samplePages = [...new Set([...Array.from({ length: Math.min(12, pdf.numPages) }, (_, index) => index + 1), ...Array.from({ length: Math.min(8, pdf.numPages) }, (_, index) => pdf.numPages - index)])].sort((a, b) => a - b);
        const pages = [];
        for (const number of samplePages) {
          const page = await pdf.getPage(number);
          const content = await page.getTextContent();
          const text = content.items.filter((item) => "str" in item).map((item) => item.str).join(" ");
          pages.push({ page: number, text });
          page.cleanup();
        }
        record.processingStatus = "sampled-title-and-contents";
        record.sampledPages = samplePages;
        record.sampleHasText = pages.some((page) => page.text.trim().length > 100);
        record.issues.push("Прочитан выборочный текстовый слой начальных и последних страниц; сплошная предметная проверка и OCR не заявляются.");
        await fs.writeFile(`${destination}/book-index-${hash.slice(0, 12)}.json`, JSON.stringify({ sourceId, sha256: hash, pages }, null, 2) + "\n");
      } catch (error) {
        record.processingStatus = "pdf-read-failed";
        record.issues.push(`Не удалось открыть PDF: ${error.message}`);
      } finally {
        await pdf?.destroy();
      }
    }
    records.push(record);
    console.log(`${relative}: ${record.processingStatus}`);
  }
}

const identicalFiles = [...Map.groupBy(records, (record) => record.sha256).values()].filter((group) => group.length > 1).map((group) => group.map((record) => record.path));
const originalSourceIds = new Set(records.filter((record) => record.origin === "original-training-catalog").map((record) => record.sourceId));
const originals = candidates.filter((candidate) => originalSourceIds.has(candidate.sourceId));
const remaining = originals.filter((candidate) => !admitted.has(candidate.id));
const optionGroups = Map.groupBy(originals.filter((candidate) => candidate.options.length), (candidate) => digest(normalized(candidate.options.join(" "))));
const repeatedOptions = new Map([...optionGroups.values()].filter((group) => group.length > 1).flatMap((group) => group.map((candidate) => [candidate.id, group.map((item) => item.id)])));

const queue = remaining.map((candidate) => {
  const issues = [];
  const question = candidate.question.join("\n");
  if (!question.trim()) issues.push("missing-condition");
  if (!candidate.answer?.trim()) issues.push("missing-key");
  if (!candidate.explanation.length) issues.push("missing-explanation");
  if ([2, 3, 6].includes(candidate.taskLine) && candidate.options.length !== 5) issues.push("unexpected-options-count");
  if (candidate.taskLine === 4 && (candidate.rules.length !== 3 || candidate.options.length !== 5)) issues.push("unexpected-matching-structure");
  if ([4, 5, 7].includes(candidate.taskLine)) {
    const questionNumbers = [...question.matchAll(/\(([1-9])\)/gu)].map((match) => +match[1]);
    if (new Set(questionNumbers).size !== questionNumbers.length) issues.push("duplicate-gap-marker");
    if ([5, 7].includes(candidate.taskLine) && !questionNumbers.length) issues.push("gap-markers-need-review");
  }
  if (/начал(?:и|а)? начинать/iu.test(question)) issues.push("awkward-double-phase-verb");
  if (/треть(?:его|ем) лица.*прошедш|3-го лица.*прошедш/iu.test(candidate.explanation.join(" "))) issues.push("past-tense-person-misstatement");
  if (repeatedOptions.has(candidate.id)) issues.push("shared-option-template");
  if ([8, 9].includes(candidate.taskLine)) issues.push("normative-alternatives-require-subject-review");
  const editorial = selected.get(candidate.id);
  const correction = returned.get(candidate.id);
  return {
    candidateId: candidate.id, sourceId: candidate.sourceId, sourceNumber: candidate.sourceNumber,
    line: candidate.taskLine, fingerprint: candidate.fingerprint,
    sourceRevision: candidate.revision, status: correction ? "returned-for-correction" : editorial ? "subject-reviewed-draft-awaiting-web-review" : "awaiting-subject-editor",
    structureCheckedAt: inspectedAt, automaticChecks: issues,
    sameOptionTemplate: repeatedOptions.get(candidate.id) ?? [],
    condition: candidate.question, key: candidate.answer, explanation: candidate.explanation,
    editorialNote: editorial?.reason ?? correction?.reason ?? null,
    proposedAcceptedAnswers: editorial?.acceptedAnswers ?? [],
    proposedSkillIds: [], rulePaths: [], finalWebRevision: null,
    displayReview: "pending", keyReview: editorial ? "draft-reviewed" : "pending", alternativeReview: editorial ? "draft-reviewed" : "pending",
    explanationReview: "pending", rightsReview: "catalog-origin-declared-owner-authorized",
    teacherApproval: "pending", teacherDecision: null, publication: "not-published",
  };
});
const summary = {
  files: records.length, docx: records.filter((record) => record.format === "docx").length,
  pdf: records.filter((record) => record.format === "pdf").length,
  nonempty: records.filter((record) => record.bytes > 0).length,
  empty: records.filter((record) => record.bytes === 0).length,
  originalCandidates: originals.length, admittedOriginalDemos: originals.length - remaining.length,
  queuedOriginalCandidates: queue.length,
  thirdPartyQuarantined: candidates.filter((candidate) => !originalSourceIds.has(candidate.sourceId)).length,
  candidateSubjectApproval: 0,
};
await fs.writeFile(`${destination}/learning-materials-registry.json`, JSON.stringify({ version: 1, inspectedAt, summary, identicalFiles, records }, null, 2) + "\n");
await fs.writeFile(`${destination}/editorial-queue.json`, JSON.stringify({ version: 1, generatedAt: inspectedAt, summary, records: queue }, null, 2) + "\n");

let report = `# Реестр учебных материалов\n\nАктуализация: 13 октября 2026 года. Воспроизводимая команда: \`node scripts/inventory-learning-materials.mjs\`. Полные условия, извлечённые страницы и редакторская очередь находятся только в исключённой из Git папке \`private-materials/import\`. Исходные файлы не изменены и не публикуются.\n\nОбнаружены **${summary.files} файлов: ${summary.docx} DOCX и ${summary.pdf} PDF; ${summary.nonempty} непустых и ${summary.empty} пустой**. Все файлы имеют свежий SHA-256. В восьми авторских каталогах ${summary.originalCandidates} кандидатов: ${summary.admittedOriginalDemos} ранее допущенных демонстрационных редакций, **${summary.queuedOriginalCandidates} ждут предметного отбора**. Сторонние ${summary.thirdPartyQuarantined} кандидата остаются в карантине. Содержимое JSON с ключом не считается утверждением учителя.\n\n| Файл / путь | SHA-256 | Байт | Страниц | Область / номер | Условия / ответы / разборы | Право / обработка |\n|---|---|---:|---:|---|---|---|\n`;
const presence = (value) => value === true ? "да" : value === false ? "нет" : "не проверено";
for (const record of records) {
  report += `| ${record.path} | \`${record.sha256}\` | ${record.bytes} | ${record.pages ?? "—"} | ${record.exam}${record.taskLine ? ` · № ${record.taskLine}` : ""} | ${presence(record.containsConditions)} / ${presence(record.containsAnswers)} / ${presence(record.containsExplanations)} | ${record.rightsStatus}; ${record.processingStatus} |\n`;
}
report += `\nДля новых учебников и PDF извлечён **выборочный индекс начальных и последних страниц**, чтобы определить название, оглавление и релевантность. Это не OCR, не сплошное чтение и не банк разрешённых упражнений. Материалы старшей школы зарегистрированы как справочные; расширение ЕГЭ не выполняется. Право воспроизводить сторонние книги не подтверждено: допускается предметная сверка правил и самостоятельные объяснения, без перепечатки текста/сканов.\n\nСтатус методического утверждения Полиной — **ожидается** для каждого источника/демонстрационного упражнения. Пустой PDF имеет статус \`empty-unusable\` и не входит в ${summary.nonempty} непустых файлов. Статья отдельно требует проверки релевантности.\n\nРедакторская очередь сохраняет условие, ключ, объяснение, исходный номер, fingerprint и проверки структуры для всех ${queue.length} оставшихся авторских кандидатов. Отдельно отмечены повторяющиеся варианты ответов, сомнительные грамматические формулировки и необходимость проверки нормативных альтернатив в № 8–9. Ни одна автоматическая отметка не публикует материал.\n`;
if (identicalFiles.length) report += `\nСовпадающие по SHA-256 физические файлы: ${identicalFiles.map((group) => group.join(" = ")).join("; ")}. Они учитываются как физические файлы, а не как новый корпус содержания.\n`;
await fs.writeFile("docs/РЕЕСТР_УЧЕБНЫХ_МАТЕРИАЛОВ.md", report);
console.log(JSON.stringify(summary));
