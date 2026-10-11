import fs from "node:fs/promises";
import assert from "node:assert/strict";
const stories = JSON.parse(
  await fs.readFile("content/oge-original-summary.json", "utf8"),
);
const file = "apps/showcase/src/oge/materials.json",
  data = JSON.parse(await fs.readFile(file, "utf8"));
data.audio = [];
for (const story of stories) {
  const path = `/audio/oge-${story.id}.wav`,
    buffer = await fs.readFile(`apps/showcase/public${path}`);
  assert.equal(buffer.toString("ascii", 0, 4), "RIFF");
  assert.equal(buffer.toString("ascii", 8, 12), "WAVE");
  let offset = 12,
    rate = 0,
    size = 0;
  while (offset + 8 <= buffer.length) {
    const tag = buffer.toString("ascii", offset, offset + 4),
      length = buffer.readUInt32LE(offset + 4);
    if (tag === "fmt ") rate = buffer.readUInt32LE(offset + 16);
    if (tag === "data") size = length;
    offset += 8 + length + (length % 2);
  }
  assert(rate > 0 && size > 0, `${story.id}: пустая аудиозапись`);
  data.audio.push({
    id: `audio-${story.id}`,
    revision: 1,
    textId: `summary-${story.id}`,
    path,
    durationSeconds: Number((size / rate).toFixed(2)),
    kind: "original-synthesized",
    attribution:
      "Учебная синтезированная озвучка оригинального текста проекта · Microsoft Irina Desktop. Не является официальной записью ФИПИ",
    transcript: story.paragraphs.join("\n\n"),
  });
}
await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
console.log(data.audio.map((a) => ({ id: a.id, seconds: a.durationSeconds })));
