import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";
import { XMLParser } from "fast-xml-parser";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const root = process.cwd();
const output = path.join(root, "private-materials", "import");
const excluded = new Set([
  ".git",
  ".next",
  ".cache",
  ".tools",
  "node_modules",
  "test-results",
  "playwright-report",
  "dist",
  "out",
  "artifacts",
  "private-materials",
]);
const extensions = new Set([
  ".docx",
  ".doc",
  ".pdf",
  ".txt",
  ".md",
  ".json",
  ".csv",
  ".xlsx",
]);
const xml = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  trimValues: false,
  parseTagValue: false,
});
const hash = (text) => createHash("sha256").update(text).digest("hex");
const normalized = (text) =>
  text.normalize("NFC").replace(/\s+/gu, " ").trim().toLocaleLowerCase("ru");
const importedAt = new Date().toISOString();
await fs.mkdir(output, { recursive: true });

async function scan(directory) {
  const result = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const filename = path.join(directory, entry.name);
    if (entry.isDirectory() && !excluded.has(entry.name))
      result.push(...(await scan(filename)));
    else if (
      entry.isFile() &&
      extensions.has(path.extname(entry.name).toLowerCase())
    )
      result.push(filename);
  }
  return result;
}
function nodeText(nodes) {
  return nodes
    .map((node) =>
      Object.entries(node)
        .filter(([key]) => key !== ":@")
        .map(([key, value]) => {
          if (key === "#text") return String(value);
          if (key === "w:tab") return "\t";
          if (key === "w:br" || key === "w:cr") return "\n";
          return Array.isArray(value) ? nodeText(value) : "";
        })
        .join(""),
    )
    .join("");
}
function find(nodes, key) {
  for (const node of nodes) {
    if (node[key]) return node[key];
    for (const value of Object.values(node))
      if (Array.isArray(value)) {
        const found = find(value, key);
        if (found) return found;
      }
  }
}
function paragraphsFrom(nodes, list, context = {}) {
  for (const node of nodes) {
    if (node["w:p"]) {
      const raw = JSON.stringify(node["w:p"]);
      list.push({
        index: list.length + 1,
        text: nodeText(node["w:p"]),
        hasImage: /w:drawing|w:pict/.test(raw),
        hasMath: /m:oMath/.test(raw),
        ...context,
      });
    } else
      for (const value of Object.values(node))
        if (Array.isArray(value)) paragraphsFrom(value, list, context);
  }
}
function parseCatalog(paragraphs, taskLine, sourceId, filename) {
  const candidates = new Map();
  let current;
  for (const paragraph of paragraphs) {
    if (
      /^Раздел III|^Номера ответов|^Таблица ответов|^Сводная таблица|^Ключи|^Редакционное примечание|^Проверка ответа/u.test(
        paragraph.text,
      )
    ) {
      current = undefined;
      continue;
    }
    const match = paragraph.text.match(/^Вариант\s+(\d{3})(?:[.\s—-]|$)/u);
    if (match) {
      const number = Number(match[1]);
      const candidate = candidates.get(number) ?? {
        id: `${sourceId}-${match[1]}`,
        sourceId,
        filename,
        sourceNumber: number,
        taskLine,
        exam: "OGE",
        revision: 1,
        importedAt,
        editorialStatus: "review",
        parts: [],
      };
      current = {
        heading: paragraph.text,
        startParagraph: paragraph.index,
        paragraphs: [],
      };
      candidate.parts.push(current);
      candidates.set(number, candidate);
    } else if (current) current.paragraphs.push(paragraph);
  }
  return [...candidates.values()].map((candidate) => {
    const [question, solution] = candidate.parts;
    const lines = question?.paragraphs.map((p) => p.text).filter(Boolean) ?? [];
    const optionLines = lines.filter((text) => /^\d\)/u.test(text));
    const rules = lines.filter((text) => /^[АБВ]\)/u.test(text));
    const payload = lines.filter(
      (text) =>
        !/^Ответ:|^Проверка ответа|^Редакционное|^Раздел III/u.test(text),
    );
    const explanation =
      solution?.paragraphs.map((p) => p.text).filter(Boolean) ?? [];
    let answer = solution?.heading
      .match(/ответ[:\s]+(.+?)(?:\s+\(буква.*)?$/iu)?.[1]
      ?.trim();
    if (!answer)
      answer = explanation
        .find((line) => /^Ответ:/u.test(line))
        ?.replace(/^Ответ:\s*/u, "")
        .trim();
    if (!answer && taskLine === 9)
      answer = explanation[0]?.match(/→\s*«([^»]+)»/u)?.[1];
    const issues = [];
    if (candidate.parts.length !== 2)
      issues.push(
        `Найдено частей: ${candidate.parts.length}; ожидается условие и разбор.`,
      );
    if (!answer) issues.push("Не извлечён эталонный ответ.");
    if (!explanation.length) issues.push("Не извлечено объяснение.");
    if ([2, 3, 4, 6].includes(taskLine) && optionLines.length !== 5)
      issues.push(`Количество вариантов: ${optionLines.length}.`);
    if (taskLine === 4 && rules.length !== 3)
      issues.push("Не извлечены три правила.");
    if (
      candidate.parts.some((part) =>
        part.paragraphs.some((p) => p.hasImage || p.hasMath),
      )
    )
      issues.push("Есть изображение/формула: требуется визуальная проверка.");
    return {
      ...candidate,
      answer,
      options: optionLines,
      rules,
      question: payload,
      explanation,
      fingerprint: hash(normalized(payload.join("\n"))),
      issues,
    };
  });
}

function parseCompilation(paragraphs, sourceId, filename) {
  const candidates = [];
  let variant = 0,
    current,
    keys = false;
  for (const paragraph of paragraphs) {
    if (/^Раздел III/u.test(paragraph.text)) {
      keys = true;
      current = undefined;
      continue;
    }
    const heading = paragraph.text.match(/^Вариант (\d+)$/u);
    if (heading) {
      variant = Number(heading[1]);
      current = undefined;
      continue;
    }
    if (keys) {
      const answer = paragraph.text.match(/^(\d{1,2})\.\s+(.+)$/u);
      if (answer) {
        const candidate = candidates.find(
          (c) =>
            c.sourceVariant === variant && c.taskLine === Number(answer[1]),
        );
        if (candidate) candidate.answer = answer[2].trim();
      }
      continue;
    }
    const task = paragraph.text.match(/^Задание (\d{1,2})$/u);
    if (task && Number(task[1]) >= 2 && Number(task[1]) <= 12) {
      current = {
        id: `${sourceId}-v${variant}-t${task[1]}`,
        sourceId,
        filename,
        sourceVariant: variant,
        taskLine: Number(task[1]),
        sourceNumber: candidates.length + 1,
        exam: "OGE",
        revision: 1,
        importedAt,
        editorialStatus: "quarantined",
        question: [],
        explanation: [],
        parts: [{ startParagraph: paragraph.index }],
        issues: [
          "Сторонний сборник: право публикации не подтверждено.",
          "Не сохранён надёжный общий текст для заданий 2–3/10–12; требуется сверка контекста.",
        ],
      };
      candidates.push(current);
    } else if (
      /^Задание 13|^Текст для|^Тексты для|^Раздел /u.test(paragraph.text)
    )
      current = undefined;
    else if (current && paragraph.text.trim())
      current.question.push(paragraph.text);
  }
  return candidates.map((c) => ({
    ...c,
    fingerprint: hash(normalized(c.question.join("\n"))),
    options: [],
    rules: [],
  }));
}

const inventory = [];
const allCandidates = [];
for (const filename of await scan(root)) {
  const relative = path.relative(root, filename).replaceAll("\\", "/");
  const format = path.extname(filename).toLowerCase();
  const stat = await fs.stat(filename);
  const sourceId = `local-${hash(relative).slice(0, 12)}`;
  const record = {
    sourceId,
    filename: path.basename(filename),
    path: relative,
    fullPath: filename,
    format,
    bytes: stat.size,
    category: [".docx", ".pdf", ".doc", ".xlsx"].includes(format)
      ? "learning-source"
      : "project-file",
    importedAt,
    issues: [],
  };
  if (format === ".docx") {
    const archive = unzipSync(await fs.readFile(filename));
    const nodes = xml.parse(strFromU8(archive["word/document.xml"]));
    const body = find(nodes, "w:body") ?? [];
    const paragraphs = [],
      blocks = [];
    let tableIndex = 0;
    for (const node of body) {
      if (node["w:tbl"]) {
        const rows = [];
        tableIndex++;
        for (const row of node["w:tbl"].filter((n) => n["w:tr"])) {
          const cells = [];
          for (const cell of row["w:tr"].filter((n) => n["w:tc"])) {
            const before = paragraphs.length;
            paragraphsFrom(cell["w:tc"], paragraphs, {
              table: tableIndex,
              row: rows.length + 1,
              cell: cells.length + 1,
            });
            cells.push(paragraphs.slice(before).map((p) => p.text));
          }
          rows.push(cells);
        }
        blocks.push({ type: "table", index: tableIndex, rows });
      } else {
        const before = paragraphs.length;
        paragraphsFrom([node], paragraphs);
        blocks.push(
          ...paragraphs.slice(before).map((p) => ({ type: "paragraph", ...p })),
        );
      }
    }
    const taskLine =
      Number(record.filename.match(/задание\s+(\d+)/iu)?.[1]) || null;
    const text = paragraphs.map((p) => p.text).join("\n");
    const declaredOriginal =
      /составлены специально|написан специально|составлены для данного сборника|100 тренировочных вариантов составлены отдельно|100 оригинальных тренировочных|100 авторских тренировочных/iu.test(
        text.slice(0, 12000),
      );
    const candidates = taskLine
      ? parseCatalog(paragraphs, taskLine, sourceId, record.filename)
      : parseCompilation(paragraphs, sourceId, record.filename);
    const relationships = archive["word/_rels/document.xml.rels"]
      ? strFromU8(archive["word/_rels/document.xml.rels"])
      : "";
    const hyperlinks = [
      ...relationships.matchAll(/Target="(https?:[^"\s]+)"/gu),
    ].map((m) => m[1].replaceAll("&amp;", "&"));
    Object.assign(record, {
      taskLine,
      exam: "OGE",
      category: taskLine
        ? "original-training-catalog"
        : "third-party-compilation",
      paragraphs: paragraphs.length,
      tables: tableIndex,
      imageParagraphs: paragraphs.filter((p) => p.hasImage).length,
      extraction: "xml-paragraphs-and-tables",
      declaredOriginal,
      rightsStatus: declaredOriginal
        ? "original-declared-in-project-source"
        : "unconfirmed",
      theory: false,
      practice: true,
      answers: candidates.some((candidate) => Boolean(candidate.answer)),
      explanations: candidates.some(
        (candidate) => candidate.explanation.length > 0,
      ),
      candidates: candidates.length,
      title: paragraphs
        .slice(0, 4)
        .map((p) => p.text)
        .join(" · "),
      hyperlinks,
    });
    if (!declaredOriginal)
      record.issues.push(
        "Происхождение сборника стороннее/неопределённое; полнотекстовая публикация запрещена.",
      );
    record.issues.push(
      "Исходные ответы и классификация требуют предметной проверки; автоматический импорт не является одобрением.",
    );
    allCandidates.push(...candidates);
    await fs.writeFile(
      path.join(output, `${sourceId}.json`),
      JSON.stringify(
        { metadata: record, blocks, paragraphs, candidates },
        null,
        2,
      ),
    );
  } else if (format === ".pdf") {
    try {
      const loading = getDocument({
        data: new Uint8Array(await fs.readFile(filename)),
        useSystemFonts: false,
        stopAtErrors: true,
        standardFontDataUrl:
          path
            .join(root, "node_modules", "pdfjs-dist", "standard_fonts")
            .replaceAll("\\", "/") + "/",
        verbosity: 0,
      });
      const document = await loading.promise;
      const pages = [];
      for (let number = 1; number <= document.numPages; number++) {
        const page = await document.getPage(number);
        const content = await page.getTextContent();
        const items = content.items
          .filter((item) => "str" in item)
          .map((item) => ({
            text: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
            eol: item.hasEOL,
          }));
        const lines = [];
        for (const item of items) {
          const line = lines.find((l) => Math.abs(l.y - item.y) < 2);
          if (line) line.items.push(item);
          else lines.push({ y: item.y, items: [item] });
        }
        lines.sort((a, b) => b.y - a.y);
        const text = lines
          .map((line) =>
            line.items
              .sort((a, b) => a.x - b.x)
              .map((item) => item.text)
              .join(" "),
          )
          .join("\n");
        pages.push({
          number,
          text,
          items,
          issues:
            text.trim().length < 80
              ? [
                  "Недостаточный текстовый слой: требуется визуальная проверка/OCR.",
                ]
              : [
                  "Порядок колонок, таблицы и графические выделения требуют визуальной сверки.",
                ],
        });
        page.cleanup();
      }
      const firstPages = pages
        .slice(0, 3)
        .map((p) => p.text)
        .join("\n");
      Object.assign(record, {
        pages: document.numPages,
        exam: "OGE",
        taskLine:
          Number(record.filename.match(/Zadani[ea]_?(\d+)/iu)?.[1]) || null,
        theory: /^Zadani/iu.test(record.filename),
        practice: /sbornik|ДЕМО/iu.test(record.filename),
        answers: /ответ/iu.test(pages.map((page) => page.text).join("\n")),
        explanations: /^Zadani/iu.test(record.filename),
        rightsStatus: "unconfirmed-reference-only",
        extraction: "pdf-text-with-coordinates",
        title: firstPages.slice(0, 700),
        issues: [
          "Сторонний теоретический материал/сборник: использовать как справочную базу, без перепечатки.",
          ...pages
            .filter((p) => p.text.trim().length < 80)
            .map((p) => `Страница ${p.number}: недостаточный текстовый слой.`),
        ],
      });
      await fs.writeFile(
        path.join(output, `${sourceId}.json`),
        JSON.stringify({ metadata: record, pages }, null, 2),
      );
      await fs.writeFile(
        path.join(output, `${sourceId}.txt`),
        pages
          .map((p) => `\n=== СТРАНИЦА ${p.number} ===\n${p.text}`)
          .join("\n"),
      );
      await loading.destroy();
    } catch (error) {
      record.issues.push(`Извлечение не удалось: ${error.message}`);
    }
  } else if ([".doc", ".xlsx"].includes(format))
    record.issues.push(
      "Формат требует отдельного конвертера; содержимое автоматически не проверено.",
    );
  inventory.push(record);
}
const duplicateGroups = [
  ...Map.groupBy(allCandidates, (c) => c.fingerprint).values(),
].filter((group) => group.length > 1);
const nearGroups = [
  ...Map.groupBy(
    allCandidates.filter((c) => [2, 3].includes(c.taskLine)),
    (c) =>
      hash(
        normalized(c.question.filter((text) => /^\d\)/u.test(text)).join("\n")),
      ),
  ),
]
  .map(([, group]) => group)
  .filter((group) => group.length > 1);
const statistics = {
  files: inventory.filter((r) => r.category !== "project-file").length,
  found: allCandidates.length,
  uniqueExact: new Set(allCandidates.map((c) => c.fingerprint)).size,
  withAnswers: allCandidates.filter((c) => c.answer).length,
  withExtractedExplanations: allCandidates.filter((c) => c.explanation.length)
    .length,
  structurallyComplete: allCandidates.filter((c) => !c.issues.length).length,
  reviewed: 0,
  approved: 0,
  publishedByImport: 0,
  requiringReview: allCandidates.length,
};
const summary = {
  importedAt,
  statistics,
  inventory,
  duplicateGroups: duplicateGroups.map((group) =>
    group.map((c) => ({
      id: c.id,
      filename: c.filename,
      sourceNumber: c.sourceNumber,
      answer: c.answer,
    })),
  ),
  possibleSimilarOptions: nearGroups.map((group) => group.map((c) => c.id)),
};
await fs.writeFile(
  path.join(output, "inventory.json"),
  JSON.stringify(summary, null, 2),
);
await fs.writeFile(
  path.join(output, "candidates.json"),
  JSON.stringify(allCandidates, null, 2),
);
console.log(JSON.stringify(statistics, null, 2));
console.log(
  "Промежуточные данные: private-materials/import (исключены из Git). Публикация не выполнялась.",
);
if (
  inventory.some((record) =>
    record.issues.some((issue) => issue.startsWith("Извлечение не удалось:")),
  )
) {
  console.error("Есть ошибки чтения PDF: проверьте issues в inventory.json.");
  process.exitCode = 1;
}
