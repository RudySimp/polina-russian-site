const localOrigin = "https://theory.invalid";
/** Keep only the two existing catalogue routes; a return value is never an external URL. */
export function safeTheoryCatalogPath(
  value: string | null | undefined,
): string | undefined {
  if (
    !value ||
    value.length >= 1000 ||
    /[\u0000-\u001f\u007f\\]/u.test(value) ||
    !/^\/(?:theory|oge\/theory)\/(?:\?|$)/u.test(value)
  )
    return;
  try {
    const url = new URL(value, localOrigin);
    if (
      url.origin === localOrigin &&
      ["/theory/", "/oge/theory/"].includes(url.pathname)
    )
      return value;
  } catch {}
}
export function theoryCatalogReturn(
  value: string | null | undefined,
  fallback: string,
): string {
  return safeTheoryCatalogPath(value) ?? fallback;
}
/** Replace, rather than nest, the accepted catalogue origin while preserving target query and anchor. */
export function withTheoryOrigin(path: string, from?: string | null): string {
  const origin = safeTheoryCatalogPath(from);
  if (!origin) return path;
  const url = new URL(path, localOrigin);
  url.searchParams.set("from", origin);
  return url.pathname + url.search + url.hash;
}
