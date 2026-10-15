import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import data from "../../apps/showcase/src/oge/materials.json" with { type: "json" };
import {
  createSession,
  type Materials,
} from "../../apps/showcase/src/oge/engine";
import { importSessions } from "../../apps/showcase/src/oge/backup";

async function openWriting(page: Page) {
  const materials = { ...data, exercises: [] } as unknown as Materials;
  const writing = materials.writing.find((item) => item.line === 13)!;
  const session = createSession([{ kind: "writing", writing }], materials, {
    title: "Синтетическая проверка ручного подсчёта",
    kind: "practice",
    mode: "learn",
    seed: "manual-volume",
  });
  await page.goto("oge/");
  await page.evaluate(
    (session) =>
      localStorage.setItem(
        "polina-oge-work-v1:" + session.id,
        JSON.stringify(session),
      ),
    session,
  );
  await page.goto("oge/practice/session/?id=" + session.id);
  await expect(
    page.getByRole("textbox", { name: "Ваш письменный ответ", exact: true }),
  ).toBeVisible();
  return session;
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "Черновик сохранён" }),
  ).toBeVisible();
}
async function manual(
  page: Page,
  count: number,
  role: "self" | "expert" = "self",
) {
  const panel = page.getByRole("region", {
    name: "Подсчёт слов письменной работы",
    exact: true,
  });
  await panel
    .getByText("Уточнить подсчёт слов вручную", { exact: true })
    .click();
  await panel
    .getByLabel("Уточнённое количество слов", { exact: true })
    .fill(String(count));
  await panel
    .getByRole("combobox", { name: "Кто уточняет объём", exact: true })
    .selectOption(role);
  await panel
    .getByLabel("Имя автора уточнения", { exact: true })
    .fill("Синтетический проверяющий объёма");
  await panel
    .getByLabel("Основание ручного подсчёта", { exact: true })
    .fill(
      "Тестовая ручная поправка спорной записи; это синтетический сценарий.",
    );
  await panel
    .getByRole("button", { name: "Сохранить ручной подсчёт", exact: true })
    .click();
  await expect(panel).toContainText("Слов: " + count + ". Ручное уточнение");
  return panel;
}

test("P1-13: ручной объём с автором/причиной сохраняется после reload и переноса файла, самооценка не зачтена", async ({
  page,
  browser,
  baseURL,
}) => {
  test.setTimeout(90000);
  await openWriting(page);
  await page
    .getByRole("textbox", { name: "Ваш письменный ответ", exact: true })
    .fill("слово ".repeat(139));
  const panel = await manual(page, 140);
  const literacy = page.locator(".oge-criteria").last();
  await literacy.locator(":scope > summary").click();
  await expect(literacy).toContainText(
    "В работах с явно зачтённым содержанием: 0 слов",
  );
  await expect(
    literacy.getByRole("button", { name: "Зафиксировать оценку", exact: true }),
  ).toBeDisabled();
  await saved(page);
  await page.reload();
  await expect(panel).toContainText("Слов: 140. Ручное уточнение");
  await expect(panel).toContainText(
    "Самопроверка: Синтетический проверяющий объёма",
  );
  await expect(panel).toContainText("Тестовая ручная поправка спорной записи");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать резервную копию", exact: true })
    .click();
  const download = await downloadPromise;
  const raw = await readFile((await download.path())!, "utf8");
  const restored = importSessions(raw)[0];
  const correction = Object.values(restored.writingReviews!)[0]
    .wordCountCorrection!;
  expect(correction.count).toBe(140);
  expect(correction.role).toBe("self");
  expect(correction.reason).toContain("синтетический сценарий");
  expect(Number.isFinite(Date.parse(correction.recordedAt))).toBe(true);
  const transfer = await browser.newContext({
    baseURL,
    viewport: page.viewportSize() ?? undefined,
  });
  try {
    const next = await transfer.newPage();
    await next.goto("oge/results/");
    await next
      .getByLabel("Восстановить из файла", { exact: true })
      .setInputFiles({
        name: "synthetic-manual-copy.json",
        mimeType: "application/json",
        buffer: Buffer.from(raw),
      });
    await expect(
      next.getByRole("status").filter({ hasText: "Импортировано работ: 1" }),
    ).toBeVisible();
    await next.goto("oge/practice/session/?id=" + restored.id);
    await expect(
      next.getByRole("region", {
        name: "Подсчёт слов письменной работы",
        exact: true,
      }),
    ).toContainText("Слов: 140. Ручное уточнение");
    await expect(
      next
        .locator(".oge-evaluation-sheet")
        .first()
        .getByRole("combobox", { name: "Кто оценивает", exact: true }),
    ).toHaveValue("self");
  } finally {
    await transfer.close();
  }
});

test("P1-13: фиксация 140 требует явного зачёта содержания; правка ответа и смена темы не оживляют прежнюю оценку", async ({
  page,
}) => {
  await openWriting(page);
  const answer = page.getByRole("textbox", {
    name: "Ваш письменный ответ",
    exact: true,
  });
  const old = "слово ".repeat(139);
  await answer.fill(old);
  const panel = await manual(page, 140, "expert");
  const sheet = page.locator(".oge-evaluation-sheet").first();
  await sheet
    .getByRole("combobox", { name: "Кто оценивает", exact: true })
    .selectOption("expert");
  await sheet
    .getByLabel("Имя проверяющего", { exact: true })
    .fill("Синтетический проверяющий содержания");
  await sheet
    .getByRole("checkbox", {
      name: "Содержание этой работы зачтено проверяющим",
      exact: true,
    })
    .check();
  for (const [code, value] of [
    ["СК1", "1"],
    ["СК2", "4"],
    ["СК3", "2"],
    ["СК4", "1"],
  ])
    await sheet
      .getByRole("combobox", { name: new RegExp("^" + code) })
      .selectOption(value);
  await sheet
    .getByRole("button", { name: "Зафиксировать оценку", exact: true })
    .click();
  await expect(sheet).toContainText("По этим критериям: 8 из 8");
  const literacy = page.locator(".oge-criteria").last();
  await literacy.locator(":scope > summary").click();
  await expect(literacy).toContainText(
    "В работах с явно зачтённым содержанием: 140 слов",
  );
  await expect(
    literacy.getByRole("button", { name: "Зафиксировать оценку", exact: true }),
  ).toBeEnabled();
  await answer.fill(old + "Новый вывод.");
  await expect(panel).toContainText("Прежнее уточнение не применяется");
  await expect(sheet).not.toContainText("По этим критериям:");
  await expect(literacy).toContainText(
    "В работах с явно зачтённым содержанием: 0 слов",
  );
  await answer.fill(old);
  await expect(panel).toContainText(
    "Слов: 139. Предварительный автоматический подсчёт",
  );
  await expect(sheet).not.toContainText("По этим критериям:");
  await page
    .getByRole("combobox", { name: "Выберите один вопрос", exact: true })
    .selectOption("13.2");
  await page
    .getByRole("combobox", { name: "Выберите один вопрос", exact: true })
    .selectOption("13.1");
  await expect(panel).toContainText("Прежнее уточнение не применяется");
  await expect(sheet).not.toContainText("По этим критериям:");
  await saved(page);
  await page.reload();
  await expect(panel).toContainText(
    "Слов: 139. Предварительный автоматический подсчёт",
  );
  await expect(sheet).not.toContainText("По этим критериям:");
});
