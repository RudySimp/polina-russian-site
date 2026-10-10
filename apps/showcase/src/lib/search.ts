export const normalizeSearch = (value: string) =>
  value
    .normalize("NFC")
    .toLocaleLowerCase("ru")
    .replaceAll("ё", "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
export function matchesSearch(query: string, values: string[]): boolean {
  const words = normalizeSearch(values.join(" ")).split(" ");
  return normalizeSearch(query)
    .split(" ")
    .filter(Boolean)
    .every((token) =>
      words.some((word) =>
        token.length <= 2 ? word === token : word.startsWith(token),
      ),
    );
}
export const examName = (exam: string) => (exam === "OGE" ? "ОГЭ" : "ЕГЭ");
export const levelName = (level: string) =>
  ({ basic: "Базовый", standard: "Средний", advanced: "Повышенный" })[level] ??
  level;
