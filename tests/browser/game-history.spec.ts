import { expect, test } from "@playwright/test";
import fs from "node:fs";
import type { InteractiveActivity } from "../../apps/showcase/src/oge/model";
import type { GameRecord } from "../../apps/showcase/src/oge/game-storage";
const activities = JSON.parse(
  fs.readFileSync("apps/showcase/src/oge/activities.json", "utf8"),
) as InteractiveActivity[];
function savedRecord(activity: InteractiveActivity, index = 0): GameRecord {
  const situation = structuredClone(activity.situations[index]);
  return {
    schemaVersion: 2,
    id: crypto.randomUUID(),
    activityId: activity.id,
    situationId: situation.id,
    revision: situation.revision ?? 1,
    createdAt: new Date().toISOString(),
    snapshot: {
      kind: activity.kind,
      title: activity.title,
      topicId: activity.topicId,
      skillId: activity.skillId,
      situation,
    },
    answers: Object.fromEntries(
      situation.fields
        .filter((field) => field.expected.length)
        .map((field) => [field.id, field.expected[0]]),
    ),
    firstIndependent: true,
    assisted: false,
  };
}

test("ОГЭ: другая редакция тренажёра сохраняет собственное условие и ключ", async ({
  page,
}) => {
  const foundation = activities.find(
    (activity) => activity.kind === "foundation",
  )!;
  const original = savedRecord(foundation),
    different = savedRecord(foundation);
  // A synthetic snapshot with another revision also models publication rollback.
  // It is a complete grammatical case, and is never added to the published corpus.
  different.revision = (foundation.situations[0].revision ?? 1) + 1;
  different.snapshot.situation = {
    ...different.snapshot.situation,
    revision: different.revision,
    title: "Сохранённое простое сказуемое",
    text: "Ребята собрали модель",
    tokens: ["Ребята", "собрали", "модель"],
    fields: [
      { id: "subject", label: "Подлежащее", expected: ["1"] },
      {
        id: "predicate",
        label: "Сказуемое",
        expected: ["2"],
        explanation: "В сохранённом условии сказуемое состоит из одного слова.",
      },
    ],
    explanation:
      "Собрали — простое глагольное сказуемое в сохранённом условии.",
    details: ["Сохранённый ключ относится к предложению этой редакции."],
  };
  different.answers = { subject: "1", predicate: "2" };
  const removed = structuredClone(different);
  removed.id = crypto.randomUUID();
  removed.situationId = "removed-case-fixture";
  removed.snapshot.situation.id = removed.situationId;
  removed.snapshot.situation.title = "Снятый с публикации случай";
  removed.assisted = true;
  removed.firstIndependent = false;
  const compression = savedRecord(
    activities.find((activity) => activity.kind === "compression")!,
  );
  compression.answers.draft =
    "Ребята сохранили главную мысль и убрали повторяющиеся подробности.";
  const records = [original, different, removed, compression];
  const legacy = [
    {
      id: "legacy-unverifiable",
      activityId: foundation.id,
      situationId: foundation.situations[0].id,
      createdAt: new Date().toISOString(),
      correct: true,
      answers: { predicate: "99" },
    },
  ];
  await page.addInitScript(
    ({ records, legacy }) => {
      if (!localStorage.getItem("polina-oge-games-v2"))
        localStorage.setItem("polina-oge-games-v2", JSON.stringify(records));
      if (!localStorage.getItem("polina-oge-games-v1"))
        localStorage.setItem("polina-oge-games-v1", JSON.stringify(legacy));
    },
    { records, legacy },
  );
  const requested: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/src/oge/activities.json"))
      requested.push(request.url());
  });
  await page.goto("oge/results/");
  const history = page.locator(".game-history");
  await expect(history).toContainText(
    "Проверенных действий: 2 в текущих редакциях",
  );
  await expect(history).toContainText("Автоматически проверяемых действий: 1");
  await expect(history).toContainText(
    "Верных с первой самостоятельной попытки: 1",
  );
  await expect(history).toContainText(
    "письменных черновиков для ручной оценки 1",
  );
  await expect(history).toContainText(
    "Действий по другим или отсутствующим редакциям: 2",
  );
  await expect(history.locator(".game-history-record")).toHaveCount(4);
  expect(requested).toEqual([]);
  const saved = history
    .locator(".game-history-record")
    .filter({ hasText: "Сохранённое простое сказуемое" });
  await saved.locator("summary").click();
  await expect(saved).toContainText("другая сохранённая редакция");
  await expect(saved).toContainText("Ребята собрали модель");
  await expect(saved).toContainText("Результат по сохранённому ключу: верно");
  await expect(saved).toContainText("Собрали — простое глагольное сказуемое");
  await expect(saved).not.toContainText("Ребята начали собирать модель");
  const predicate = saved
    .getByRole("listitem")
    .filter({ hasText: "Сказуемое" })
    .first();
  await expect(predicate).toContainText("Ваш ответ: собрали");
  await expect(predicate).toContainText("Сохранённый ключ: собрали");
  const before = JSON.stringify(records);
  expect(
    await page.evaluate(() => localStorage.getItem("polina-oge-games-v2")),
  ).toBe(before);
  await history
    .getByRole("combobox", { name: "История действий", exact: true })
    .selectOption("older");
  await expect(history.locator(".game-history-record")).toHaveCount(2);
  await history
    .getByRole("combobox", { name: "История действий", exact: true })
    .selectOption("current");
  await expect(history.locator(".game-history-record")).toHaveCount(2);
  await expect(history).toContainText(
    "Исторические записи без сохранённого условия: 1",
  );
  await page.reload();
  await expect(page.locator(".game-history")).toContainText(
    "Проверенных действий: 2 в текущих редакциях",
  );
  expect(
    await page.evaluate(() => localStorage.getItem("polina-oge-games-v2")),
  ).toBe(before);
});

test("ОГЭ: история тренажёра показывает по двадцать сохранённых действий", async ({
  page,
}) => {
  const foundation = activities.find(
    (activity) => activity.kind === "foundation",
  )!;
  const records = Array.from({ length: 21 }, (_, index) => ({
    ...savedRecord(foundation),
    firstIndependent: index === 0,
    assisted: index > 0,
  }));
  await page.addInitScript(
    (records) =>
      localStorage.setItem("polina-oge-games-v2", JSON.stringify(records)),
    records,
  );
  await page.addInitScript(() =>
    localStorage.setItem(
      "polina-oge-games-v1",
      JSON.stringify(
        Array.from({ length: 21 }, (_, index) => ({
          id: "legacy-" + index,
          activityId: "foundation",
          situationId: "phase",
          createdAt: new Date().toISOString(),
          correct: true,
        })),
      ),
    ),
  );
  await page.goto("oge/results/");
  const history = page.locator(".game-history");
  await expect(history).toContainText(
    "Проверенных действий: 21 в текущих редакциях",
  );
  await expect(history).toContainText(
    "Верных с первой самостоятельной попытки: 1",
  );
  await expect(history.locator(".game-history-record")).toHaveCount(20);
  await history
    .getByRole("button", { name: "Следующие действия", exact: true })
    .click();
  await expect(history.locator(".game-history-record")).toHaveCount(1);
  await expect(
    history.getByRole("navigation", {
      name: "Страницы истории действий",
      exact: true,
    }),
  ).toContainText("Страница 2 из 2");
  await history
    .getByRole("button", { name: "Предыдущие действия", exact: true })
    .click();
  await expect(history.locator(".game-history-record")).toHaveCount(20);
  const legacy = history.locator(".game-history-legacy");
  await legacy.locator("summary").click();
  await expect(legacy.getByRole("listitem")).toHaveCount(20);
  await legacy
    .getByRole("button", { name: "Следующие записи без снимка", exact: true })
    .click();
  await expect(legacy.getByRole("listitem")).toHaveCount(1);
  await expect(history).toContainText(
    "Проверенных действий: 21 в текущих редакциях",
  );
});
