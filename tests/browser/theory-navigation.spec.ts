import { test, expect } from "@playwright/test";
test("каталог → модуль → глава → каталог сохраняет поиск, тему, страницу и native Back", async ({
  page,
}) => {
  const query = new URLSearchParams({
    exam: "OGE",
    topic: "orfograficheskiy-analiz",
    q: "не",
    page: "2",
  });
  const origin = "/oge/theory/?" + query;
  await page.goto("oge/theory/?" + query);
  await expect(page.getByLabel("Найти правило", { exact: true })).toHaveValue(
    "не",
  );
  await expect(
    page.getByRole("navigation", {
      name: "Страницы результатов поиска",
      exact: true,
    }),
  ).toContainText("Страница 2");
  const catalogueUrl = page.url();
  await page
    .getByRole("link", {
      name: "Приставки, суффиксы и форма слова",
      exact: true,
    })
    .click();
  expect(new URL(page.url()).searchParams.get("from")).toBe(origin);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Приставки, суффиксы и форма слова",
  );
  await page.goBack();
  await expect(page).toHaveURL(catalogueUrl);
  await expect(
    page.getByRole("navigation", {
      name: "Страницы результатов поиска",
      exact: true,
    }),
  ).toContainText("Страница 2");
  await page.goForward();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Приставки, суффиксы и форма слова",
  );
  await page.getByRole("link", { name: "Полная глава", exact: true }).click();
  const chapterUrl = new URL(page.url());
  expect(chapterUrl.searchParams.get("exam")).toBe("OGE");
  expect(chapterUrl.searchParams.get("from")).toBe(origin);
  expect(chapterUrl.hash).toBe("#prefixes");
  await page
    .getByRole("link", { name: "Вернуться к каталогу", exact: true })
    .click();
  await expect(page).toHaveURL(catalogueUrl);
  await expect(page.getByLabel("Найти правило", { exact: true })).toHaveValue(
    "не",
  );
  await expect(
    page.getByRole("navigation", {
      name: "Страницы результатов поиска",
      exact: true,
    }),
  ).toContainText("Страница 2");
});
test("ЕГЭ и прямые ссылки сохраняют собственный каталог; внешний from отклоняется", async ({
  page,
}) => {
  const origin = "/theory/?exam=EGE&q=" + encodeURIComponent("ударение");
  await page.goto(
    "theory/udarenie/?exam=EGE&from=" + encodeURIComponent(origin),
  );
  await expect(page.locator(".lesson-meta")).toContainText("ЕГЭ");
  await expect(
    page.getByRole("link", { name: "Вернуться к каталогу", exact: true }),
  ).toHaveAttribute("href", "/polina-russian-site" + origin);
  await expect(
    page.getByRole("heading", {
      name: "Изучать короткими шагами",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.goto(
    "theory/udarenie/?exam=EGE&from=" +
      encodeURIComponent("https://external.invalid/theory/"),
  );
  await expect(
    page.getByRole("link", { name: "Вернуться к каталогу", exact: true }),
  ).toHaveAttribute("href", "/polina-russian-site/theory/?exam=EGE");
  await page.goto("oge/theory/modules/osnova-subject/");
  await expect(
    page.getByRole("link", { name: "Вернуться к каталогу", exact: true }),
  ).toHaveAttribute("href", "/polina-russian-site/oge/theory/");
});
