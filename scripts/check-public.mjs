import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  existsSync,
} from "node:fs";
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
if (existsSync("apps/showcase/dist/images"))
  assets.push(
    ...readdirSync("apps/showcase/dist/images", { recursive: true })
      .filter((path) => typeof path === "string" && path.endsWith(".webp"))
      .map((path) => "images/" + path.split(String.fromCharCode(92)).join("/")),
  );
const currentAudio = JSON.parse(
  readFileSync("apps/showcase/src/oge/materials.json", "utf8"),
).audio;
const browserAudioPlaybacks = [];

const routeSet = new Set(routes);
const retryableStatuses = new Set([429, 500, 502, 503, 504]);
let retriedRequests = 0;
async function fetchPublic(path) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    let response;
    try {
      response = await fetch(new URL(path, base), {
        signal: AbortSignal.timeout(30000),
      });
    } catch (error) {
      if (attempt === 2) throw error;
    }
    if (response && (!retryableStatuses.has(response.status) || attempt === 2))
      return response;
    await response?.body?.cancel();
    retriedRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
  }
}
// Проверяем именно текущий билд, включая имена файлов с хешами.
const pendingPaths = [...routes, ...assets];
let nextPath = 0;
await Promise.all(
  Array.from({ length: 8 }, async () => {
    while (nextPath < pendingPaths.length) {
      const path = pendingPaths[nextPath++];
      const response = await fetchPublic(path);
      assert.equal(response.status, 200, `${path} HTTP ${response.status}`);
      if (routeSet.has(path))
        assert.equal(
          await response.text(),
          readFileSync(`apps/showcase/dist/${path}index.html`, "utf8"),
          `${path}: опубликована другая сборка`,
        );
      else if (path.startsWith("audio/") || path.startsWith("images/")) {
        const bytes = Buffer.from(await response.arrayBuffer());
        assert(
          path.endsWith(".webp")
            ? bytes.toString("ascii", 0, 4) === "RIFF" &&
                bytes.toString("ascii", 8, 12) === "WEBP"
            : path.endsWith(".mp3")
              ? bytes.toString("ascii", 0, 3) === "ID3" ||
                (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
              : bytes.toString("ascii", 0, 4) === "RIFF",
          `${path}: неподтверждённый формат файла`,
        );
        const digest = (value) =>
          createHash("sha256").update(value).digest("hex");
        assert.equal(
          digest(bytes),
          digest(readFileSync(`apps/showcase/dist/${path}`)),
          `${path}: другая версия файла`,
        );
      } else await response.body?.cancel();
    }
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
    await page.locator("h1").click();
    for (const material of currentAudio) {
      const played = await page.evaluate(
        async (path) => {
          const clip = new Audio(path);
          const loaded = new Promise((resolve, reject) => {
            const timer = setTimeout(
              () => reject(Error("Аудиометаданные не загрузились")),
              30000,
            );
            clip.addEventListener(
              "loadedmetadata",
              () => {
                clearTimeout(timer);
                resolve(undefined);
              },
              { once: true },
            );
            clip.addEventListener(
              "error",
              () => {
                clearTimeout(timer);
                reject(Error("Ошибка аудиодекодера"));
              },
              { once: true },
            );
          });
          clip.load();
          await loaded;
          await clip.play();
          await new Promise((resolve) => setTimeout(resolve, 800));
          const result = { duration: clip.duration, elapsed: clip.currentTime };
          clip.pause();
          clip.removeAttribute("src");
          clip.load();
          return result;
        },
        new URL(material.path.slice(1), base).href,
      );
      assert(
        Math.abs(played.duration - material.durationSeconds) < 1,
        material.id + ": длительность не соответствует тексту",
      );
      assert(
        played.elapsed > 0.1,
        material.id + ": браузер не начал воспроизведение",
      );
      browserAudioPlaybacks.push({
        viewport: name,
        id: material.id,
        revision: material.revision,
        ...played,
      });
    }
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
      verifiedAudioFiles: assets.filter((path) => path.startsWith("audio/"))
        .length,
      verifiedImageFiles: assets.filter((path) => path.startsWith("images/"))
        .length,
      browserAudioPlaybacks,
      retriedRequests,
      status: "passed",
    },
    null,
    2,
  ),
);
console.log(
  `Публичный сайт: ${routes.length} страниц, ${assets.length} ассетов — HTTP 200; текущая сборка совпадает.`,
);
