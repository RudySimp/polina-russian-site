import type { ActivitySituation } from "./model";
export function normalizeActivity(answer: string) {
  const normalized = answer
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("ru")
    .replace(/ё/gu, "е")
    .replace(/\s+/gu, " ");
  return /^\d+(?:,\d+)*$/u.test(normalized)
    ? [...new Set(normalized.split(","))]
        .sort((a, b) => Number(a) - Number(b))
        .join(",")
    : normalized;
}
export function checkActivity(
  situation: ActivitySituation,
  answers: Record<string, string>,
) {
  return situation.fields
    .filter((field) => field.expected.length)
    .map((field) => ({
      field,
      correct: field.expected.some(
        (expected) =>
          normalizeActivity(expected) ===
          normalizeActivity(answers[field.id] ?? ""),
      ),
    }));
}
