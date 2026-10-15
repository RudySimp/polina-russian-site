import fs from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
const read = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const batch = await read("content/oge-writing-batch-2026-10-15.json");
const admission = await read("content/oge-writing-admission-2026-10-15.json");
assert.equal(batch.stage, "checked-demo");
assert.equal(admission.mode, "checked-demo");
assert.equal(admission.teacherApproval, "pending");
assert.equal(admission.hashEncoding, "compact-json-v1");
assert.equal(createHash("sha256").update(JSON.stringify(batch)).digest("hex"), admission.sha256, "Changed writing batch requires independent reading");
assert.deepEqual(batch.guides.map((guide) => guide.id), admission.guideIds);
const materials = await read("apps/showcase/src/oge/materials.json");
const file = "apps/showcase/src/oge/writing-guides.json";
const current = await read(file);
const before = JSON.stringify(current);
for (const guide of batch.guides) {
  assert.equal(guide.provenance.teacherApproval, "pending");
  const writing = materials.writing.find((item) => item.id === guide.writingId);
  const text = materials.texts.find((item) => item.id === guide.sourceTextId);
  assert(writing && text);
  assert.equal(writing.revision, guide.writingRevision);
  assert.equal(text.revision, guide.sourceTextRevision);
  assert.equal(writing.sourceTextId, text.id);
  assert.deepEqual(guide.routes.map((route) => route.promptId), writing.prompts.map((prompt) => prompt.id));
  for (const route of guide.routes) {
    assert(route.strong.text.trim() && route.weak.text.trim());
    assert.deepEqual(route.criteriaNotes.map((note) => note.code), ["СК1", "СК2", "СК3", "СК4"]);
    for (const stage of route.stages) assert(route.strong.text.includes(stage.text + " " + stage.explanation), "Stage must be a real explained part of the strong answer");
  }
  const previous = current.guides.find((item) => item.id === guide.id);
  if (previous) assert.deepEqual(previous, guide, guide.id + ": existing reviewed guide cannot be silently replaced");
  else current.guides.push(guide);
}
assert.equal(batch.guides.length, 2);
if (JSON.stringify(current) !== before) await fs.writeFile(file, JSON.stringify(current, null, 2) + "\n");
console.log("Writing guides: " + current.guides.length + " guides / " + current.guides.reduce((sum, guide) => sum + guide.routes.length, 0) + " routes; all previous guides retained unchanged.");
