import { expect, test } from "@playwright/test";

test("большой банк предлагает явную порцию и открывает сохранённую работу после обновления", async ({
  page,
}) => {
  await page.goto("oge/bank/?line=0");
  const portion = page.getByRole("button", { name: /Порция 100 из \d+/ });
  await expect(portion).toBeVisible();
  await expect(page.getByText(/Одна работа — до 100/)).toBeVisible();
  await portion.click();
  await expect(page.locator("#work-question")).toBeVisible();
  const id = new URL(page.url()).searchParams.get("id");
  const count = await page.evaluate(
    (id) =>
      JSON.parse(localStorage.getItem("polina-oge-work-v1:" + id)!).items
        .length,
    id,
  );
  expect(count).toBe(100);
  await page.reload();
  await expect(page.locator("#work-question")).toBeVisible();
  expect(new URL(page.url()).searchParams.get("id")).toBe(id);
});

test("поиск правил показывает все фрагменты по страницам и восстанавливает страницу после возврата", async ({
  page,
}) => {
  await page.goto("oge/theory/");
  await page
    .getByRole("textbox", { name: "Найти правило", exact: true })
    .fill("пример");
  await page
    .getByRole("textbox", { name: "Найти правило", exact: true })
    .blur();
  const results = page.locator("section").filter({
    has: page.getByRole("heading", {
      name: "Найденные параграфы",
      exact: true,
    }),
  });
  const status = await results.getByRole("status").innerText();
  const total = Number(status.match(/Найдено фрагментов: (\d+)/)![1]);
  expect(total).toBeGreaterThan(40);
  const hrefs = new Set<string>();
  const navigation = page.getByRole("navigation", {
    name: "Страницы результатов поиска",
  });
  let current = 1;
  while (true) {
    const links = await results
      .locator("h3 a")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLAnchorElement).href),
      );
    expect(links.length).toBeLessThanOrEqual(20);
    for (const link of links) {
      const target = new URL(link);
      const identity = target.pathname + target.hash;
      expect(hrefs.has(identity)).toBe(false);
      hrefs.add(identity);
    }
    const next = navigation.getByRole("button", {
      name: "Следующая",
      exact: true,
    });
    if (await next.isDisabled()) break;
    await next.click();
    current++;
    await expect(navigation).toContainText("Страница " + current + " из");
  }
  expect(hrefs.size).toBe(total);
  await results.locator("h3 a").first().click();
  await expect(page.locator(".lesson-body")).toBeVisible();
  await page
    .getByRole("link", { name: "Вернуться к каталогу", exact: true })
    .click();
  await expect(navigation).toContainText("Страница " + current + " из");
  await expect(
    page.getByRole("textbox", { name: "Найти правило", exact: true }),
  ).toHaveValue("пример");
});

test("маршрут и выбранный номер меняют заголовок вкладки", async ({ page }) => {
  await page.goto("oge/theory/");
  await expect(page).toHaveTitle("Теория ОГЭ по номеру и теме | Сайт Полины");
  await page.goto("oge/bank/");
  await expect(page).toHaveTitle("Банк заданий ОГЭ | Сайт Полины");
  await page.getByRole("combobox", { name: "Номер задания", exact: true }).selectOption("4");
  await expect(page).toHaveTitle(/ОГЭ № 4/);
  await page.goto("theory/osnova/?exam=OGE");
  await expect(page).toHaveTitle(
    "Грамматическая основа — теория русского языка | Сайт Полины",
  );
});


test("иллюстрация загружается локально в подходящем размере и не вытесняет начало практики", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", request => { if (request.url().includes("/images/oge/")) requests.push(request.url()); });
  await page.goto("oge/", { waitUntil: "networkidle" });
  const image = page.locator(".page-heading .oge-illustration");
  await expect(image).toHaveCount(1);
  await expect(image).toHaveAttribute("alt", "");
  await expect(image).toHaveAttribute("srcset", /01-book-branch-320\.webp 320w/);
  expect(await image.evaluate(node => (node as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
  expect(requests.length).toBeLessThanOrEqual(2);
  expect(requests.every(url => url.includes("01-book-branch"))).toBe(true);
  if (page.viewportSize()!.width < 700) {
    const action = page.getByRole("button", { name: "Решать задание № 2", exact: true });
    const box = await action.boundingBox();
    expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});
