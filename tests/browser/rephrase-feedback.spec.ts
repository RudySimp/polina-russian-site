import { test, expect } from "@playwright/test";
test("повтор исходного сочетания получает точную причину без преобразования", async ({
  page,
}) => {
  await page.goto("practice/oge-slovosochetaniya-001/?exam=OGE");
  await page
    .getByRole("textbox", { name: "Ваш ответ", exact: true })
    .fill("шкатулкаиздерева");
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  const feedback = page.locator(".answer-feedback .feedback");
  await expect(feedback).toContainText("без преобразования");
  await expect(feedback).toContainText(
    "замените связь «управление» на «согласование»",
  );
});
test("изменение главного слова объясняется буквально, исправленный порядок №19 принимается", async ({
  page,
}) => {
  await page.goto("practice/oge-slovosochetaniya-026/?exam=OGE");
  await page
    .getByRole("textbox", { name: "Ваш ответ", exact: true })
    .fill("кожаные рукавицы");
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect(page.locator(".answer-feedback .feedback")).toContainText(
    "главное слово «перчатки»",
  );
  await page.goto("practice/oge-slovosochetaniya-019/?exam=OGE");
  await page
    .getByRole("textbox", { name: "Ваш ответ", exact: true })
    .fill("из снега крепость");
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect(
    page.locator(".answer-feedback .feedback.correct"),
  ).toBeVisible();
});
