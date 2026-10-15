/** Preliminary count; a human resolves abbreviations and context at the thresholds. */
export function wordCount(text: string) {
  const normalized = text
    .normalize("NFC")
    // A surname with one or two initials counts as one word, including unspaced initials.
    .replace(/(?:\p{Lu}\.\s*){1,2}(\p{Lu}\p{Ll}+(?:-\p{Lu}\p{Ll}+)*)/gu, "$1")
    // Only separate service labels are omitted; semantic uses within prose remain.
    .replace(
      /^\s*(?:сочинение(?:\s+13\.[123])?|изложение|смотрите\s+на\s+обороте)\s*[:.!]?\s*$/gimu,
      "",
    )
    // Explicit abbreviated forms are omitted; this list is deliberately not an expert parser.
    .replace(
      /(?<!\p{L})(?:т\s*\.\s*[едп]\s*\.|гг?\.|стр\.|рис\.|см\.|др\.|млн\.|млрд\.|тыс\.)(?!\p{L})/giu,
      "",
    );
  return (normalized.match(/\p{L}+(?:[-‐‑’']\p{L}+)*/gu) ?? []).length;
}
