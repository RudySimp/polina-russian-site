import { expect, test } from "@playwright/test";

test("ОГЭ: поиск внутри правила ведёт к параграфу и возвращает сохранённый запрос без служебных полей", async ({
  page,
}) => {
  await page.goto("oge/theory/");
  const query = page.getByRole("textbox", {
    name: "Найти правило",
    exact: true,
  });
  const contentQuery = "инфинитив называет действие того же субъекта";
  const title = "Границы сказуемого и нулевая связка";
  const paragraph = page.locator(".question-card").filter({
    has: page.getByRole("link", { name: title, exact: true }),
  });

  await query.fill(contentQuery);
  await query.blur();
  const searched = page.url();
  await expect(paragraph).toHaveCount(1);
  await expect(paragraph.locator("p").last()).toContainText(contentQuery);
  await paragraph.getByRole("link", { name: title, exact: true }).click();
  await expect(page.locator("#predicate-boundaries")).toContainText(
    contentQuery,
  );
  expect(new URL(page.url()).pathname).toMatch(/\/theory\/osnova\/$/u);
  expect(new URL(page.url()).hash).toBe("#predicate-boundaries");

  await page
    .getByRole("link", { name: "Вернуться к каталогу", exact: true })
    .click();
  await expect(page).toHaveURL(searched);
  await expect(query).toHaveValue(contentQuery);
  await expect(paragraph).toHaveCount(1);

  await page.goBack();
  await expect(page.locator("#predicate-boundaries")).toContainText(
    contentQuery,
  );
  await page.goBack();
  await expect(page).toHaveURL(searched);
  await expect(query).toHaveValue(contentQuery);

  // A phrase at the beginning of a rule exposes leaked type/kind values in
  // the old index, rather than relying on a fragment that starts after them.
  await query.fill("Одна глагольная форма");
  await query.blur();
  const snippet = paragraph.locator("p").last();
  await expect(snippet).toContainText("Одна глагольная форма");
  await expect(snippet).not.toHaveText(
    /\b(?:rule|paragraph|warning|example|table|steps|interactive|checkpoint|comparison|foundation|spelling)\b/u,
  );
});
