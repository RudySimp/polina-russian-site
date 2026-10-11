import fs from "node:fs/promises";
import assert from "node:assert/strict";
const file = "apps/showcase/src/oge/materials.json",
  data = JSON.parse(await fs.readFile(file, "utf8"));
const bank = [];
for (const name of (
  await fs.readdir("apps/showcase/src/content/exercises")
).filter((n) => n.endsWith(".json")))
  bank.push(
    ...JSON.parse(
      await fs.readFile(`apps/showcase/src/content/exercises/${name}`, "utf8"),
    ),
  );
const stories = ["bench", "draft", "boat", "letter", "rehearsal"],
  syntax = ["route", "workshop", "dawn", "museum", "news"],
  summaries = [
    "reading",
    "memory",
    "responsibility",
    "friendship",
    "curiosity",
  ];
const topic = {
  4: "punktuacionnye-pravila",
  5: "punktuacionnyy-analiz",
  6: "orfograficheskiy-analiz",
  7: "glasnye-v-tekste",
  8: "formy-slov",
  9: "slovosochetaniya",
};
data.variants = [];
for (let n = 0; n < 5; n++) {
  const ids = [
    `oge-osnova-syntax-${syntax[n]}`,
    `oge-sintaksis-syntax-${syntax[n]}`,
    ...[4, 5, 6, 7, 8, 9].map(
      (line) => `oge-${topic[line]}-${String(n + 1).padStart(3, "0")}`,
    ),
    ...["analiz-teksta", "vyrazitelnost", "leksika"].map(
      (topic) => `oge-${topic}-reading-${stories[n]}`,
    ),
  ];
  const items = ids.map((id) => {
    const exercise = bank.find((e) => e.id === id);
    assert(exercise, `Нет ${id}`);
    return exercise;
  });
  data.variants.push({
    id: `oge-2027-full-${n + 1}`,
    number: n + 1,
    revision: 1,
    specificationId: "oge-ru-2027-project",
    title: `Учебный вариант № ${n + 1}`,
    kind: "full",
    assignments: items.map((e) => ({ id: e.id, revision: e.revision })),
    sourceTextIds: [
      `syntax-${syntax[n]}`,
      `reading-${stories[n]}`,
      `summary-${summaries[n]}`,
    ],
    writingIds: [`summary-${summaries[n]}`, `essay-${stories[n]}`],
    status: "published",
    reviewStage: "publication-approved",
    teacherApproval: "pending",
  });
}
await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
console.log("Фиксированных полных учебных вариантов:", data.variants.length);
