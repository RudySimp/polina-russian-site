import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import materialsData from "../../apps/showcase/src/oge/materials.json" with { type: "json" };
import workshops from "../../content/oge-writing-workshops.json" with { type: "json" };
import {
  createSession,
  type Materials,
} from "../../apps/showcase/src/oge/engine";
async function open(page: Page, mode: "learn" | "control" = "learn") {
  const materials = { ...materialsData, exercises: [] } as unknown as Materials;
  const writing = materials.writing.find(
    (w) => w.id === workshops.workshops[1].writingId,
  )!;
  const session = createSession([{ kind: "writing", writing }], materials, {
    title: "Синтетическая проверка письменного практикума",
    kind: "practice",
    mode,
    seed: "writing-workshop",
  });
  await page.goto("oge/");
  await page.evaluate(
    (s) =>
      localStorage.setItem("polina-oge-work-v1:" + s.id, JSON.stringify(s)),
    session,
  );
  await page.goto("oge/practice/session/?id=" + session.id);
  await expect(
    page.getByRole("textbox", { name: "Ваш письменный ответ", exact: true }),
  ).toBeVisible();
  return session;
}
async function reveal(page: Page) {
  await page
    .getByText("Учебный маршрут: от исходного текста к письменному ответу", {
      exact: true,
    })
    .click();
  await page
    .getByText("Письменные операции и оценённые образцы", { exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Письменный практикум", exact: true }),
  ).toBeVisible();
}
test("P1-12: собственный фрагмент предшествует образцу, помощь и первая версия сохраняются и входят в копию прогресса", async ({
  page,
}) => {
  await open(page);
  await reveal(page);
  const task = page.locator(".oge-writing-microtask").first();
  await expect(
    task.getByRole("button", {
      name: "Открыть образец и вопросы",
      exact: true,
    }),
  ).toBeDisabled();
  await task
    .getByRole("textbox", { name: "Ваш учебный фрагмент", exact: true })
    .fill(
      "Сравнение помогает показать переживание героя, а не только событие.",
    );
  await task
    .getByRole("button", { name: "Зафиксировать первый вариант", exact: true })
    .click();
  await task
    .getByRole("button", { name: "Открыть образец и вопросы", exact: true })
    .click();
  await expect(task).toContainText(
    "последующее редактирование выполняется с опорой на него",
  );
  await task.getByRole("checkbox").check();
  await expect(task).toContainText("не автоматический зачёт содержания");
  await page.reload();
  await reveal(page);
  await expect(task.getByRole("textbox")).toHaveValue(
    "Сравнение помогает показать переживание героя, а не только событие.",
  );
  await expect(task).toContainText("Образец этой микрозадачи уже открывался");
  const sample = page.locator(".oge-scored-writing-sample").first();
  await sample.locator(":scope > summary").click();
  await expect(sample).toContainText("8/8");
  await expect(sample).toContainText("СК2: 4");
  await expect(sample).toContainText("Редакторская учебная оценка");
  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    accessibility.violations.map((item) => ({
      id: item.id,
      nodes: item.nodes.map((node) => node.target),
    })),
  ).toEqual([]);
  await expect(
    page.getByRole("textbox", { name: "Ваш письменный ответ", exact: true }),
  ).toHaveValue("");
  await page.goto("oge/results/");
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать учебный прогресс", exact: true })
    .click();
  const file = await downloading;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  const entries = data.entries.filter((entry: { key: string }) =>
    entry.key.includes("writing-workshop:"),
  );
  expect(entries.length).toBeGreaterThan(0);
  const value = JSON.parse(entries[0].value);
  expect(value.assisted).toBe(true);
  expect(value.firstAnswer).toContain("Сравнение помогает");
});
test("P1-12: незавершённая контрольная работа скрывает образцы и учебный практикум", async ({
  page,
}) => {
  await open(page, "control");
  await expect(
    page.getByText(
      "Учебный маршрут: от исходного текста к письменному ответу",
      { exact: true },
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText("Письменные операции и оценённые образцы", { exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".oge-scored-writing-sample")).toHaveCount(0);
});
