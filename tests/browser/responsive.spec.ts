import { test, expect, chromium } from "@playwright/test";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";

test("Контент, ширины экрана, короткое окно и увеличение до 200%", async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== "desktop");
  test.setTimeout(120000);
  mkdirSync("artifacts", { recursive: true });
  for (const width of [360, 390, 520, 768, 1024, 1280, 1440, 1920]) {
    await page.setViewportSize({ width, height: width === 1024 ? 540 : 1000 });
    for (const path of [
      "",
      "theory/",
      "theory/osnova/",
      "practice/ege-punctuation/",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${path}, ${width}px`,
      ).toBe(true);
      if ([390, 1440].includes(width))
        await page.screenshot({
          path: `artifacts/preview-${width}-${path.replaceAll("/", "-") || "home"}.png`,
          fullPage: true,
        });
    }
  }
  const base = new URL("../../", page.url()).href;
  mkdirSync(".cache", { recursive: true });
  const context = await chromium.launchPersistentContext(
    mkdtempSync(resolve(".cache/zoom-")),
    {
      channel: process.env.CI ? undefined : "chrome",
      headless: true,
      viewport: { width: 1280, height: 800 },
    },
  );
  try {
    const settings = await context.newPage();
    await settings.goto("chrome://settings/");
    const zoomPage = await context.newPage();
    for (const zoom of [1, 1.25, 1.5, 2]) {
      // Меняем действительный масштаб отдельного тестового профиля Chromium.
      await settings.evaluate((value) => {
        (
          window as unknown as {
            chrome: {
              settingsPrivate: { setDefaultZoom: (zoom: number) => void };
            };
          }
        ).chrome.settingsPrivate.setDefaultZoom(value);
      }, zoom);
      await zoomPage.goto(new URL("theory/slovosochetaniya/", base).href);
      await expect(zoomPage.locator("h1")).toHaveText(
        "Связь в словосочетаниях",
      );
      const geometry = await zoomPage.evaluate(() => ({
        width: innerWidth,
        ratio: devicePixelRatio,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      expect(Math.abs(geometry.width - 1280 / zoom)).toBeLessThan(2);
      expect(geometry.ratio).toBeCloseTo(zoom, 1);
      expect(geometry.overflow).toBe(false);
      await expect(
        zoomPage.getByRole("navigation", { name: "Содержание урока" }),
      ).toBeVisible();
      await zoomPage.screenshot({ path: `artifacts/zoom-${zoom * 100}.png` });
    }
  } finally {
    await context.close();
  }
});
