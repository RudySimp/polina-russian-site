import fs from "node:fs/promises";
import { rephraseFeedbackMetadata } from "./rephrase-feedback.mjs";
const root = "apps/showcase/src/content";
export const generalRulePath = (exercise) =>
  "/theory/" +
  exercise.topicSlug +
  "/?exam=OGE#" +
  (exercise.taskLine === 4
    ? "match"
    : exercise.taskLine === 7
      ? "gap-localization"
      : "algorithm");
// Matching metadata is based on the stated rule, never on an unrelated
// distractor's explanation. Unknown or overlapping classifications stay general.
export function matchingRuleMetadata(exercise, definitions) {
  return (exercise.rules ?? []).map((rule, ruleIndex) => {
    const candidates = definitions.filter(
      (skill) =>
        skill.line === exercise.taskLine &&
        new RegExp(skill.pattern, "iu").test(rule),
    );
    const skill = candidates.length === 1 ? candidates[0] : undefined;
    return {
      ruleIndex,
      position: Number(exercise.answers[0]?.[ruleIndex] ?? 0),
      skillIds: skill ? [skill.id] : [],
      rulePath: skill?.rulePath ?? generalRulePath(exercise),
      errorType: skill?.errorType ?? "rule-identification",
    };
  });
}
export async function annotateSubskills() {
  const feedback = JSON.parse(
    await fs.readFile("content/oge-rephrase-feedback.json", "utf8"),
  );
  const feedbackEntries = new Map(
    feedback.entries.map((entry) => [entry.id, entry]),
  );
  if (feedbackEntries.size !== feedback.entries.length)
    throw new Error("Duplicate rephrase feedback IDs");

  const definitions = JSON.parse(
    await fs.readFile(root + "/subskills.json", "utf8"),
  );
  const files = (await fs.readdir(root + "/exercises")).filter((name) =>
    name.endsWith(".json"),
  );
  const collections = await Promise.all(
    files.map(async (name) => {
      const file = root + "/exercises/" + name;
      return { file, bank: JSON.parse(await fs.readFile(file, "utf8")) };
    }),
  );
  const current = new Map(
    collections
      .flatMap(({ bank }) => bank.filter((e) => e.exam === "OGE"))
      .map((e) => [e.id, e]),
  );
  // Validate every explicitly reviewed condition before changing any collection.
  const checkedFeedback = new Map();
  for (const entry of feedbackEntries.values()) {
    const exercise = current.get(entry.id);
    if (!exercise)
      throw new Error(
        entry.id + ": feedback refers to an absent current exercise",
      );
    checkedFeedback.set(entry.id, rephraseFeedbackMetadata(exercise, entry));
  }
  for (const { file, bank } of collections) {
    let changed = false;
    for (const e of bank.filter((e) => e.exam === "OGE" && e.taskLine)) {
      if (feedbackEntries.has(e.id)) {
        const constraints = checkedFeedback.get(e.id);
        if (
          JSON.stringify(e.shortAnswerConstraints) !==
          JSON.stringify(constraints)
        ) {
          e.shortAnswerConstraints = constraints;
          changed = true;
        }
      }
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
      const ruleElements =
        e.input === "matching"
          ? matchingRuleMetadata(e, definitionsForLine)
          : undefined;
      const elements = parts.map((p) => {
        if (ruleElements) {
          const rules = ruleElements.filter(
            (rule) => rule.position === p.position,
          );
          return {
            position: p.position,
            skillIds: [...new Set(rules.flatMap((rule) => rule.skillIds))],
            rulePath: rules[0]?.rulePath ?? generalRulePath(e),
            errorType: rules[0]?.errorType ?? "rule-identification",
          };
        }
        const classified = classify(p.text);
        if (e.taskLine === 11) {
          const target = definitionsForLine.find((skill) =>
            new RegExp(skill.pattern, "iu").test(e.prompt + " " + e.subtopic),
          );
          if (target && !classified.some((s) => s.id === target.id))
            classified.push(target);
        }
        return {
          position: p.position,
          skillIds: classified.map((s) => s.id),
          rulePath: classified[0]?.rulePath ?? generalRulePath(e),
          errorType: classified[0]?.errorType ?? "rule-identification",
        };
      });
      const whole = ruleElements
        ? []
        : classify([e.subtopic, e.prompt, e.explanation].join(" "));
      const matched = [
        ...new Set([
          ...elements.flatMap((p) => p.skillIds),
          ...whole.map((s) => s.id),
        ]),
      ];
      const metadata = {
        skillIds: [e.skillId, ...matched],
        elements,
        ...(ruleElements ? { ruleElements } : {}),
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
