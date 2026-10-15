import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("P2-06: отдельная копия переносит реальную отметку чтения и сохраняет существующий прогресс", async ({
  page,
  browser,
  baseURL,
}) => {
  await page.goto("theory/osnova/?exam=OGE");
  const mark = page
    .getByRole("button", { name: "Отметить параграф прочитанным", exact: true })
    .first();
  await mark.click();
  await expect(page.getByText(/Отмечено прочитанным: 1 из/)).toBeVisible();
  const original = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) =>
        key.startsWith("polina-lesson-state-v2:"),
      ),
    ),
  );
  await page.goto("oge/results/");
  await expect(
    page.getByRole("region", { name: "Копия учебного прогресса" }),
  ).toContainText("Для полного переноса нужны оба файла");
  const waiting = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать учебный прогресс", exact: true })
    .click();
  const download = await waiting;
  const raw = await readFile((await download.path())!, "utf8");
  expect(JSON.parse(raw).format).toBe("polina-guest-progress");
  const next = await browser.newContext({
    baseURL,
    viewport: page.viewportSize() ?? undefined,
  });
  try {
    const target = await next.newPage();
    await target.goto("oge/results/");
    await target
      .getByLabel("Восстановить учебный прогресс", { exact: true })
      .setInputFiles({
        name: "progress.json",
        mimeType: "application/json",
        buffer: Buffer.from(raw),
      });
    await expect(
      target.getByRole("status").filter({ hasText: "Восстановлено записей:" }),
    ).toBeVisible();
    await target.goto("theory/osnova/?exam=OGE");
    await expect(target.getByText(/Отмечено прочитанным: 1 из/)).toBeVisible();
    expect(
      await target.evaluate(() =>
        Object.fromEntries(
          Object.entries(localStorage).filter(([key]) =>
            key.startsWith("polina-lesson-state-v2:"),
          ),
        ),
      ),
    ).toEqual(original);
    await target
      .getByRole("button", {
        name: "Отметить параграф прочитанным",
        exact: true,
      })
      .first()
      .click();
    await target.goto("oge/results/");
    await target
      .getByLabel("Восстановить учебный прогресс", { exact: true })
      .setInputFiles({
        name: "progress.json",
        mimeType: "application/json",
        buffer: Buffer.from(raw),
      });
    await target.goto("theory/osnova/?exam=OGE");
    await expect(target.getByText(/Отмечено прочитанным: 2 из/)).toBeVisible();
  } finally {
    await next.close();
  }
});
