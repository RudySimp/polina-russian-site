import { expect, test, type Page } from "@playwright/test";
import type { PracticeSession } from "../../apps/showcase/src/oge/model";
import { parseSession } from "../../apps/showcase/src/oge/storage";
import {
  sessionLimits,
  serializedSessionBytes,
} from "../../apps/showcase/src/oge/session-limits";

async function durableWork(page: Page) {
  return (await page.evaluate(async () => {
    const id = new URLSearchParams(location.search).get("id")!;
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
        const request = transaction.objectStore(store).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [snapshot, state, summary] = await Promise.all(
      ["snapshots", "drafts", "index"].map(get),
    );
    db.close();
    return { snapshot, session: { ...snapshot, ...state }, summary };
  })) as {
    snapshot: PracticeSession;
    session: PracticeSession;
    summary: { itemCount: number };
  };
}
function editableIndex(session: PracticeSession) {
  return session.items.findIndex(
    (item) =>
      item.kind === "exercise" &&
      !["single", "multiple", "words", "punctuation", "matching"].includes(
        item.exercise.input,
      ),
  );
}

test("P0-01: явная порция 100 читается из IDB сразу и после перезагрузки при отказе зеркала", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (
        [
          "polina-oge-work-v1:",
          "polina-oge-state-v2:",
          "polina-oge-index-v2:",
        ].some((prefix) => key.startsWith(prefix))
      )
        throw new DOMException(
          "Synthetic mirror failure",
          "QuotaExceededError",
        );
      return setItem.call(this, key, value);
    };
  });
  await page.goto("oge/bank/?line=0");
  const launch = page.locator(".oge-fast-launch");
  const portion = launch.getByRole("button", {
    name: new RegExp("^Порция " + sessionLimits.practiceBatchItems + " из "),
  });
  await expect(portion).toBeVisible();
  const total = Number((await portion.innerText()).match(/из (\d+)/)?.[1]);
  expect(total).toBeGreaterThan(sessionLimits.practiceBatchItems);
  await expect(launch).toContainText(
    "после этой порции останется " + (total - sessionLimits.practiceBatchItems),
  );
  await launch.getByText("Размер, режим и отбор", { exact: true }).click();
  await expect(
    launch
      .getByRole("combobox", { name: "Количество", exact: true })
      .locator('option[value="all"]'),
  ).toHaveJSProperty("disabled", true);
  await portion.click();
  await expect(page.locator("#work-question")).toBeVisible();
  const first = await durableWork(page);
  expect(first.snapshot.items).toHaveLength(sessionLimits.practiceBatchItems);
  expect(first.summary.itemCount).toBe(sessionLimits.practiceBatchItems);
  const raw = JSON.stringify(first.snapshot);
  expect(parseSession(raw)?.items).toHaveLength(
    sessionLimits.practiceBatchItems,
  );
  expect(raw.length).toBeLessThanOrEqual(sessionLimits.maxSerializedChars);
  expect(serializedSessionBytes(raw)).toBeLessThanOrEqual(
    sessionLimits.maxSerializedBytes,
  );
  expect(
    new Set(
      first.snapshot.items.map((item) =>
        item.kind === "exercise" ? item.exercise.id : item.writing.id,
      ),
    ).size,
  ).toBe(sessionLimits.practiceBatchItems);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith("polina-oge-")),
    ),
  ).toEqual([]);
  const index = editableIndex(first.session);
  expect(index).toBeGreaterThanOrEqual(0);
  await page
    .getByRole("navigation", { name: "Задания работы", exact: true })
    .getByRole("button")
    .nth(index)
    .click();
  const exercise = first.session.items[index];
  if (exercise.kind !== "exercise") throw Error("Expected exercise");
  const answer = exercise.exercise.answers[0];
  const field = page
    .locator("#work-question")
    .getByLabel("Ваш ответ", { exact: true });
  await field.fill(answer);
  await expect
    .poll(
      async () =>
        (await durableWork(page)).session.answers[exercise.exercise.id],
    )
    .toBe(answer);
  await expect(
    page.getByRole("status").filter({ hasText: "Черновик сохранён" }),
  ).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(field).toHaveValue(answer);
  await expect(page.locator(".oge-work-status")).toContainText(
    "из " + sessionLimits.practiceBatchItems,
  );
  const restored = await durableWork(page);
  expect(restored.snapshot).toEqual(first.snapshot);
  expect(restored.session.answers[exercise.exercise.id]).toBe(answer);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).filter((key) => key.startsWith("polina-oge-")),
    ),
  ).toEqual([]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("P0-01: первоначальный отказ IDB сохраняет читаемую подборку через localStorage", async ({
  page,
}) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = function () {
      throw new DOMException("Synthetic denied IDB", "SecurityError");
    };
  });
  await page.goto("oge/bank/8/");
  await page.getByRole("button", { name: "5 заданий", exact: true }).click();
  await expect(page.locator("#work-question")).toBeVisible();
  const snapshot = (await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem(
        "polina-oge-work-v1:" + new URLSearchParams(location.search).get("id"),
      )!,
    ),
  )) as PracticeSession;
  expect(parseSession(JSON.stringify(snapshot))?.items).toHaveLength(5);
  const first = snapshot.items[0];
  if (first.kind !== "exercise") throw Error("Expected exercise");
  const field = page
    .locator("#work-question")
    .getByLabel("Ваш ответ", { exact: true });
  await field.fill(first.exercise.answers[0]);
  await expect(
    page.getByRole("status").filter({ hasText: "Черновик сохранён" }),
  ).toBeVisible();
  await page.reload();
  await expect(field).toHaveValue(first.exercise.answers[0]);
  await expect(page.getByRole("alert")).toHaveCount(0);
});
