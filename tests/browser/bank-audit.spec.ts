import { expect, test } from "@playwright/test";
import fs from "node:fs";
const writing = (
  JSON.parse(
    fs.readFileSync("apps/showcase/src/oge/materials.json", "utf8"),
  ) as { writing: { line: number }[] }
).writing;
const summaryCount = writing.filter((item) => item.line === 1).length;
const essayCount = writing.filter((item) => item.line === 13).length;

test("ОГЭ: прямые направления и быстрый запуск на небольшом экране", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("oge/");
    const directions = page.locator(".oge-directions a");
    await expect(directions).toHaveCount(5);
    const paths = await directions.evaluateAll((links) =>
      links.map((link) => new URL((link as HTMLAnchorElement).href).pathname),
    );
    expect(paths.map((path) => path.slice(path.indexOf("/oge/")))).toEqual([
      "/oge/theory/",
      "/oge/bank/",
      "/oge/variants/",
      "/oge/generator/",
      "/oge/games/",
    ]);
    expect(
      (await directions.last().boundingBox())!.y +
        (await directions.last().boundingBox())!.height,
    ).toBeLessThanOrEqual(844);
    if (width < 700) {
      const start = await page
        .locator(".oge-quick-start .button")
        .first()
        .boundingBox();
      expect(start!.y + start!.height).toBeLessThanOrEqual(844);
    }
    await page.goto("oge/bank/2/");
    await expect(page.locator("main h1")).toContainText("№ 2");
    const launch = page.getByRole("button", { name: "5 заданий", exact: true });
    await expect(launch).toBeEnabled();
    const box = await launch.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  }
});

test("ОГЭ: возврат из задания сохраняет страницу, поиск и номер", async ({
  page,
}) => {
  await page.goto("oge/bank/2/");
  const query = page.getByRole("textbox", {
    name: "Найти задание",
    exact: true,
  });
  await query.fill("предлож");
  await query.blur();
  await page.getByRole("button", { name: "Следующая", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("Страница 2");
  const selection = page.url();
  await page.locator(".exercise-card").first().click();
  await expect(
    page.getByRole("heading", { name: "Условие", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Вернуться к подборке", exact: true })
    .click();
  await expect(page).toHaveURL(selection);
  await expect(query).toHaveValue("предлож");
  await expect(page.locator(".pagination")).toContainText("Страница 2");
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Условие", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(selection);
});

test("ОГЭ: компактный банк не загружает условия до выбора упражнения", async ({
  page,
}) => {
  const conditions: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/src/content/shards/"))
      conditions.push(request.url());
  });
  await page.goto("oge/bank/2/");
  await expect(page.locator(".exercise-card")).toHaveCount(10);
  expect(conditions).toEqual([]);
  await page.getByRole("button", { name: "Следующая", exact: true }).click();
  await expect(page.locator(".pagination")).toContainText("Страница 2");
  expect(conditions).toEqual([]);
  await page.locator(".exercise-card").first().click();
  await expect(
    page.getByRole("heading", { name: "Условие", exact: true }),
  ).toBeVisible();
  // Development loads JSON modules; production emits one addressed chunk.
  if (conditions.length) expect(conditions.length).toBe(1);
});

test("ОГЭ: общий банк включает обе письменные линии и точные счётчики", async ({
  page,
}) => {
  await page.goto("oge/bank/");
  await expect(page.locator(".results-count")).toContainText(
    "письменных: " + writing.length,
  );
  await expect(
    page.getByRole("button", {
      name: "Открыть письменное задание",
      exact: true,
    }),
  ).toHaveCount(writing.length);
  await page.locator(".oge-bank-filters summary").click();
  const topic = page.getByRole("combobox", { name: "Тема", exact: true });
  await expect(topic.locator('option[value="izlozhenie"]')).toContainText(
    "(" + summaryCount + ")",
  );
  await expect(topic.locator('option[value="sochinenie"]')).toContainText(
    "(" + essayCount + ")",
  );
  await topic.selectOption("izlozhenie");
  await expect(page.locator(".results-count")).toContainText(
    "Найдено заданий: " + summaryCount,
  );
  await expect(
    page.getByRole("button", {
      name: "Открыть письменное задание",
      exact: true,
    }),
  ).toHaveCount(summaryCount);
  await expect(
    page.getByRole("button", { name: "5 заданий", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Сбросить фильтры", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Открыть письменное задание",
      exact: true,
    }),
  ).toHaveCount(writing.length);
});

test("ОГЭ: поиск сохраняется одним шагом истории, фильтр возвращается отдельно", async ({
  page,
}) => {
  await page.goto("oge/bank/2/");
  const initial = page.url();
  const query = page.getByRole("textbox", {
    name: "Найти задание",
    exact: true,
  });
  await query.pressSequentially("предлож", { delay: 25 });
  await query.blur();
  const searched = page.url();
  await page.locator(".oge-bank-filters summary").click();
  const level = page.getByRole("combobox", { name: "Сложность", exact: true });
  const value = await level
    .locator("option")
    .evaluateAll((options) =>
      options
        .find(
          (option) =>
            (option as HTMLOptionElement).value &&
            !(option as HTMLOptionElement).disabled,
        )
        ?.getAttribute("value"),
    );
  expect(value).toBeTruthy();
  await level.selectOption(value!);
  await expect(page).not.toHaveURL(searched);
  await page.goBack();
  await expect(page).toHaveURL(searched);
  await page.locator(".oge-bank-filters summary").click();
  await expect(
    page.getByRole("combobox", { name: "Сложность", exact: true }),
  ).toHaveValue("");
  await expect(query).toHaveValue("предлож");
  await page.goBack();
  await expect(page).toHaveURL(initial);
  await expect(query).toHaveValue("");
});

for (const entry of [
  { path: "", label: "Начать: 5 заданий ОГЭ" },
  { path: "oge/", label: "Решать задание № 2" },
]) {
  test(
    "ОГЭ: пять заданий одним действием с " + (entry.path || "главной"),
    async ({ page }) => {
      await page.goto(entry.path);
      const launch = page.getByRole("button", {
        name: entry.label,
        exact: true,
      });
      await expect(launch).toBeEnabled();
      await launch.click();
      await expect(page.locator("#work-question")).toBeVisible();
      const work = await page.evaluate(() => {
        const id = new URLSearchParams(location.search).get("id");
        return JSON.parse(localStorage.getItem("polina-oge-work-v1:" + id)!);
      });
      expect(work.items).toHaveLength(5);
      expect(
        work.items.every(
          (item: {
            kind: string;
            exercise: { taskLine: number; revision: number };
          }) =>
            item.kind === "exercise" &&
            item.exercise.taskLine === 2 &&
            item.exercise.revision > 0,
        ),
      ).toBe(true);
      await page.reload();
      await expect(page.locator("#work-question")).toBeVisible();
    },
  );
}
