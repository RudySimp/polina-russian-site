import fs from "node:fs/promises";
const stories = JSON.parse(
  await fs.readFile("content/oge-original-summary.json", "utf8"),
);
const file = "apps/showcase/src/oge/materials.json";
const data = JSON.parse(await fs.readFile(file, "utf8"));
data.texts = data.texts.filter((t) => t.kind !== "summary");
data.writing = data.writing.filter((w) => w.line !== 1);
for (const story of stories) {
  const id = `summary-${story.id}`,
    audioId = `audio-${story.id}`;
  data.texts.push({
    id,
    revision: 1,
    title: story.title,
    paragraphs: story.paragraphs,
    kind: "summary",
    authorship: "Оригинальный учебный текст проекта.",
    rightsBasis:
      "Текст создан специально для проекта по поручению владельца; сторонние тексты не копировались.",
    reviewNote:
      "Три микротемы, смысл и варианты сжатия проверены в редакции проекта; окончательное утверждение преподавателем ожидается.",
  });
  data.writing.push({
    id,
    revision: 1,
    line: 1,
    title: `Изложение: ${story.title}`,
    sourceTextId: id,
    audioId,
    prompts: [
      {
        id: "1",
        label: "Сжатое изложение",
        text: "Прослушайте оригинальный учебный текст. Напишите сжатое изложение не менее 70 слов, сохраняя основное содержание всех микротем и лицо повествования. В контрольном режиме доступны два прослушивания с паузой.",
      },
    ],
    checklist: [
      "Я сохранил основные мысли всех трёх микротем.",
      "Я применил сжатие по всему тексту.",
      "Я не добавил собственных рассуждений.",
      "Я сохранил лицо повествования и смысловые связи.",
      "Я проверил абзацы, логику и языковые ошибки.",
    ],
    microtopics: story.microtopics,
    analysis: story.analysis,
  });
}
await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
console.log(
  `Подготовлено ${stories.length} заданий изложения; аудио создаётся отдельным скриптом.`,
);
