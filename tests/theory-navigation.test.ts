import { describe, expect, it } from "vitest";
import {
  safeTheoryCatalogPath,
  theoryCatalogReturn,
  withTheoryOrigin,
} from "../apps/showcase/src/lib/theory-navigation";
import { modulePath } from "../apps/showcase/src/content/course";
describe("Theory catalogue context stays local and does not nest itself", () => {
  it("preserves existing OGE and EGE catalogue queries exactly", () => {
    for (const path of [
      "/oge/theory/?exam=OGE&topic=osnova&q=%D0%BD%D0%B5&page=2",
      "/theory/?exam=EGE&section=orfografiya&q=ё",
    ])
      expect(safeTheoryCatalogPath(path)).toBe(path);
  });
  it("rejects external, ambiguous or non-catalogue origins instead of emitting a return link", () => {
    for (const path of [
      "https://example.org/theory/",
      "//example.org/theory/",
      "javascript:alert(1)",
      "/theory/../oge/",
      "/theory/modules/id/",
      "/oge/theory/modules/id/",
      "/theory/\\evil",
      "/theory/?q=bad\nvalue",
      "/theory/?q=" + "a".repeat(1000),
    ])
      expect(safeTheoryCatalogPath(path), path).toBeUndefined();
    expect(
      theoryCatalogReturn("https://example.org", "/theory/?exam=EGE"),
    ).toBe("/theory/?exam=EGE");
    expect(modulePath("osnova-subject", "https://example.org")).toBe(
      "/oge/theory/modules/osnova-subject/",
    );
  });
  it("replaces an accepted origin once while keeping the target exam and paragraph anchor", () => {
    const origin =
      "/oge/theory/?topic=orfograficheskiy-analiz&q=%D0%BD%D0%B5&page=2";
    const first = withTheoryOrigin(
      "/theory/osnova/?exam=OGE&from=%2Ftheory%2F#subject-forms",
      origin,
    );
    const parsed = new URL(first, "https://test.invalid");
    expect(parsed.searchParams.get("exam")).toBe("OGE");
    expect(parsed.hash).toBe("#subject-forms");
    expect(parsed.searchParams.getAll("from")).toEqual([origin]);
    expect(withTheoryOrigin(first, origin)).toBe(first);
    expect(modulePath("osnova-subject")).toBe(
      "/oge/theory/modules/osnova-subject/",
    );
  });
});
