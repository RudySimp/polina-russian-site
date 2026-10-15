import type { Lesson } from "../../apps/showcase/src/content/model";
import { test, expect } from "@playwright/test";
import { lessons } from "../../apps/showcase/src/content/library";
import { exercises } from "../../apps/showcase/src/content/registry";
import original from "../../content/oge-theory-modules.json" with { type: "json" };
const foundation = lessons.find((l) => l.topicId === "osnova")!;
const readingKey =
  "polina-lesson-state-v2:" +
  foundation.id +
  "@" +
  foundation.revision +
  ":reading";
test("короткий модуль находится по номеру и теме, исходная глава остаётся доступна", async ({
  page,
}) => {
  await page.goto("oge/theory/");
  await page
    .getByRole("combobox", { name: "Номер ОГЭ", exact: true })
    .selectOption("6");
  const link = page.getByRole("link", {
    name: "О, Ё, Е после шипящих; И и Ы после Ц",
    exact: true,
  });
  await expect(link).toBeVisible();
  await link.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "О, Ё, Е после шипящих; И и Ы после Ц",
  );
  await expect(
    page.getByRole("region", { name: "Необходимые знания" }),
  ).toContainText("Карта орфограммы");
  const studyFont = await page
    .locator(".course-module-body .lesson-section p")
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(studyFont).toBeGreaterThanOrEqual(18);
  expect(studyFont).toBeLessThanOrEqual(20);
  await expect(
    page.locator(".course-module-body .lesson-section").first(),
  ).toBeInViewport();
  await page.getByRole("link", { name: "Полная глава", exact: true }).click();
  await expect(page).toHaveURL(
    /theory\/orfograficheskiy-analiz\/\?exam=OGE(?:&|$)/,
  );
  await expect(page.locator("#spelling-map")).toHaveCount(1);
  await page.goto("oge/theory/?topic=osnova");
  await expect(
    page.getByRole("link", { name: "Подлежащее и главный член", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", {
      name: "Норма существительного и числительного",
      exact: true,
    }),
  ).toHaveCount(0);
});
test("модуль сохраняет самопроверку и общие отметки главы, не удаляя чужие параграфы", async ({
  page,
}) => {
  await page.addInitScript(
    ({ key }) =>
      !localStorage.getItem(key) &&
      localStorage.setItem(
        key,
        JSON.stringify({ read: ["predicates"], last: "predicates" }),
      ),
    { key: readingKey },
  );
  await page.goto("oge/theory/modules/osnova-subject/");
  await expect(page.locator(".lesson-reading-progress")).toContainText(
    "0 из 4",
  );
  await page
    .locator("#concept")
    .getByRole("button", { name: "Отметить параграф прочитанным", exact: true })
    .click();
  const checkpoint = page.locator(".course-checkpoint .checkpoint");
  await checkpoint.getByRole("radio").nth(1).check();
  await checkpoint
    .getByRole("button", { name: "Проверить себя", exact: true })
    .click();
  await expect(checkpoint.locator(".feedback.correct")).toBeVisible();
  await page.reload();
  await expect(checkpoint.locator(".feedback.correct")).toBeVisible();
  await expect(page.locator(".lesson-reading-progress")).toContainText(
    "1 из 4",
  );
  expect(
    await page.evaluate(
      (key) => JSON.parse(localStorage.getItem(key)!).read,
      readingKey,
    ),
  ).toEqual(["predicates", "concept"]);
  await page.getByRole("link", { name: "Полная глава", exact: true }).click();
  await expect(page.locator(".lesson-reading-progress")).toContainText(
    "2 из " + foundation.sections.length,
  );
  await expect(
    page
      .locator("#predicates")
      .getByRole("button", { name: "Прочитано · снять отметку", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});
test("после реального решения модуль предлагает следующий ещё не встречавшийся пример", async ({
  page,
}) => {
  await page.goto("oge/theory/modules/osnova-subject/");
  const first = await page
    .locator("#practice")
    .getByRole("link", { name: "Решить новый пример", exact: true })
    .getAttribute("href");
  const exercise = exercises.find((e) => first?.includes("/" + e.slug + "/"))!;
  expect(exercise).toBeTruthy();
  await page.goto(first!);
  if (["multiple", "words", "punctuation"].includes(exercise.input)) {
    for (const digit of exercise.answers[0])
      await page
        .locator("form input[type=checkbox]")
        .nth(Number(digit) - 1)
        .check();
  } else if (exercise.input === "single")
    await page
      .locator("form input[type=radio]")
      .nth(Number(exercise.answers[0]) - 1)
      .check();
  else
    await page
      .getByLabel("Ваш ответ", { exact: true })
      .fill(exercise.answers[0]);
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect(
    page.getByText("Ответ сохранён.", { exact: false }),
  ).toBeVisible();
  await page.goto("oge/theory/modules/osnova-subject/");
  const second = page
    .locator("#practice")
    .getByRole("link", { name: "Решить новый пример", exact: true });
  await expect(second).not.toHaveAttribute("href", first!);
  const next = await second.getAttribute("href");
  await page.reload();
  await expect(second).toHaveAttribute("href", next!);
});
test("текст новых модулей ищется без загрузки всех уроков, загружается только выбранный модуль", async ({
  page,
}) => {
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));
  await page.goto("oge/theory/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(
    requested.filter((url) =>
      /\/ortho-[a-z-]+(?:-[A-Za-z0-9_-]+)?\.(?:js|json)(?:$|\?)/.test(url),
    ),
  ).toEqual([]);
  await page.getByLabel("Найти правило", { exact: true }).fill("камышовый");
  const direct = page.locator(
    'section.home-section a[href*="ortho-shushing-ts"][href*="#"]',
  );
  await expect(direct.first()).toBeVisible();
  await direct.first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "О, Ё, Е после шипящих; И и Ы после Ц",
  );
  const selected = original.modules.find(
    (m) => m.id === "ortho-shushing-ts",
  ) as unknown as { lesson: Lesson };
  const block = selected.lesson.sections
    .flatMap((s) => s.blocks)
    .find((b) => b.type === "checkpoint")!;
  const checkpoint = page.locator("#checkpoint .checkpoint");
  await checkpoint
    .getByRole("radio")
    .nth((block.type === "checkpoint" ? block.answer : 1) - 1)
    .check();
  await checkpoint
    .getByRole("button", { name: "Проверить себя", exact: true })
    .click();
  await expect(checkpoint.locator(".feedback.correct")).toBeVisible();
  await page
    .getByText("Источники и редакционный статус", { exact: true })
    .click();
  await expect(page.locator(".provenance-details")).toContainText(
    "физическая страница PDF 38",
  );
  const originalRequests = requested.filter((url) =>
    /\/ortho-[a-z-]+(?:-[A-Za-z0-9_-]+)?\.(?:js|json)(?:$|\?)/.test(url),
  );
  expect(originalRequests.length).toBeGreaterThan(0);
  expect(
    originalRequests.every((url) => url.includes("ortho-shushing-ts")),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
});
test("поиск параграфов сохраняет страницы, запрос и возврат назад", async ({
  page,
}) => {
  await page.goto("oge/theory/?q=" + encodeURIComponent("предложение"));
  const results = page.locator("section.home-section").filter({
    has: page.getByRole("heading", {
      name: "Найденные параграфы",
      exact: true,
    }),
  });
  const first = await results.locator("article h3").first().innerText();
  const next = results.getByRole("button", { name: "Следующая", exact: true });
  await expect(next).toBeEnabled();
  await next.click();
  await expect(page).toHaveURL(/page=2/);
  await expect(results.locator("article h3").first()).not.toHaveText(first);
  await page.goBack();
  await expect(page.getByLabel("Найти правило", { exact: true })).toHaveValue(
    "предложение",
  );
  await expect(results.locator("article h3").first()).toHaveText(first);
});

test("новые модули сохраняют учебный размер в таблицах, заданиях и примерах", async ({
  page,
}) => {
  for (const id of [
    "ortho-derived-prepositions",
    "ortho-half-compounds",
    "ortho-transitivity-e-i",
    "ortho-root-im-in",
  ]) {
    await page.goto("oge/theory/modules/" + id + "/");
    const text = page.locator(
      ".course-module-body #rule p, .course-module-body td, .course-module-body .example-text, .course-module-body .interactive-card > p, .course-module-body .choice-list label",
    );
    await expect(text.first()).toBeVisible();
    const sizes = await text.evaluateAll((nodes) =>
      nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)),
    );
    expect(sizes.length).toBeGreaterThan(8);
    for (const size of sizes) {
      expect(size).toBeGreaterThanOrEqual(18);
      expect(size).toBeLessThanOrEqual(20);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(await page.evaluate(() => innerWidth));
  }
});
