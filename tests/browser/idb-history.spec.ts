import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import type { PracticeSession } from "../../apps/showcase/src/oge/model";
import type { SessionSummary } from "../../apps/showcase/src/oge/storage";
const index = JSON.parse(
  fs.readFileSync("apps/showcase/src/content/exercise-index.json", "utf8"),
) as { id: string; taskLine?: number; exam: string }[];
async function readDurable(page: Page, requestedId?: string) {
  return (await page.evaluate(async (requestedId) => {
    const id = requestedId ?? new URLSearchParams(location.search).get("id");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("polina-oge-works-v2", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const transaction = db.transaction(
      ["snapshots", "drafts", "index"],
      "readonly",
    );
    const get = (store: string) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = transaction.objectStore(store).get(id!);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [snapshot, state, summary] = await Promise.all(
      ["snapshots", "drafts", "index"].map(get),
    );
    db.close();
    if (!snapshot || !state || !summary)
      throw Error("Complete durable session required");
    return { session: { ...snapshot, ...state }, summary };
  }, requestedId)) as { session: PracticeSession; summary: SessionSummary };
}
async function removeMirrors(page: Page) {
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage))
      if (
        [
          "polina-oge-work-v1:",
          "polina-oge-state-v2:",
          "polina-oge-index-v2:",
        ].some((prefix) => key.startsWith(prefix)) ||
        key === "polina-showcase-attempts-v1"
      )
        localStorage.removeItem(key);
  });
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) =>
        [
          "polina-oge-work-v1:",
          "polina-oge-state-v2:",
          "polina-oge-index-v2:",
        ].some((prefix) => key.startsWith(prefix)),
      ),
    ),
  ).toEqual([]);
}

test("ОГЭ: банк новых и верных заданий учитывает только IndexedDB после удаления зеркал", async ({
  page,
}) => {
  await page.goto("");
  await page
    .getByRole("button", { name: "Начать: 5 заданий ОГЭ", exact: true })
    .click();
  await expect(page.locator("#work-question")).toBeVisible();
  const first = (await readDurable(page)).session;
  const exercise = first.items[0];
  if (exercise.kind !== "exercise") throw Error("Expected a test question");
  await page
    .locator("#work-question")
    .getByLabel("Ваш ответ", { exact: true })
    .fill(exercise.exercise.answers[0]);
  await page
    .locator("#work-question")
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await readDurable(page, first.id)).summary.exerciseRefs.find(
          (ref) => ref.id === exercise.exercise.id,
        )?.status,
    )
    .toBe("correct");
  await removeMirrors(page);
  await page.goto("oge/bank/2/?status=new");
  const total = index.filter(
    (item) => item.exam === "OGE" && item.taskLine === 2,
  ).length;
  await expect(page.locator(".results-count")).toContainText(
    "Найдено заданий: " + (total - 1),
  );
  await page
    .getByRole("combobox", { name: "Решение", exact: true })
    .selectOption("correct");
  await expect(page.locator(".results-count")).toContainText(
    "Найдено заданий: 1",
  );
  await expect(page.locator(".exercise-card")).toHaveCount(1);
  await expect(page.locator(".exercise-card")).toHaveAttribute(
    "href",
    new RegExp("/practice/" + exercise.exercise.slug + "/"),
  );
  const stored = await readDurable(page, first.id);
  expect(
    stored.summary.exerciseRefs.find((ref) => ref.id === exercise.exercise.id)
      ?.answered,
  ).toBe(true);
  expect(
    await page.evaluate(
      (id) => localStorage.getItem("polina-oge-work-v1:" + id),
      first.id,
    ),
  ).toBeNull();
});

test("ОГЭ: новый полный вариант исключает письменные тексты и аудио из истории только IndexedDB", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("oge/variants/1/");
  await page
    .getByRole("button", { name: "Начать новую попытку", exact: true })
    .click();
  await expect(
    page.getByLabel("Ваш письменный ответ", { exact: true }),
  ).toBeVisible();
  const first = (await readDurable(page)).session;
  await page
    .getByLabel("Ваш письменный ответ", { exact: true })
    .fill("Черновик ранее использованного изложения.");
  await page
    .getByRole("button", { name: "Слушать текст", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Пауза", exact: true }).click();
  await page.locator(".oge-work-nav button").nth(1).click();
  const syntax = first.items[1];
  if (syntax.kind !== "exercise") throw Error("Expected syntax question");
  await page
    .locator("#work-question")
    .getByLabel("Ваш ответ", { exact: true })
    .fill(syntax.exercise.answers[0]);
  await page.locator(".oge-work-nav button").nth(12).click();
  await expect(
    page.getByLabel("Ваш письменный ответ", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Ваш письменный ответ", { exact: true })
    .fill("Черновик ранее использованного сочинения.");
  await expect
    .poll(async () => {
      const summary = (await readDurable(page, first.id)).summary;
      return {
        writing: summary.writingRefs.filter((ref) => ref.answered).length,
        audio: summary.audioRefs.filter((ref) => ref.played).length,
        syntax: summary.exerciseRefs.filter((ref) => ref.answered).length,
      };
    })
    .toEqual({ writing: 2, audio: 1, syntax: 1 });
  await removeMirrors(page);
  await page.goto("oge/generator/");
  await page
    .getByRole("combobox", { name: "Отбор", exact: true })
    .selectOption("new");
  await page
    .getByRole("button", { name: "Сформировать вариант", exact: true })
    .click();
  await expect(page.locator("#work-question")).toBeVisible();
  const next = (await readDurable(page)).session;
  expect(next.items).toHaveLength(13);
  expect(
    next.items
      .filter((item) => item.kind === "writing")
      .map((item) => item.writing.id),
  ).not.toEqual(
    expect.arrayContaining(
      first.items
        .filter((item) => item.kind === "writing")
        .map((item) => item.writing.id),
    ),
  );
  const usedWriting = new Set(
    first.items
      .filter((item) => item.kind === "writing")
      .map((item) => item.writing.id),
  );
  expect(
    next.items
      .filter((item) => item.kind === "writing")
      .every((item) => !usedWriting.has(item.writing.id)),
  ).toBe(true);
  expect(
    next.items
      .filter((item) => item.kind === "exercise")
      .every((item) => item.exercise.id !== syntax.exercise.id),
  ).toBe(true);
  const usedTexts = new Set(
    first.texts.map((text) => text.id + "@" + text.revision),
  );
  expect(
    next.texts.every((text) => !usedTexts.has(text.id + "@" + text.revision)),
  ).toBe(true);
  const usedAudio = new Set(
    first.audio.map((audio) => audio.id + "@" + audio.revision),
  );
  expect(
    next.audio.every(
      (audio) => !usedAudio.has(audio.id + "@" + audio.revision),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      (id) => localStorage.getItem("polina-oge-work-v1:" + id),
      first.id,
    ),
  ).toBeNull();
  const old = await readDurable(page, first.id);
  expect(old.summary.writingRefs.filter((ref) => ref.answered)).toHaveLength(2);
});
