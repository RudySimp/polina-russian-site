import { test, expect } from "@playwright/test";

test("P0-01: восстановленные пропуски №7 отображаются и проверяются", async ({
  page,
}) => {
  for (const [id, position, key] of [
    ["013", "8", "37"],
    ["016", "2", "257"],
  ]) {
    await page.goto(`practice/oge-glasnye-v-tekste-${id}/`);
    await expect(page.locator(".source-text")).toContainText(
      `гн…(${position})тся`,
    );
    await expect(page.locator(".source-text")).not.toContainText(
      /гн…тся\(\d\)т/u,
    );
    await page.getByLabel("Ваш ответ", { exact: true }).fill(key);
    await page
      .getByRole("button", { name: "Проверить ответ", exact: true })
      .click();
    await expect(page.locator(".answer-feedback.correct")).toBeVisible();
  }
});

test("P0-02: обнаружение через неделю не доказывает время появления", async ({
  page,
}) => {
  await page.goto("theory/analiz-teksta/?exam=OGE");
  const exercise = page
    .locator(".interactive-card")
    .filter({ hasText: "Точность чтения" });
  await exercise.getByRole("button", { name: "Случай 2", exact: true }).click();
  await exercise.getByLabel("Не подтверждено", { exact: true }).check();
  await exercise
    .getByRole("button", { name: "Проверить", exact: true })
    .click();
  await expect(exercise.locator(".feedback.correct")).toBeVisible();
  await expect(exercise.locator(".feedback")).toContainText(/обнаруж|наблюд/u);
});

test("P0-03: нормативная форма полегче принимается без лишнего ограничения", async ({
  page,
}) => {
  await page.goto("practice/oge-formy-slov-020/");
  await page.getByLabel("Ваш ответ", { exact: true }).fill("полегче");
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect(page.locator(".answer-feedback.correct")).toBeVisible();
});
