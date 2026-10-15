import { test, expect } from "@playwright/test";
test("ошибочные Б и В ведут к обращению и пропуску сказуемого", async ({ page }) => {
  await page.goto("practice/oge-punktuacionnye-pravila-002/?exam=OGE");
  const selects=page.locator(".question-card form select");
  await selects.nth(0).selectOption("1");
  await selects.nth(1).selectOption("2");
  await selects.nth(2).selectOption("3");
  await page.getByRole("button",{name:"Проверить ответ",exact:true}).click();
  const feedback=page.locator(".answer-feedback .feedback");
  await expect(feedback.locator(".oge-answer-difference li")).toHaveCount(2);
  await expect(feedback.getByRole("link",{name:"Повторить: Знаки при обращении",exact:true})).toHaveAttribute("href",/introductory-address$/u);
  await expect(feedback.getByRole("link",{name:"Повторить: Тире на месте пропущенного члена",exact:true})).toHaveAttribute("href",/ellipsis-dash$/u);
  await expect(feedback.getByRole("link",{name:"Новая задача на этот навык",exact:true})).toHaveAttribute("href",/skill=OGE%3A4.address$/u);
  await feedback.getByRole("link",{name:"Повторить: Тире на месте пропущенного члена",exact:true}).click();
  await expect(page.locator("#ellipsis-dash")).toBeVisible();
  await page.locator("#ellipsis-dash").getByRole("button",{name:"Весь разбор",exact:true}).click();
  await expect(page.locator("#ellipsis-dash")).toContainText("Во второй восстанавливается стояли");
  await page.goBack();
  await expect(page).toHaveURL(/practice\/oge-punktuacionnye-pravila-002/u);
});
test("частицы названы явно и входят в границы простого сказуемого", async ({ page }) => {
  await page.goto("theory/osnova/?exam=OGE#predicate-boundaries");
  await expect(page.locator("#predicate-boundaries")).toContainText("учитывайте частицы «пусть», «бы», «не»");
  await expect(page.locator("#predicate-boundaries")).toContainText("не превращает простое глагольное сказуемое в составное");
});
