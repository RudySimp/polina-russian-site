import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { chromium, expect } from "@playwright/test";

const base =
  process.env.BENCHMARK_URL ?? "http://localhost:4174/polina-russian-site/";
const directory =
  process.env.BANK_BENCHMARK_DIRECTORY ?? "artifacts/bank-benchmark";
const collectionSize = 20;
await fs.mkdir(directory, { recursive: true });
const originalIndex = JSON.parse(
  await fs.readFile("apps/showcase/src/content/exercise-index.json", "utf8"),
);
const originalSearch = JSON.parse(
  await fs.readFile("apps/showcase/src/content/exercise-search.json", "utf8"),
);
const originalSearchById = new Map(
  originalSearch.map((item) => [item.id, item.text]),
);
const bank = (
  await Promise.all(
    (await fs.readdir("apps/showcase/src/content/exercises"))
      .filter((name) => name.endsWith(".json"))
      .map(async (name) =>
        JSON.parse(
          await fs.readFile(
            `apps/showcase/src/content/exercises/${name}`,
            "utf8",
          ),
        ),
      ),
  )
).flat();
const originalById = new Map(bank.map((exercise) => [exercise.id, exercise]));
const sources = originalIndex.filter(
  (item) =>
    item.exam === "OGE" &&
    item.taskLine >= 2 &&
    item.taskLine <= 12 &&
    item.format === "exam-model",
);

function fixture(size) {
  const index = originalIndex.map((item) => ({ ...item }));
  const conditions = originalIndex.map((item) => originalById.get(item.id));
  const search = originalSearch.map((item) => ({ ...item }));
  while (index.length < size) {
    const number = index.length + 1;
    const source =
      sources[(number - originalIndex.length - 1) % sources.length];
    const id = `benchmark-${String(number).padStart(5, "0")}`;
    const title = `${source.title} · тестовая запись ${number}`;
    const exercise = {
      ...structuredClone(originalById.get(source.id)),
      id,
      slug: id,
      title,
    };
    // Synthetic clones have their own explicit educational receipt; no human review is claimed.
    exercise.publicationReview = {
      revision: exercise.revision,
      by: "Synthetic load fixture",
      at: "2026-10-15",
      mode: "checked-demo",
      condition: true,
      key: true,
      alternatives: true,
      explanation: true,
      rights: true,
    };
    exercise.prompt +=
      " Синтетический маркер нагрузочной проверки: нагрузочныймаркер.";
    conditions.push(exercise);
    index.push({ ...source, id, slug: id, title });
    search.push({
      id,
      text: `${originalSearchById.get(source.id) ?? ""} нагрузочныймаркер`,
    });
  }
  assert.equal(index.length, size);
  assert.equal(new Set(index.map((item) => item.id)).size, size);
  assert(
    conditions.every(
      (item) =>
        item &&
        item.prompt &&
        item.answers.length &&
        item.explanation &&
        item.revision > 0,
    ),
  );
  const shards = [];
  // Same collection size and addressing model as the production loader.
  for (const group of Map.groupBy(
    conditions,
    (exercise) => `${exercise.exam}:${exercise.topicId}`,
  ).values()) {
    for (let offset = 0; offset < group.length; offset += collectionSize)
      shards.push(group.slice(offset, offset + collectionSize));
  }
  const loader = `export const collections = [${shards
    .map(
      (items, number) =>
        `{ ids: ${JSON.stringify(items.map((item) => item.id))}, lines: ${JSON.stringify(
          [
            ...new Set(
              items
                .filter((item) => item.exam === "OGE")
                .map((item) => item.taskLine)
                .filter(Boolean),
            ),
          ],
        )}, load: () => fetch(${JSON.stringify(new URL(`__benchmark__/shard-${number}.json`, base).href)}).then(response => { if (!response.ok) throw Error('Fixture unavailable'); return response.json(); }) }`,
    )
    .join(",")}];`;
  return { size, index, search, shards, loader };
}

async function clocked(action) {
  const start = performance.now();
  await action();
  return Math.round((performance.now() - start) * 10) / 10;
}

async function currentWork(page) {
  return page.evaluate(async () => {
    const id = new URLSearchParams(location.search).get("id");
    const snapshot = JSON.parse(
      localStorage.getItem("polina-oge-work-v1:" + id),
    );
    const state = JSON.parse(
      localStorage.getItem("polina-oge-state-v2:" + id) ?? "null",
    );
    if (snapshot) return { ...snapshot, ...(state?.state ?? {}) };
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open("polina-oge-works-v2", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      const transaction = db.transaction(["snapshots", "drafts"], "readonly");
      const get = (name) =>
        new Promise((resolve, reject) => {
          const request = transaction.objectStore(name).get(id);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });
      const [base, draft] = await Promise.all([
        get("snapshots"),
        get("drafts"),
      ]);
      return { ...base, ...draft };
    } finally {
      db.close();
    }
  });
}

async function install(page, data, counters) {
  await page.route("**/src/content/exercise-index.json*", async (route) => {
    counters.metadataLoads++;
    await route.fulfill({
      contentType: "text/javascript",
      body: `export default ${JSON.stringify(data.index)};`,
    });
  });
  await page.route("**/src/content/exercise-search.json*", async (route) => {
    counters.searchLoads++;
    await route.fulfill({
      contentType: "text/javascript",
      body: `export default ${JSON.stringify(data.search)};`,
    });
  });
  await page.route("**/src/content/exercise-loaders.ts*", async (route) => {
    await route.fulfill({ contentType: "text/javascript", body: data.loader });
  });
  await page.route("**/__benchmark__/shard-*.json", async (route) => {
    const number = Number(
      new URL(route.request().url()).pathname.match(/shard-(\d+)\.json$/)[1],
    );
    const body = JSON.stringify(data.shards[number]);
    counters.conditionLoads.push({
      document: counters.document,
      shard: number,
      conditions: data.shards[number].length,
      bytes: Buffer.byteLength(body),
    });
    await route.fulfill({ contentType: "application/json", body });
  });
}

async function run(browser, data, width) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
  });
  const page = await context.newPage();
  const counters = { metadataLoads: 0, searchLoads: 0, conditionLoads: [], document: 0 };
  page.on("framenavigated", frame => {if (frame === page.mainFrame()) counters.document++;});
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await install(page, data, counters);
  const cpuSlowdown = width === 390 ? 4 : 1;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpuSlowdown });
  const times = {};
  try {
    times.homeCold = await clocked(async () => {
      await page.goto(base);
      await expect(page.locator("main h1")).toBeVisible();
    });
    assert.equal(
      counters.conditionLoads.length,
      0,
      "Home loaded full conditions",
    );
    assert.equal(
      counters.searchLoads,
      0,
      "Home loaded the full condition search corpus",
    );
    times.bankCold = await clocked(async () => {
      await page.goto(new URL("oge/bank/2/", base).href);
      await expect(page.locator(".exercise-card")).toHaveCount(10);
    });
    const launch = await page
      .getByRole("button", { name: "5 заданий", exact: true })
      .boundingBox();
    assert(
      launch.y + launch.height <= 844,
      "Training launch is below the first screen",
    );
    assert.equal(
      counters.conditionLoads.length,
      0,
      "Compact bank loaded full conditions",
    );
    await page.screenshot({
      path: `${directory}/bank-${data.size}-${width}.png`,
    });
    const countBeforeSearch = await page.locator(".results-count").innerText();
    times.conditionSearch = await clocked(async () => {
      await page
        .getByRole("textbox", { name: "Найти задание", exact: true })
        .fill("нагрузочныймаркер");
      await page
        .getByRole("textbox", { name: "Найти задание", exact: true })
        .blur();
      await expect(page.locator(".exercise-card")).toHaveCount(10);
      await expect(page.locator(".exercise-card").first()).toContainText(
        "тестовая запись",
      );
    });
    times.discreteFilter = await clocked(async () => {
      await page.locator(".oge-bank-filters summary").click();
      const filter = page.getByRole("combobox", {
        name: "Сложность",
        exact: true,
      });
      const value = await filter
        .locator("option")
        .evaluateAll(
          (options) =>
            options.find((option) => option.value && !option.disabled)?.value,
        );
      assert(value, "A nonempty level filter must be available");
      await filter.selectOption(value);
      await expect(page.locator(".exercise-card")).toHaveCount(10);
    });
    times.pagination = await clocked(async () => {
      await page
        .getByRole("button", { name: "Следующая", exact: true })
        .click();
      await expect(page.locator(".pagination")).toContainText("Страница 2");
    });
    const returnTo = page.url();
    const addressStart = counters.conditionLoads.length;
    times.openOne = await clocked(async () => {
      await page.locator(".exercise-card").first().click();
      await expect(
        page.getByRole("heading", { name: "Условие", exact: true }),
      ).toBeVisible();
    });
    const addressed = counters.conditionLoads.slice(addressStart);
    assert.equal(
      addressed.length,
      1,
      "Opening one exercise must load one shard",
    );
    assert(addressed[0].conditions <= collectionSize);
    times.browserBack = await clocked(async () => {
      await page.goBack();
      await expect(page).toHaveURL(returnTo);
      await expect(
        page.getByRole("textbox", { name: "Найти задание", exact: true }),
      ).toHaveValue("нагрузочныймаркер");
      await expect(page.locator(".pagination")).toContainText("Страница 2");
    });
    await page
      .getByRole("button", { name: "Сбросить фильтры", exact: true })
      .click();
    const trainingStart = counters.conditionLoads.length;
    times.startAndSaveFive = await clocked(async () => {
      await page
        .getByRole("button", { name: "5 заданий", exact: true })
        .click();
      await expect(page.locator("#work-question")).toBeVisible();
    });
    const session = await currentWork(page);
    assert.equal(session.items.length, 5);
    const training = counters.conditionLoads.slice(trainingStart);
    assert(
      training.reduce((sum, item) => sum + item.conditions, 0) <=
        5 * collectionSize,
    );
    const exercise = session.items[session.activeIndex].exercise;
    times.answerAndSave = await clocked(async () => {
      await page
        .locator("#work-question")
        .getByLabel("Ваш ответ", { exact: true })
        .fill(exercise.answers[0]);
      await page
        .locator("#work-question")
        .getByRole("button", { name: "Проверить ответ", exact: true })
        .click();
      await expect
        .poll(async () => (await currentWork(page)).answers[exercise.id])
        .toBe(exercise.answers[0]);
    });
    const history = await page.evaluate(() => {
      const id = new URLSearchParams(location.search).get("id");
      const snapshot = JSON.parse(
        localStorage.getItem("polina-oge-work-v1:" + id),
      );
      const index = JSON.parse(
        localStorage.getItem("polina-oge-index-v2:" + id),
      );
      const state = JSON.parse(
        localStorage.getItem("polina-oge-state-v2:" + id),
      );
      if (!snapshot || !index)
        throw Error("A compact saved-work index is required");
      let snapshotBytes = 0,
        indexBytes = 0;
      for (let number = 0; number < 100; number++) {
        const copyId = crypto.randomUUID();
        const work = {
          ...snapshot,
          id: copyId,
          title: "Синтетическая история " + number,
        };
        const summary = { ...index, id: copyId, title: work.title };
        const workText = JSON.stringify(work),
          indexText = JSON.stringify(summary);
        localStorage.setItem("polina-oge-work-v1:" + copyId, workText);
        localStorage.setItem("polina-oge-index-v2:" + copyId, indexText);
        if (state)
          localStorage.setItem(
            "polina-oge-state-v2:" + copyId,
            JSON.stringify(state),
          );
        snapshotBytes += new TextEncoder().encode(workText).length;
        indexBytes += new TextEncoder().encode(indexText).length;
      }
      return { works: 101, snapshotBytes, indexBytes };
    });
    await page.addInitScript(() => {
      window.__bankStorageReads = [];
      const originalGet = Storage.prototype.getItem;
      Storage.prototype.getItem = function (key) {
        const value = originalGet.call(this, key);
        window.__bankStorageReads.push({
          key,
          bytes: value ? new TextEncoder().encode(value).length : 0,
        });
        return value;
      };
    });
    const individualAttemptIds = await page.evaluate(() =>
      JSON.parse(
        localStorage.getItem("polina-showcase-attempts-v1") ?? "[]",
      ).map((attempt) => attempt.exerciseId),
    );
    const historicalAttemptShards = new Set(
      data.shards.flatMap((items, number) =>
        items.some((item) => individualAttemptIds.includes(item.id))
          ? [number]
          : [],
      ),
    );
    const historyStart = counters.conditionLoads.length;
    times.homeWithHistory = await clocked(async () => {
      await page.goto(new URL("oge/", base).href);
      await expect(page.locator(".oge-quick-start").first()).toContainText(
        "Сохранённая работа",
      );
    });
    const homeReads = await page.evaluate(() => window.__bankStorageReads);
    assert.equal(
      homeReads.filter((item) => item.key.startsWith("polina-oge-work-v1:"))
        .length,
      0,
      "Overview re-read full historical snapshots",
    );
    const historyConditionLoads = counters.conditionLoads.slice(historyStart);
    assert(
      historyConditionLoads.every((item) =>
        historicalAttemptShards.has(item.shard),
      ),
      "History loaded an unrelated condition shard",
    );
    assert(
      historyConditionLoads.length <= historicalAttemptShards.size,
      "History repeatedly loaded condition shards",
    );
    times.historyList = await clocked(async () => {
      await page.goto(new URL("oge/results/", base).href);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("main")).toContainText("Синтетическая история");
    });
    const listReads = await page.evaluate(() => window.__bankStorageReads);
    const generatorStart = counters.conditionLoads.length;
    times.openGenerator = await clocked(async () => {
      await page.goto(new URL("oge/generator/", base).href);
      await expect(
        page.getByRole("button", { name: "Сформировать вариант", exact: true }),
      ).toBeVisible();
    });
    const openGeneratorLoads = counters.conditionLoads.slice(generatorStart);
    assert(
      openGeneratorLoads.every((item) =>
        historicalAttemptShards.has(item.shard),
      ),
      "Opening generator loaded unrelated conditions",
    );
    const generateStart = counters.conditionLoads.length;
    times.generateAndSaveFull = await clocked(async () => {
      await page
        .getByRole("button", { name: "Сформировать вариант", exact: true })
        .click();
      await expect(page.locator("#work-question")).toBeVisible({
        timeout: 60000,
      });
    });
    const fullVariant = await currentWork(page);
    assert.equal(
      fullVariant.items.length,
      13,
      "Full variant must have 13 exam positions",
    );
    assert.equal(
      fullVariant.items.filter((item) => item.kind === "writing").length,
      2,
    );
    assert.equal(
      new Set(
        fullVariant.items
          .filter((item) => item.kind === "exercise")
          .map((item) => item.exercise.id),
      ).size,
      11,
    );
    const fullVariantLoads = counters.conditionLoads.slice(generatorStart);
    const generateLoads = counters.conditionLoads.slice(generateStart);
    const selectedIds = new Set(
      fullVariant.items
        .filter((item) => item.kind === "exercise")
        .map((item) => item.exercise.id),
    );
    const selectedShards = new Set(
      data.shards.flatMap((items, number) =>
        items.some((item) => selectedIds.has(item.id)) ? [number] : [],
      ),
    );
    assert(
      generateLoads.every(
        (item) =>
          selectedShards.has(item.shard) ||
          historicalAttemptShards.has(item.shard),
      ),
      "Generation loaded an unrelated condition shard",
    );
    assert(
      generateLoads.reduce((sum, item) => sum + item.conditions, 0) <=
        (11 + 2 * historicalAttemptShards.size) * collectionSize,
      "Generation loaded excessive conditions",
    );
    for (const loads of Map.groupBy(generateLoads, item => item.document).values()) {
      assert.equal(new Set(loads.map(item => item.shard)).size, loads.length, "One document requested the same condition shard twice");
    }
    // Generation ends with a document navigation. The addressed attempt-history shard may load once in each document.
    await page.screenshot({
      path: `${directory}/full-variant-${data.size}-${width}.png`,
    });
    await page.goto(new URL("oge/bank/", base).href);
    const portion = page.getByRole("button", { name: /^Порция 100 из / });
    await expect(portion).toBeVisible();
    const portionLabel = await portion.innerText();
    await page.getByText("Размер, режим и отбор", { exact: true }).click();
    await expect(
      page
        .getByRole("combobox", { name: "Количество", exact: true })
        .locator('option[value="all"]'),
    ).toHaveJSProperty("disabled", true);
    times.startAndSaveAllPortion = await clocked(async () => {
      await portion.click();
      await expect(page.locator("#work-question")).toBeVisible();
    });
    const portionWork = await currentWork(page);
    assert.equal(
      portionWork.items.length,
      100,
      "All must be an explicit bounded portion",
    );
    const portionId = portionWork.id;
    times.reloadAllPortion = await clocked(async () => {
      await page.reload();
      await expect(page.locator("#work-question")).toBeVisible();
    });
    const rereadPortion = await currentWork(page);
    assert.equal(rereadPortion.id, portionId);
    assert.deepEqual(
      rereadPortion.items,
      portionWork.items,
      "The entire saved portion must survive reload unchanged",
    );
    assert.equal(rereadPortion.items.length, 100);
    const portionBytes = Buffer.byteLength(JSON.stringify(portionWork));
    const result = {
      allPortion: {
        label: portionLabel,
        items: 100,
        bytes: portionBytes,
        readAfterReload: true,
        immutableItems: true,
      },
      size: data.size,
      width,
      cpuSlowdown,
      times,
      countBeforeSearch,
      launchBottom: launch.y + launch.height,
      metadataBytes: Buffer.byteLength(JSON.stringify(data.index)),
      searchBytes: Buffer.byteLength(JSON.stringify(data.search)),
      addressed,
      training,
      openGeneratorLoads,
      generateLoads,
      fullVariantLoads,
      history: {
        ...history,
        historyConditionLoads,
        homeReadBytes: homeReads.reduce((sum, item) => sum + item.bytes, 0),
        listReadBytes: listReads.reduce((sum, item) => sum + item.bytes, 0),
        fullSnapshotReads: listReads.filter((item) =>
          item.key.startsWith("polina-oge-work-v1:"),
        ).length,
      },
      counters,
      errors,
    };
    assert.equal(
      result.history.fullSnapshotReads,
      0,
      "Results list re-read complete works",
    );
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({
        size: result.size,
        width,
        times,
        addressedConditions: addressed[0].conditions,
        historySnapshotReads: result.history.fullSnapshotReads,
      }),
    );
    return result;
  } catch (error) {
    await fs.writeFile(
      `${directory}/failure-${data.size}-${width}.json`,
      JSON.stringify(
        {
          size: data.size,
          width,
          url: page.url(),
          counters,
          errors,
          body: await page.locator("body").innerText(),
          error: String(error),
        },
        null,
        2,
      ),
    );
    await page.screenshot({
      path: `${directory}/failure-${data.size}-${width}.png`,
      fullPage: true,
    });
    throw error;
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ??
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  headless: true,
});
const results = [];
try {
  for (const size of [1000, 5000]) {
    const data = fixture(size);
    await fs.writeFile(
      `${directory}/fixture-${size}.json`,
      JSON.stringify({
        synthetic: true,
        index: data.index,
        search: data.search,
        conditions: data.shards.flat(),
      }),
    );
    for (const width of [1440, 390])
      results.push(await run(browser, data, width));
  }
} finally {
  await fs.writeFile(
    `${directory}/results.json`,
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        base,
        environment:
          "Local Vite dev, Chrome headless; 390px CPU slowdown 4x; concurrent work may affect absolute timings",
        fixture:
          "Existing complete exercises cloned only for synthetic load; not published; unique IDs; real 20-item addressing",
        results,
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
}
