import { expect, test } from "@playwright/test";
import fs from "node:fs";
import {
  importSessions,
  backupMaxBytes,
} from "../../apps/showcase/src/oge/backup";

test("ОГЭ: 201 сохранённая работа скачивается двумя восстанавливаемыми частями", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("oge/bank/8/");
  await page.getByRole("button", { name: "5 заданий", exact: true }).click();
  await expect(page.locator("#work-question")).toBeVisible();
  const ids = await page.evaluate(async () => {
    const id = new URLSearchParams(location.search).get("id")!;
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("polina-oge-works-v2", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const read = db.transaction(["snapshots", "drafts", "index"], "readonly");
    const get = (store: string) =>
      new Promise<Record<string, unknown>>((resolve, reject) => {
        const request = read.objectStore(store).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [snapshot, draft, summary] = await Promise.all(
      ["snapshots", "drafts", "index"].map(get),
    );
    if (!snapshot || !draft || !summary)
      throw Error("Actual saved snapshot required");
    const ids = [id],
      write = db.transaction(["snapshots", "drafts", "index"], "readwrite");
    const complete = new Promise<void>((resolve, reject) => {
      write.oncomplete = () => resolve();
      write.onerror = () => reject(write.error);
      write.onabort = () => reject(write.error);
    });
    for (let number = 1; number <= 200; number++) {
      const copyId = crypto.randomUUID(),
        title = "Архивная работа " + number;
      ids.push(copyId);
      write
        .objectStore("snapshots")
        .put({ ...snapshot, id: copyId, title }, copyId);
      write.objectStore("drafts").put(draft, copyId);
      write.objectStore("index").put({ ...summary, id: copyId, title }, copyId);
    }
    await complete;
    db.close();
    for (const key of Object.keys(localStorage))
      if (
        [
          "polina-oge-work-v1:",
          "polina-oge-state-v2:",
          "polina-oge-index-v2:",
        ].some((prefix) => key.startsWith(prefix))
      )
        localStorage.removeItem(key);
    return ids;
  });
  await page.goto("oge/results/");
  await expect(
    page.getByRole("status").filter({ hasText: "Сохранённых работ: 201" }),
  ).toBeVisible();
  const downloads: string[] = [];
  page.on("download", (download) =>
    downloads.push(download.suggestedFilename()),
  );
  await page
    .getByRole("button", {
      name: "Скачать резервную копию всех работ",
      exact: true,
    })
    .click();
  const parts = page.locator(".oge-backup-parts");
  await expect(parts).toBeVisible();
  await expect(parts.getByRole("button")).toHaveCount(2);
  expect(downloads).toEqual([]);
  const restored: string[] = [];
  for (let number = 1; number <= 2; number++) {
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      parts
        .getByRole("button", {
          name: "Скачать часть " + number + " из 2",
          exact: true,
        })
        .click(),
    ]);
    expect(download.suggestedFilename()).toContain(
      "-part-" + number + "-of-2.json",
    );
    const path = await download.path();
    const raw = fs.readFileSync(path!, "utf8");
    expect(Buffer.byteLength(raw, "utf8")).toBeLessThanOrEqual(backupMaxBytes);
    const works = importSessions(raw);
    expect(works).toHaveLength(number === 1 ? 200 : 1);
    expect(works.every((work) => work.items.length === 5)).toBe(true);
    restored.push(...works.map((work) => work.id));
  }
  expect(downloads).toHaveLength(2);
  expect(restored.sort()).toEqual(ids.sort());
  await expect(
    page.getByRole("status").filter({ hasText: "Сохранённых работ: 201" }),
  ).toBeVisible();
});
