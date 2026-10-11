import fs from "node:fs/promises";
import assert from "node:assert/strict";
const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const file = "content/review-manifest.json",
  manifest = await read(file),
  drafts = await read("private-materials/import/candidates.json");
const existing = await read("content/oge-existing-corrections.json");
const additions = await read("content/oge-review-additions.json");
const expansion = await read("content/oge-expansion-review.json");
const mapping = {
  4: [
    "punktuacionnye-pravila",
    "Правило и предложение",
    "OGE:punctuation.matching",
  ],
  6: [
    "orfograficheskiy-analiz",
    "Объяснение орфограмм",
    "OGE:orthography.analysis",
  ],
  7: ["glasnye-v-tekste", "Гласные в тексте", "OGE:orthography.vowels"],
};
const steps = {
  4: [
    "Прочитайте условия правила А.",
    "Найдите конкретную конструкцию в предложении.",
    "Повторите для Б и В.",
    "Запишите номера в порядке А, Б, В.",
  ],
  6: [
    "Определите часть речи и морфему.",
    "Назовите правило для конкретного написания.",
    "Проверьте все условия в объяснении.",
    "Отберите полностью верные объяснения.",
  ],
  7: [
    "Прочитайте предложение целиком.",
    "Определите форму слова и морфему.",
    "Восстановите каждую гласную по правилу.",
    "Выпишите только позиции с буквой из условия.",
  ],
};
const rights = manifest.approved[0].rightsBasis;
for (const entry of additions.entries) {
  const candidate = drafts.find((c) => c.id === entry.candidateId);
  assert(
    candidate &&
      candidate.fingerprint === entry.fingerprint &&
      candidate.answer === entry.independentKey,
    `${entry.candidateId}: изменилась исходная версия или ключ`,
  );
  const [topicId, topicTitle, skillId] = mapping[entry.taskLine];
  const approval = {
    candidateId: entry.candidateId,
    fingerprint: entry.fingerprint,
    topicId,
    topicTitle,
    skillId,
    misconceptionId: `line-${entry.taskLine}-analysis`,
    answer: entry.independentKey,
    title:
      entry.taskLine === 6
        ? `Орфограммы: ${candidate.options[0].match(/\)\s*([^—]+)/u)?.[1]?.trim() ?? entry.sourceNumber}`
        : `${topicTitle}: вариант ${entry.sourceNumber}`,
    level: "standard",
    rightsBasis: rights,
    reviewedAt: "2026-10-11",
    reviewNote:
      "Полное условие, ключ и объяснения независимо исследованы; внесены перечисленные редакторские исправления. Демонстрационная публикация, окончательное методическое утверждение преподавателем ожидается.",
    steps: steps[entry.taskLine],
    hint: entry.hint,
    corrections: entry.corrections
      .filter((c) => {
        const found = (
          c.field === "question" ? candidate.question : candidate.explanation
        ).some((line) => line.includes(c.before));
        if (!found)
          assert(
            c.field === "explanation" && entry.explanation?.length,
            `${entry.candidateId}: неподтверждённое исправление условия`,
          );
        return found;
      })
      .map((c) => ({ part: c.field, before: c.before, after: c.after })),
    explanation: entry.explanation,
    optionExplanations: entry.optionExplanations,
    subtopic: entry.hint,
  };
  const index = manifest.approved.findIndex(
    (a) => a.candidateId === approval.candidateId,
  );
  if (index < 0) manifest.approved.push(approval);
  else manifest.approved[index] = approval;
}
for (const approval of expansion.approved) {
  const index = manifest.approved.findIndex(
    (a) => a.candidateId === approval.candidateId,
  );
  if (index < 0) manifest.approved.push(approval);
  else manifest.approved[index] = approval;
}
for (const patch of existing.entries) {
  const match = patch.id.match(/^oge-(.+)-(\d{3})$/);
  if (!match) continue;
  const approval = manifest.approved.find(
    (a) =>
      a.topicId === match[1] &&
      drafts.find((c) => c.id === a.candidateId)?.sourceNumber ===
        Number(match[2]),
  );
  assert(approval, `${patch.id}: нет исходного одобрения`);
  for (const field of [
    "hint",
    "prompt",
    "text",
    "acceptedAnswers",
    "optionExplanations",
  ])
    if (patch[field]) approval[field] = patch[field];
  if (patch.explanation) approval.explanation = patch.explanation.split("\n\n");
  approval.revision = 2;
  approval.reviewNote =
    approval.reviewNote.split(" Повторный аудит опубликованного задания")[0] +
    " Повторный аудит опубликованного задания 11.10.2026; подробности в oge-existing-corrections.json.";
}
await fs.writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
console.log(
  `В редакторском реестре ${manifest.approved.length} импортированных заданий.`,
);
