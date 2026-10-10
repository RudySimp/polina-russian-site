import fs from "node:fs/promises";
const data = JSON.parse(
  await fs.readFile("private-materials/import/inventory.json", "utf8"),
);
const manifest = JSON.parse(
  await fs.readFile("content/review-manifest.json", "utf8"),
);
const reviewed =
  manifest.approved ?? manifest.reviews ?? manifest.approvals ?? manifest;
const records = Array.isArray(reviewed) ? reviewed : Object.values(reviewed);
const selected = new Map();
for (const record of records) {
  const id = record.sourceId ?? record.candidateId?.replace(/-\d{3}$/, "");
  if (id) selected.set(id, (selected.get(id) ?? 0) + 1);
}
const sources = data.inventory.filter(
  (record) => record.category !== "project-file",
);
const originalCandidates = sources
  .filter((record) => record.declaredOriginal)
  .reduce((n, record) => n + (record.candidates ?? 0), 0);
const quarantineCandidates = sources
  .filter((record) => record.category === "third-party-compilation")
  .reduce((n, record) => n + (record.candidates ?? 0), 0);
let markdown =
  "# Инвентаризация локальных материалов\n\nДата: 11 октября 2026. Сканирование рекурсивное, включая вложенные папки. Полные локальные пути и извлечённые тексты сохранены только в `private-materials/import/inventory.json` и отдельных файлах источников; эта папка исключена из Git и публикации.\n\n";
markdown +=
  "| Источник / относительный путь | ID | Формат, размер | Объём | Теория / практика / ответы / разборы | Извлечение | Использование |\n|---|---|---|---|---|---|---|\n";
for (const record of data.inventory.filter(
  (r) => r.category !== "project-file",
)) {
  const volume = record.pages
    ? `${record.pages} PDF-страниц`
    : `${record.paragraphs} абзацев; ${record.candidates ?? 0} кандидатов`;
  const flags = ["theory", "practice", "answers", "explanations"]
    .map((key) => (record[key] ? "да" : "нет"))
    .join(" / ");
  const use = record.declaredOriginal
    ? `Оригинальный каталог; опубликовано ${selected.get(record.sourceId) ?? 0}; остальные на проверке`
    : /sbornik|Банк заданий/.test(record.filename)
      ? "Сторонний сборник; карантин, не публикуется"
      : "Справочная база; PDF не публикуется";
  markdown += `| ${record.path} | ${record.sourceId} | ${record.format}; ${record.bytes} байт | ${volume} | ${flags} | ${record.extraction ?? "не извлечён"} | ${use} |\n`;
}
markdown +=
  "\nНаличие ответов и разборов — результат извлечения, не подтверждение их правильности. Для PDF флаги описывают содержание документа, а не импортированные веб-задания. PDF демоверсии ОГЭ имеет 13 физических страниц с разворотами; печатная нумерация внутри отличается.\n\n";
markdown += `Обнаружено **${sources.length} учебных файлов: ${sources.filter((record) => record.format === ".docx").length} DOCX и ${sources.filter((record) => record.format === ".pdf").length} PDF**. Из DOCX выделено **${data.statistics.found} кандидатов**, **${data.statistics.uniqueExact}** уникальных по точному отпечатку условия. У **${data.statistics.withAnswers}** извлечён ответ, у **${data.statistics.withExtractedExplanations}** — разбор. **${data.statistics.found - data.statistics.withAnswers}** кандидатов не имеют извлечённого ключа. PDF не прибавляются к этим числам: сборник дублирует Word, теория учитывается отдельно.\n\n`;
markdown += `Проверено и разрешено манифестом **${records.length} импортированных заданий**; ещё **${data.statistics.found - records.length} кандидатов** не разрешены к публикации (${originalCandidates - records.length} из оригинальных каталогов, ${quarantineCandidates} из стороннего сборника, включая точные дубликаты). Структурно полных кандидатов ${data.statistics.structurallyComplete}; это не методическое одобрение. Окончательное утверждение преподавателем ожидается для всех опубликованных демонстрационных материалов.\n\n`;
markdown += "## Дубликаты и похожие варианты\n\n";
for (const group of data.duplicateGroups)
  markdown += `- Точный дубль: ${group.map((c) => `${c.id} (исходный номер ${c.sourceNumber})`).join("; ")}.\n`;
markdown += `\nНайдено **${data.possibleSimilarOptions.length} групп** совпадающих наборов характеристик в каталоге задания 3. Тексты при этом различаются: это кандидаты для редакторской проверки однообразия, а не автоматически удалённые дубликаты. В опубликованной подборке нет точных дублей.\n\n`;
markdown +=
  "## Проблемы и решения\n\n- У третьестороннего сборника на страницах есть знак 100balnik.com. Имя файла с `fipi` не доказывает право перепубликации. Общие тексты в Word требуют дополнительной сверки; 671 кандидат остаётся в карантине.\n- В теоретических PDF есть оформление ШКОЛКОВО. Использованы темы и проверенные правила для самостоятельных веб-объяснений; полные тексты, изображения и таблицы не копировались.\n- Первые страницы некоторых PDF почти не имеют текста. Текстовый слой остальных страниц извлечён; соответствующие страницы отмечены для визуальной сверки, автоматическое чтение не объявлено OCR.\n- В выбранных заданиях 2/3 исправлены неверные имена участников и объяснение лица прошедшего времени; неоднозначное назывное предложение заменено однозначным. В задании 8 уточнены настоящее время и обращение на «ты». Все исправления перечислены в review-manifest, ответы сверены отдельно.\n- В PDF о НЕ встречаются чрезмерно общие формулировки о цвете, вкусе и степенях сравнения. В веб-уроке правила ограничены контекстом и сверены с Грамотой.ру.\n\n## Карта использования\n\n| Веб-модуль | Локальная основа | Веб-практика |\n|---|---|---|\n| Грамматическая основа | Теория задания 2; DOCX 2, варианты 1–8 | 8 импортированных + 2 сохранённых |\n| Синтаксический анализ | Теория задания 3; DOCX 3, варианты 1–10 | 10 импортированных |\n| Пунктуационный анализ | Теория 4–5; DOCX 5, варианты 1–6, 9–11, 14 | 10 импортированных |\n| Формы слов | Теория 8; DOCX 8, варианты 1–10 | 10 импортированных |\n| Словосочетания | Теория 9; DOCX 9, варианты 1–10 | 10 импортированных |\n| НЕ с прилагательными | Теория 6–7, PDF-страницы 17–19; Грамота.ру | 10 оригинальных учебных |\n| Однородные члены | Теория 4–5, PDF-страницы 20–22; Грамота.ру | 2 сохранённых + 8 новых |\n| Ударение | Нормативные словари / материалы ФИПИ; локальный банк ОГЭ не подменяется банком ЕГЭ | 2 сохранённых + 8 новых |\n\nКаталоги 4, 6, 7 и теория 11, 12, сочинение и собеседование зарегистрированы как база последующих модулей. Их присутствие не превращает незавершённые темы в опубликованные уроки.\n";
await fs.writeFile("docs/ИНВЕНТАРИЗАЦИЯ_МАТЕРИАЛОВ.md", markdown);
console.log("Инвентаризация и карта использования записаны.");
