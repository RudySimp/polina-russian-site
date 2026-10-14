import fs from "node:fs/promises";
const root = "apps/showcase/src/content";
export async function annotateSubskills() {
  const definitions = JSON.parse(
    await fs.readFile(root + "/subskills.json", "utf8"),
  );
  for (const filename of (await fs.readdir(root + "/exercises")).filter((f) =>
    f.endsWith(".json"),
  )) {
    const file = root + "/exercises/" + filename;
    const bank = JSON.parse(await fs.readFile(file, "utf8"));
    let changed = false;
    for (const e of bank.filter((e) => e.exam === "OGE" && e.taskLine)) {
      const definitionsForLine = definitions.filter(
        (s) => s.line === e.taskLine,
      );
      const classify = (text) =>
        definitionsForLine.filter((s) =>
          new RegExp(s.pattern, "iu").test(text),
        );
      let parts = e.options.map((o, n) => ({
        position: n + 1,
        text: o + " " + (e.optionExplanations[n] ?? ""),
      }));
      if (!parts.length && e.responseKind === "digits_sequence")
        parts = [
          ...e.explanation.matchAll(
            /(?:^|\n)(?:\((\d+)\)|(\d+)\))\s*([^\n]+)/gu,
          ),
        ].map((m) => ({ position: Number(m[1] ?? m[2]), text: m[3] }));
      const elements = parts.map((p) => {
        const skills = classify(p.text);
        if (e.taskLine === 11) {
          const target = definitionsForLine.find((skill) =>
            new RegExp(skill.pattern, "iu").test(e.prompt + " " + e.subtopic),
          );
          if (target && !skills.some((s) => s.id === target.id))
            skills.push(target);
        }
        return {
          position: p.position,
          skillIds: skills.map((s) => s.id),
          rulePath:
            skills[0]?.rulePath ??
            "/theory/" + e.topicSlug + "/?exam=OGE#algorithm",
          errorType: skills[0]?.errorType ?? "rule-identification",
        };
      });
      const whole = classify([e.subtopic, e.prompt, e.explanation].join(" "));
      const matched = [
        ...new Set([
          ...elements.flatMap((p) => p.skillIds),
          ...whole.map((s) => s.id),
        ]),
      ];
      const metadata = {
        skillIds: [e.skillId, ...matched],
        elements,
        rulePaths: [
          ...new Set([
            ...elements.map((p) => p.rulePath),
            ...whole.map((s) => s.rulePath),
          ]),
        ],
        originCategory: e.format === "exam-model" ? "author-model" : "learning",
        classificationReview: "editorial-draft",
      };
      if (
        JSON.stringify(
          Object.fromEntries(Object.keys(metadata).map((k) => [k, e[k]])),
        ) !== JSON.stringify(metadata)
      ) {
        Object.assign(e, metadata);
        changed = true;
      }
    }
    if (changed) await fs.writeFile(file, JSON.stringify(bank, null, 2) + "\n");
  }
}
