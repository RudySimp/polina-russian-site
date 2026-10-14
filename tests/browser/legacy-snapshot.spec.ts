import { expect, test } from "@playwright/test";
import fs from "node:fs";
import type { PracticeSession } from "../../apps/showcase/src/oge/model";
import { importSessions } from "../../apps/showcase/src/oge/backup";
const raw = fs.readFileSync(
  "tests/fixtures/legacy-pre-audit-full.json",
  "utf8",
);
const legacy = JSON.parse(raw) as PracticeSession;
const old = legacy.items.find(
  (item) =>
    item.kind === "exercise" && item.exercise.id === "oge-glasnye-v-tekste-013",
);
if (old?.kind !== "exercise")
  throw Error("Baseline damaged condition required");

test("ОГЭ: настоящий снимок редакции до аудита открывается и переносится без подмены", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(
    ({ id, raw }) => {
      if (!localStorage.getItem("polina-oge-work-v1:" + id))
        localStorage.setItem("polina-oge-work-v1:" + id, raw);
    },
    { id: legacy.id, raw },
  );
  const audio = await page.request.get(
    legacy.audio[0].path.replace(/^\/+/u, ""),
  );
  expect(audio.status()).toBe(200);
  const waveform = await audio.body();
  expect(waveform.subarray(0, 4).toString("ascii")).toBe("RIFF");
  expect(waveform.subarray(8, 12).toString("ascii")).toBe("WAVE");
  await page.goto("oge/results/");
  await expect(
    page.getByRole("status").filter({ hasText: "Сохранённых работ: 1" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Продолжить работу", exact: true })
    .click();
  await expect(page.locator("#work-question")).toBeVisible();
  await expect(page.locator("#work-question .source-text")).toContainText(
    old.exercise.text!,
  );
  await expect(page.locator("#work-question .source-text")).toContainText(
    "гн…тся(8)т",
  );
  await expect(
    page.locator("#work-question").getByLabel("Ваш ответ", { exact: true }),
  ).toHaveValue(old.exercise.answers[0]);
  await expect(page.locator("main")).toContainText("прежние редакции");
  expect(
    await page.evaluate(
      (id) => localStorage.getItem("polina-oge-work-v1:" + id),
      legacy.id,
    ),
  ).toBe(raw);
  await page.goto("oge/results/");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page
      .getByRole("button", {
        name: "Скачать резервную копию всех работ",
        exact: true,
      })
      .click(),
  ]);
  const path = await download.path();
  const restored = importSessions(fs.readFileSync(path!, "utf8"));
  expect(restored).toHaveLength(1);
  expect(restored[0].items).toEqual(legacy.items);
  expect(restored[0].answers).toEqual(legacy.answers);
  expect(restored[0].audio).toEqual(legacy.audio);
  await page
    .getByLabel("Восстановить из файла", { exact: true })
    .setInputFiles(path!);
  await expect(
    page.getByRole("status").filter({ hasText: "Импортировано работ: 1" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: "Сохранённых работ: 2" }),
  ).toBeVisible();
  const copied = page
    .locator(".oge-work-list .question-card")
    .filter({ hasText: legacy.title })
    .filter({
      has: page.getByRole("link", { name: "Продолжить работу", exact: true }),
    });
  await expect(copied).toHaveCount(2);
  const hrefs = await copied
    .getByRole("link", { name: "Продолжить работу", exact: true })
    .evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).href),
    );
  const newHref = hrefs.find(
    (href) => new URL(href).searchParams.get("id") !== legacy.id,
  )!;
  await page.goto(newHref);
  await expect(page.locator("#work-question .source-text")).toContainText(
    old.exercise.text!,
  );
  await expect(
    page.locator("#work-question").getByLabel("Ваш ответ", { exact: true }),
  ).toHaveValue(old.exercise.answers[0]);
  expect(errors).toEqual([]);
});
