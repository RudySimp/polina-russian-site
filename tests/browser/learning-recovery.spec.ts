import { test, expect } from "@playwright/test";
test("урок восстанавливает выбранный случай, ответ, контроль и отметки чтения", async ({
  page,
}) => {
  await page.goto("theory/analiz-teksta/?exam=OGE");
  const card = page
    .locator(".interactive-card")
    .filter({ hasText: "Точность чтения" });
  await card.getByRole("button", { name: "Случай 2", exact: true }).click();
  await card.getByLabel("Не подтверждено", { exact: true }).check();
  await card.getByRole("button", { name: "Проверить", exact: true }).click();
  await expect(card.locator(".feedback.correct")).toBeVisible();
  await page
    .getByRole("button", { name: "Отметить параграф прочитанным", exact: true })
    .first()
    .click();
  await page.reload();
  await expect(
    card.getByRole("button", { name: "Случай 2", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    card.getByLabel("Не подтверждено", { exact: true }),
  ).toBeChecked();
  await expect(card.locator(".feedback.correct")).toBeVisible();
  await expect(page.locator(".lesson-reading-progress")).toContainText("1 из");
  await expect(
    page.getByRole("button", {
      name: "Прочитано · снять отметку",
      exact: true,
    }),
  ).toHaveCount(1);
  await page.goto("theory/osnova/?exam=OGE");
  const checkpoint = page.locator(".checkpoint").first();
  await checkpoint.getByRole("radio").first().check();
  await checkpoint
    .getByRole("button", { name: "Проверить себя", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Открыть первый шаг", exact: true })
    .first()
    .click();
  await page.reload();
  await expect(checkpoint.getByRole("radio").first()).toBeChecked();
  await expect(checkpoint.locator(".feedback")).toBeVisible();
  await expect(
    page.locator(".step-explanation ol").first().locator("li"),
  ).toHaveCount(1);
});
test("резервный файл проверяется до импорта, совпавшая работа сохраняется отдельной копией", async ({
  page,
}) => {
  await page.goto("oge/");
  await page
    .getByRole("button", { name: "Решать задание № 2", exact: true })
    .click();
  await expect(page.locator("#work-question")).toBeVisible();
  const work = await page.evaluate(() => {
    const id = new URLSearchParams(location.search).get("id");
    const saved = JSON.parse(localStorage.getItem("polina-oge-work-v1:" + id)!);
    const state = JSON.parse(
      localStorage.getItem("polina-oge-state-v2:" + id) ?? "null",
    );
    return { ...saved, ...(state?.state ?? {}) };
  });
  await page.goto("oge/results/");
  await expect(
    page.getByRole("status").filter({ hasText: "Сохранённых работ:" }),
  ).toContainText("1");
  const upload = page.locator("input[type=file]");
  await upload.setInputFiles({
    name: "wrong.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "other", version: 999, sessions: [work] }),
    ),
  });
  await expect(page.getByRole("alert")).toContainText("Неизвестная структура");
  await expect(
    page.getByRole("status").filter({ hasText: "Сохранённых работ:" }),
  ).toContainText("1");
  await upload.setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        format: "polina-oge-backup",
        version: 1,
        sessions: [work],
      }),
    ),
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Импортировано" }),
  ).toContainText("1");
  await expect(
    page.getByRole("status").filter({ hasText: "Сохранённых работ:" }),
  ).toContainText("2");
});
test("после сбоя загрузки урока повторная загрузка сохраняет существующую работу", async ({
  page,
}) => {
  await page.goto("oge/");
  await page
    .getByRole("button", { name: "Решать задание № 2", exact: true })
    .click();
  await expect(page.locator("#work-question")).toBeVisible();
  const savedId = new URLSearchParams(new URL(page.url()).search).get("id")!;
  // Applies to both Vite development JSON modules and production lesson chunks.
  const failed = (url: URL) =>
    url.pathname.includes("analiz-teksta") &&
    (url.pathname.endsWith(".json") || url.pathname.endsWith(".js"));
  let failedRequests = 0;
  await page.route(failed, (route) => {
    failedRequests += 1;
    return route.abort();
  });
  await page.goto("theory/analiz-teksta/?exam=OGE");
  await expect(page.getByRole("alert")).toContainText(
    "Материалы не загрузились",
  );
  expect(failedRequests).toBeGreaterThan(0);
  expect(failedRequests).toBeLessThanOrEqual(3);
  const settledRequests = failedRequests;
  await page.waitForTimeout(300);
  expect(failedRequests).toBe(settledRequests);
  await page.unroute(failed);
  await page
    .getByRole("button", { name: "Повторить загрузку", exact: true })
    .click();
  await expect(
    page.locator(".interactive-card").filter({ hasText: "Точность чтения" }),
  ).toBeVisible();
  await page.goto("oge/practice/session/?id=" + savedId);
  await expect(page.locator("#work-question")).toBeVisible();
  expect(new URLSearchParams(new URL(page.url()).search).get("id")).toBe(
    savedId,
  );
});

test("скачанный код восстанавливает те же условия новой попыткой и отклоняет недоступную редакцию", async ({
  page,
  browser,
}) => {
  await page.goto("oge/");
  await page
    .getByRole("button", { name: "Решать задание № 2", exact: true })
    .click();
  await expect(page.locator("#work-question")).toBeVisible();
  const original = await page.evaluate(() => {
    const id = new URLSearchParams(location.search).get("id");
    return JSON.parse(localStorage.getItem("polina-oge-work-v1:" + id)!);
  });
  await page
    .locator("#work-question")
    .getByLabel("Ваш ответ", { exact: true })
    .fill(original.items[0].exercise.answers[0]);
  await page
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Завершить работу", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Подтвердить завершение", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("Результаты и разбор");
  await page.getByText("Код и редакция варианта", { exact: true }).click();
  const backupPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать работу с условиями", exact: true })
    .click();
  const backupStream = await (await backupPromise).createReadStream(),
    backupChunks: Buffer[] = [];
  for await (const chunk of backupStream!)
    backupChunks.push(Buffer.from(chunk));
  const backup = JSON.parse(Buffer.concat(backupChunks).toString("utf8"));
  expect(backup.sessions[0].items).toEqual(original.items);
  expect(backup.sessions[0].answers[original.items[0].exercise.id]).toBe(
    original.items[0].exercise.answers[0],
  );
  expect(backup.sessions[0].completedAt).toBeTruthy();
  await page.evaluate(() => {
    window.print = () => {
      document.body.dataset.printRequested = "yes";
    };
  });
  await page
    .getByRole("button", { name: "Распечатать полную работу", exact: true })
    .click();
  await expect(page.locator("body")).toHaveAttribute(
    "data-print-requested",
    "yes",
  );
  expect(await page.locator(".oge-result details:not([open])").count()).toBe(0);
  await expect(page.locator(".oge-result")).toHaveCount(original.items.length);

  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Скачать код состава", exact: true })
    .click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks);
  const code = JSON.parse(raw.toString("utf8"));
  expect(code.assignments.map((ref: { id: string }) => ref.id)).toEqual(
    original.items.map(
      (item: { exercise: { id: string } }) => item.exercise.id,
    ),
  );
  await page.goto("oge/generator/");
  await page.getByText("Восстановить состав по коду", { exact: true }).click();
  await page.getByLabel("Файл кода состава").setInputFiles({
    name: "code.json",
    mimeType: "application/json",
    buffer: raw,
  });
  await expect(page.locator("#work-question")).toBeVisible();
  const restored = await page.evaluate(() => {
    const id = new URLSearchParams(location.search).get("id");
    return JSON.parse(localStorage.getItem("polina-oge-work-v1:" + id)!);
  });
  expect(restored.id).not.toBe(original.id);
  expect(restored.items).toEqual(original.items);
  expect(restored.answers).toEqual({});
  expect(restored.completedAt).toBeUndefined();
  const context = await browser.newContext(),
    fresh = await context.newPage();
  await fresh.goto(
    new URL("oge/generator/", test.info().project.use.baseURL as string).href,
  );
  await fresh.getByText("Восстановить состав по коду", { exact: true }).click();
  await fresh.getByLabel("Файл кода состава").setInputFiles({
    name: "old-code.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...code,
        catalogVersion: "unavailable-historical-bank",
      }),
    ),
  });
  await expect(fresh.getByRole("alert")).toContainText(
    "полную резервную копию",
  );
  expect(
    await fresh.evaluate(
      () =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith("polina-oge-work-v1:"),
        ).length,
    ),
  ).toBe(0);
  await fresh.getByLabel("Файл кода состава").setInputFiles({
    name: "code.json",
    mimeType: "application/json",
    buffer: raw,
  });
  await expect(fresh.locator("#work-question")).toBeVisible();
  const transferred = await fresh.evaluate(() => {
    const id = new URLSearchParams(location.search).get("id");
    return JSON.parse(localStorage.getItem("polina-oge-work-v1:" + id)!);
  });
  expect(transferred.items).toEqual(original.items);
  await context.close();
});

test("сбой быстрой подборки показывает ошибку и допускает повторный запуск после перезагрузки", async ({
  page,
}) => {
  await page.goto("oge/");
  const failed = (url: URL) => /osnova-\d+(?:-|\.json)/.test(url.pathname);
  let failedRequests = 0;
  await page.route(failed, (route) => {
    failedRequests += 1;
    return route.abort();
  });
  await page
    .getByRole("button", { name: "Решать задание № 2", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("перезагрузите страницу");
  expect(failedRequests).toBeGreaterThan(0);
  expect(failedRequests).toBeLessThanOrEqual(4);
  expect(
    await page.evaluate(
      () =>
        Object.keys(localStorage).filter((key) =>
          key.startsWith("polina-oge-work-v1:"),
        ).length,
    ),
  ).toBe(0);
  await page.unroute(failed);
  await page
    .getByRole("button", { name: "Перезагрузить страницу", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Решать задание № 2", exact: true })
    .click();
  await expect(page.locator("#work-question")).toBeVisible();
  const count = await page.evaluate(() => {
    const id = new URLSearchParams(location.search).get("id");
    return JSON.parse(localStorage.getItem("polina-oge-work-v1:" + id)!).items
      .length;
  });
  expect(count).toBe(5);
});
