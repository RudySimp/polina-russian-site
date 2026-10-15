import fs from "node:fs/promises";
import { createHash } from "node:crypto";
const source = JSON.parse(
  await fs.readFile("content/oge-game-control-cases.json", "utf8"),
);
const filename = "apps/showcase/src/oge/activities.json";
const activities = JSON.parse(await fs.readFile(filename, "utf8"));
const added = new Set(
  source.activities.flatMap((a) =>
    a.situations.map((s) => a.activityId + ":" + s.id),
  ),
);
const baseline = activities.map((a) => ({
  ...a,
  situations: a.situations.filter((s) => !added.has(a.id + ":" + s.id)),
}));
if (
  createHash("sha256").update(JSON.stringify(baseline)).digest("hex") !==
  source.baseline.sha256
)
  throw Error("Existing game conditions changed; re-review before merge.");
for (const group of source.activities) {
  const target = activities.find((a) => a.id === group.activityId);
  if (!target) throw Error("Unknown game " + group.activityId);
  target.situations = [
    ...target.situations.filter((s) => !added.has(target.id + ":" + s.id)),
    ...group.situations,
  ];
}
await fs.writeFile(filename, JSON.stringify(activities, null, 2) + "\n");
console.log(
  "Preserved " +
    source.baseline.situations +
    " situations, added " +
    added.size +
    " independent editorial cases.",
);
