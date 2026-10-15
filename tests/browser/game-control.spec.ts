import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { InteractiveActivity } from "../../apps/showcase/src/oge/model";
const activities = JSON.parse(
  readFileSync("apps/showcase/src/oge/activities.json", "utf8"),
) as InteractiveActivity[];
test("после ошибки новый контрольный случай сохраняется отдельно, без открытой подсказки", async ({
  page,
}) => {
  const activity = activities.find((a) => a.id === "foundation")!;
  await page.goto("oge/games/foundation/");
  const game = page.locator(".oge-game");
  await game
    .getByRole("button", { name: "Проверить действие", exact: true })
    .click();
  await expect(game.locator(".feedback.incorrect")).toBeVisible();
  await game
    .getByRole("button", {
      name: "Самостоятельный контроль на новом случае",
      exact: true,
    })
    .click();
  await expect(page.locator(".control-stage")).toContainText(
    "контрольная операция",
  );
  await expect(
    game.getByText("Подсказка к действию", { exact: true }),
  ).toHaveCount(0);
  await expect(game.locator(".feedback")).toHaveCount(0);
  const position = await page.evaluate(() =>
    localStorage.getItem("polina-oge-game-position-v2:foundation"),
  );
  const situation = activity.situations.find(
    (s) => position === s.id + ":" + (s.revision ?? 1),
  )!;
  expect(situation.id).not.toBe(activity.situations[0].id);
  await page.reload();
  await expect(page.locator(".control-stage")).toContainText(
    "контрольная операция",
  );
  for (const role of ["subject", "predicate"]) {
    await game
      .getByRole("button", {
        name: role === "subject" ? "Подлежащее" : "Сказуемое",
        exact: true,
      })
      .click();
    for (const n of situation.fields
      .find((f) => f.id === role)!
      .expected[0].split(",")
      .filter(Boolean))
      await game
        .locator(".word-buttons button")
        .nth(Number(n) - 1)
        .click();
  }
  await game
    .getByRole("button", { name: "Проверить действие", exact: true })
    .click();
  await expect(game.locator(".feedback.correct")).toBeVisible();
  const records = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("polina-oge-games-v2")!),
  );
  expect(records).toHaveLength(2);
  expect(records[0].snapshot.situation.text).toBe(activity.situations[0].text);
  expect(records[1]).toMatchObject({
    mode: "control",
    firstIndependent: true,
    assisted: false,
    controlFrom: {
      situationId: activity.situations[0].id,
      revision: activity.situations[0].revision ?? 1,
    },
    situationId: situation.id,
  });
});
test("орфографический контроль не сообщает правильность блокировкой полей до отправки", async ({
  page,
}) => {
  await page.goto("oge/games/spelling/");
  const game = page.locator(".oge-game");
  await game
    .getByRole("button", { name: "Проверить действие", exact: true })
    .click();
  await game
    .getByRole("button", {
      name: "Самостоятельный контроль на новом случае",
      exact: true,
    })
    .click();
  await expect(
    game.getByRole("combobox", { name: "Правило", exact: true }),
  ).toBeEnabled();
  await expect(
    game.getByRole("textbox", { name: "Восстановленное слово", exact: true }),
  ).toBeEnabled();
  await game
    .getByRole("textbox", { name: "Восстановленное слово", exact: true })
    .fill("проверочная попытка");
  await page.reload();
  await expect(
    game.getByRole("textbox", { name: "Восстановленное слово", exact: true }),
  ).toHaveValue("проверочная попытка");
  await expect(
    game.getByText("Подсказка к действию", { exact: true }),
  ).toHaveCount(0);
  await expect(game.locator(".feedback")).toHaveCount(0);
});
test("контроль сжатия требует собственный текст и сохраняет человеческую проверку содержания", async ({
  page,
}) => {
  const activity = activities.find((a) => a.id === "compression")!;
  await page.goto("oge/games/compression/");
  const game = page.locator(".oge-game");
  await game
    .getByRole("button", { name: "Проверить действие", exact: true })
    .click();
  await game
    .getByRole("button", {
      name: "Самостоятельный контроль на новом случае",
      exact: true,
    })
    .click();
  const key = await page.evaluate(() =>
    localStorage.getItem("polina-oge-game-position-v2:compression"),
  );
  const situation = activity.situations.find(
    (s) => key === s.id + ":" + (s.revision ?? 1),
  )!;
  for (const n of situation.fields
    .find((f) => f.id === "essential")!
    .expected[0].split(","))
    await game
      .locator(".oge-compression button")
      .nth(Number(n) - 1)
      .click();
  await game
    .getByRole("textbox", { name: "Ваше сжатие", exact: true })
    .fill(
      "Сохраняем основные мысли и связи исходного текста. Содержание проверяет эксперт.",
    );
  await game
    .getByRole("button", { name: "Проверить действие", exact: true })
    .click();
  await expect(game.locator(".feedback")).toContainText(
    "автоматически не оценены",
  );
  await expect(game.locator(".feedback")).not.toContainText(
    "Действие выполнено верно",
  );
  const record = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("polina-oge-games-v2")!).at(-1),
  );
  expect(record.mode).toBe("control");
  expect(record.answers.draft).toContain("Содержание проверяет эксперт.");
});
test("при исчерпании непоказанных случаев контроль не выдаёт повтор за новый перенос", async ({
  page,
}) => {
  const activity = activities.find((a) => a.id === "foundation")!;
  await page.goto("oge/games/foundation/");
  await page.evaluate((activity) => {
    for (const situation of activity.situations.slice(1))
      localStorage.setItem(
        "polina-oge-game-drafts-v2:" +
          activity.id +
          ":" +
          situation.id +
          ":" +
          (situation.revision ?? 1),
        JSON.stringify({
          schemaVersion: 2,
          activityId: activity.id,
          situationId: situation.id,
          revision: situation.revision ?? 1,
          answers: {},
          checked: false,
          checks: 0,
          hintUsed: false,
          role: "subject",
          updatedAt: new Date().toISOString(),
        }),
      );
  }, activity);
  const game = page.locator(".oge-game");
  await game
    .getByRole("button", { name: "Проверить действие", exact: true })
    .click();
  await game
    .getByRole("button", {
      name: "Самостоятельный контроль на новом случае",
      exact: true,
    })
    .click();
  await expect(game).toContainText("Новых случаев этой механики больше нет");
  await expect(page.locator(".control-stage")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("polina-oge-games-v2")!).length,
    ),
  ).toBe(1);
});
