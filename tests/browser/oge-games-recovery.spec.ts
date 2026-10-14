import { test, expect } from "@playwright/test";
test("Игра сохраняет незавершённое выделение, роль и исправление после подсказки", async ({ page }) => {
  await page.goto("oge/games/foundation/");
  const game = page.locator(".oge-game");
  await game.locator(".word-buttons button").first().click();
  await game.getByRole("button", { name: "Сказуемое", exact: true }).click();
  await game.locator(".word-buttons button").nth(1).click();
  await page.reload();
  await expect(game.locator(".word-buttons button").first()).toHaveAttribute("data-role", "subject");
  await expect(game.locator(".word-buttons button").nth(1)).toHaveAttribute("data-role", "predicate");
  await expect(game.getByRole("button", { name: "Сказуемое", exact: true })).toHaveAttribute("aria-pressed", "true");
  await game.getByText("Подсказка к действию", { exact: true }).click();
  await game.locator(".word-buttons button").nth(2).click();
  await game.getByRole("button", { name: "Проверить действие", exact: true }).click();
  const first = await page.evaluate(() => JSON.parse(localStorage.getItem("polina-oge-games-v2")!)[0]);
  expect(first.firstIndependent).toBe(false); expect(first.assisted).toBe(true); expect(first.snapshot.situation.text).toBe("Ребята начали собирать модель");
  await page.getByRole("button", { name: "Новый пример этой темы", exact: true }).click();
  await expect(game.locator("h2")).not.toHaveText("Фазовое сказуемое");
});
test("Орфографический конструктор не открывает следующий шаг после неверной морфемы", async ({ page }) => {
  await page.goto("oge/games/spelling/");
  for (let n = 0; n < 5; n++) await page.getByRole("button", { name: "Следующая ситуация", exact: true }).click();
  const game = page.locator(".oge-game"), morpheme = game.getByRole("combobox", { name: "Морфема", exact: true }), rule = game.getByRole("combobox", { name: "Правило", exact: true });
  await morpheme.selectOption("приставка");
  await expect(rule).toBeDisabled();
  await game.getByRole("button", { name: "Проверить действие", exact: true }).click();
  await expect(game.locator(".feedback")).toContainText("Морфема:");
  await morpheme.selectOption("корень");
  await expect(rule).toBeEnabled();
});
test("Сжатие: выбор основной информации не выдаётся за написанное и проверенное изложение", async ({ page }) => {
  await page.goto("oge/games/compression/");
  const game = page.locator(".oge-game");
  await game.locator(".oge-compression button").nth(0).click();
  await game.locator(".oge-compression button").nth(1).click();
  await game.getByRole("button", { name: "Проверить действие", exact: true }).click();
  await expect(game.locator(".feedback")).toContainText("Основная информация выбрана");
  await expect(game.locator(".feedback")).toContainText("Текст ещё не написан");
  await expect(game.locator(".feedback")).not.toContainText("Действие выполнено верно");
  await game.getByLabel("Ваше сжатие", { exact: true }).fill("Точность сообщения и поддержка друга требуют внимательного отношения.");
  await game.getByRole("button", { name: "Проверить действие", exact: true }).click();
  await expect(game.locator(".feedback")).toContainText("Черновик написан");
  await expect(game.locator(".feedback")).toContainText("автоматически не оценены");
  await page.reload();
  await expect(game.getByRole("textbox", { name: "Ваше сжатие", exact: true })).toHaveValue("Точность сообщения и поддержка друга требуют внимательного отношения.");
});

test("Отказ записи истории тренажёра восстанавливается повтором без дублирования попытки", async ({ page }) => {
  await page.goto("oge/games/foundation/");
  const game = page.locator(".oge-game");
  await page.evaluate(() => {
    const task = window as Window & { __failGameHistory?: boolean };
    task.__failGameHistory = true;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (task.__failGameHistory && key === "polina-oge-games-v2") throw new DOMException("Simulated failure", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
  await game.getByRole("button", { name: "Проверить действие", exact: true }).click();
  await expect(game).toContainText("браузер не сохранил историю тренажёра");
  await expect(game.getByRole("button", { name: "Проверить действие", exact: true })).toBeDisabled();
  await page.evaluate(() => { (window as Window & { __failGameHistory?: boolean }).__failGameHistory = false; });
  await game.getByRole("button", { name: "Повторить запись действия", exact: true }).click();
  const records = await page.evaluate(() => JSON.parse(localStorage.getItem("polina-oge-games-v2")!));
  expect(records).toHaveLength(1);
  expect(records[0].firstIndependent).toBe(true);
  expect(records[0].assisted).toBe(false);
  await expect(game.getByRole("button", { name: "Повторить запись действия", exact: true })).toHaveCount(0);
  await game.getByRole("button", { name: "Проверить действие", exact: true }).click();
  const revised = await page.evaluate(() => JSON.parse(localStorage.getItem("polina-oge-games-v2")!));
  expect(revised).toHaveLength(2);
  expect(revised[1].firstIndependent).toBe(false);
  expect(revised[1].assisted).toBe(true);
});
