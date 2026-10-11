import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
const base =
  process.env.PUBLIC_URL || "https://rudysimp.github.io/polina-russian-site/";
const routes = JSON.parse(
  readFileSync("apps/showcase/dist/routes.json", "utf8"),
).map((path) => path.slice(1));
const assets = readdirSync("apps/showcase/dist/assets")
  .map((file) => `assets/${file}`)
  .concat(["favicon.svg", "routes.json"]);
assets.push(
  ...readdirSync("apps/showcase/dist/audio").map((file) => `audio/${file}`),
);
const localHtml = readFileSync("apps/showcase/dist/index.html", "utf8");
// Проверяем именно текущий билд, включая имена файлов с хешами.
await Promise.all(
  [...routes, ...assets].map(async (path) => {
    const response = await fetch(new URL(path, base), {
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200, `${path} HTTP ${response.status}`);
    if (routes.includes(path))
      assert.equal(
        await response.text(),
        localHtml,
        `${path}: опубликована другая сборка`,
      );
    else if (path.startsWith("audio/")) {
      const bytes = Buffer.from(await response.arrayBuffer());
      assert.equal(
        bytes.toString("ascii", 0, 4),
        "RIFF",
        `${path}: не аудиозапись WAV`,
      );
      const digest = (value) =>
        createHash("sha256").update(value).digest("hex");
      assert.equal(
        digest(bytes),
        digest(readFileSync(`apps/showcase/dist/${path}`)),
        `${path}: другая версия аудио`,
      );
    } else await response.body?.cancel();
  }),
);
const browser = await chromium.launch({
  channel: process.env.CI ? undefined : "chrome",
});
try {
  mkdirSync("artifacts", { recursive: true });
  for (const [name, viewport] of [
    ["desktop", { width: 1440, height: 1100 }],
    ["mobile", { width: 390, height: 844 }],
  ]) {
    const page = await browser.newPage({ viewport });
    await page.goto(base, { waitUntil: "networkidle" });
    assert.match(
      await page.locator("h1").innerText(),
      /Русский язык\s*становится понятнее\./,
    );
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      "Горизонтальное переполнение",
    );
    await page.screenshot({
      path: `artifacts/published-${name}.png`,
      fullPage: true,
    });
    await page.goto(new URL("theory/osnova/", base).href, {
      waitUntil: "networkidle",
    });
    assert.equal(await page.locator("h1").innerText(), "Грамматическая основа");
    await page.screenshot({
      path: `artifacts/published-lesson-${name}.png`,
      fullPage: true,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
writeFileSync(
  "artifacts/public-check.json",
  JSON.stringify(
    {
      base,
      checkedAt: new Date().toISOString(),
      routes: routes.length,
      assets: assets.length,
      currentBuildMatches: true,
      verifiedAudioFiles: 5,
      status: "passed",
    },
    null,
    2,
  ),
);
console.log(
  `Публичный сайт: ${routes.length} страниц, ${assets.length} ассетов — HTTP 200; текущая сборка совпадает.`,
);
