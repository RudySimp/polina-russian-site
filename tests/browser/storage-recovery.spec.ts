import { test, expect, type Page } from "@playwright/test";
import data from "../../apps/showcase/src/oge/materials.json" with { type: "json" };
import reading from "../../apps/showcase/src/content/exercises/analiz-teksta.json" with { type: "json" };
import {
  createSession,
  type Materials,
} from "../../apps/showcase/src/oge/engine";
import type { PracticeSession } from "../../apps/showcase/src/oge/model";
import type { Exercise } from "../../apps/showcase/src/content/model";

function work(mode: "learn" | "control" = "learn") {
  const materials = { ...data, exercises: [] } as unknown as Materials;
  const writing = materials.writing.find((item) => item.line === 13)!;
  return createSession([{ kind: "writing", writing }], materials, {
    title: "Надёжный письменный черновик",
    kind: "practice",
    mode,
    seed: "recovery",
  });
}
async function open(page: Page, session: PracticeSession, ended = false) {
  await page.goto("oge/");
  await page.evaluate(
    (session) =>
      localStorage.setItem(
        "polina-oge-work-v1:" + session.id,
        JSON.stringify(session),
      ),
    session,
  );
  await page.goto(`oge/practice/session/?id=${session.id}`);
  if (!ended)
    await expect(
      page.getByRole("textbox", { name: "Ваш письменный ответ", exact: true }),
    ).toBeVisible();
}
async function saved(page: Page) {
  await expect(
    page.getByRole("status").filter({ hasText: "Черновик сохранён" }),
  ).toBeVisible();
}
async function failWrites(page: Page) {
  await page.evaluate(() => {
    const task = window as Window & { __failWrites?: boolean };
    task.__failWrites = true;
    const transaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function (names, mode, options) {
      if (task.__failWrites && mode === "readwrite")
        throw new DOMException("Simulated write failure", "QuotaExceededError");
      return transaction.call(this, names, mode, options);
    };
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (task.__failWrites && key.startsWith("polina-oge-"))
        throw new DOMException("Simulated write failure", "QuotaExceededError");
      return setItem.call(this, key, value);
    };
  });
}
test("P0-04: отказ обоих хранилищ → восстановление → retry сохраняет длинный черновик", async ({
  page,
}) => {
  const session = work();
  await open(page, session, true);
  const field = page.getByRole("textbox", {
    name: "Ваш письменный ответ",
    exact: true,
  });
  await field.fill("Первоначальный текст.");
  await saved(page);
  await failWrites(page);
  const long = "Сохраняем важные мысли и каждое пояснение. ".repeat(200);
  await field.fill(long);
  await expect(
    page.getByRole("alert").filter({ hasText: "Браузер не сохранил черновик" }),
  ).toBeVisible();
  await field.fill(long + "Последняя фраза.");
  await expect(page.locator("main")).not.toContainText(
    "работа изменена в другой вкладке",
  );
  await page.evaluate(() => {
    (window as Window & { __failWrites?: boolean }).__failWrites = false;
  });
  await page
    .getByRole("button", { name: "Повторить сохранение", exact: true })
    .click();
  await saved(page);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(field).toHaveValue(long + "Последняя фраза.");
});
test("Две вкладки: реальный конфликт сохраняет обе редакции и отдельную копию", async ({
  page,
  context,
}) => {
  const session = work();
  await open(page, session);
  const second = await context.newPage();
  await second.goto(`oge/practice/session/?id=${session.id}`);
  const a = page.getByRole("textbox", {
    name: "Ваш письменный ответ",
    exact: true,
  });
  const b = second.getByRole("textbox", {
    name: "Ваш письменный ответ",
    exact: true,
  });
  await expect(b).toBeVisible();
  await failWrites(second);
  await b.fill("Моя несохранённая редакция во второй вкладке.");
  await expect(
    second
      .getByRole("alert")
      .filter({ hasText: "Браузер не сохранил черновик" }),
  ).toBeVisible();
  await a.fill("Сохранённая редакция в первой вкладке.");
  await saved(page);
  await expect(
    second.getByRole("button", { name: "Скачать обе редакции", exact: true }),
  ).toBeVisible();
  await expect(b).toHaveValue("Моя несохранённая редакция во второй вкладке.");
  await second.evaluate(() => {
    (window as Window & { __failWrites?: boolean }).__failWrites = false;
  });
  await second
    .getByRole("button", {
      name: "Сохранить текущую редакцию отдельно",
      exact: true,
    })
    .click();
  await expect(second).not.toHaveURL(new RegExp(session.id));
  await second.reload();
  await expect(b).toHaveValue("Моя несохранённая редакция во второй вкладке.");
  await page.reload();
  await expect(a).toHaveValue("Сохранённая редакция в первой вкладке.");
});
test("IndexedDB: миграция сохраняет v1, снимок неизменен, ответы и оценочный лист восстанавливаются", async ({
  page,
}) => {
  const session = work();
  await open(page, session);
  const answer =
    "Герой помогает другу и принимает ответственность за поступок. ".repeat(12);
  await page
    .getByRole("textbox", { name: "Ваш письменный ответ", exact: true })
    .fill(answer);
  const sheet = page.locator(".oge-evaluation-sheet").first();
  await sheet.getByRole("checkbox").first().check();
  await sheet
    .getByLabel("Замечания и план исправления")
    .fill("Уточнить пояснение второго примера.");
  await saved(page);
  const state = await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("polina-oge-works-v2", 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const value = (name: string) =>
      new Promise<unknown>((resolve, reject) => {
        const request = db.transaction(name).objectStore(name).get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    const [snapshot, draft, index] = await Promise.all([
      value("snapshots"),
      value("drafts"),
      value("index"),
    ]);
    db.close();
    return {
      snapshot,
      draft,
      index,
      legacy: !!localStorage.getItem("polina-oge-work-v1:" + id),
    };
  }, session.id);
  expect(state.legacy).toBe(true);
  expect((state.snapshot as PracticeSession).answers).toEqual({});
  expect((state.draft as PracticeSession).answers).toEqual({
    [session.items[0].kind === "writing" ? session.items[0].writing.id : ""]:
      answer,
  });
  expect(state.index).not.toHaveProperty("items");
  // A broken old record does not remove the independently migrated work.
  await page.evaluate(
    (id) => localStorage.removeItem("polina-oge-work-v1:" + id),
    session.id,
  );
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Ваш письменный ответ", exact: true }),
  ).toHaveValue(answer);
  await expect(sheet.getByRole("checkbox").first()).toBeChecked();
  await expect(sheet.getByLabel("Замечания и план исправления")).toHaveValue(
    "Уточнить пояснение второго примера.",
  );
});
test("Контрольное время: автоматический итог, пустая письменная работа не ждёт эксперта", async ({
  page,
}) => {
  const session = work("control");
  session.durationMinutes = 1;
  session.startedAt = session.updatedAt = new Date(
    Date.now() - 61000,
  ).toISOString();
  await open(page, session, true);
  await expect(page.locator("h1")).toHaveText("Результаты и разбор");
  await expect(page.locator("main")).toContainText("Контрольное время истекло");
  await expect(page.locator("main")).toContainText("не написано — 1");
  await expect(page.locator("main")).toContainText("требует проверки — 0");
  await saved(page);
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Результаты и разбор");
});

test("Оценочный лист: тема, галочки и экспертные баллы сохраняются; итог содержит исходное условие", async ({
  page,
}) => {
  const session = work();
  const exercise = reading.find(
    (item) => item.sourceTextId === session.texts[0].id,
  )!;
  session.items.unshift({
    kind: "exercise",
    exercise: exercise as unknown as Exercise,
  });
  session.activeIndex = 1;
  await open(page, session);
  await page.getByLabel("Выберите один вопрос").selectOption("13.2");
  const answer =
    "Герой помогает другу и принимает ответственность за поступок. ".repeat(12);
  await page
    .getByRole("textbox", { name: "Ваш письменный ответ", exact: true })
    .fill(answer);
  const sheet = page.locator(".oge-evaluation-sheet").first();
  await sheet.getByRole("checkbox").first().check();
  await sheet
    .getByLabel("Замечания и план исправления")
    .fill("Тема13.2: уточнить связь примеров с выводом.");
  await sheet.getByLabel("Кто оценивает").selectOption("expert");
  await sheet.getByLabel("Имя проверяющего").fill("Проверяющий учебной работы");
  for (const [code, value] of [
    ["СК1", "1"],
    ["СК2", "3"],
    ["СК3", "2"],
    ["СК4", "1"],
  ])
    await sheet
      .getByRole("combobox", { name: new RegExp(`^${code}`) })
      .selectOption(value);
  await sheet
    .getByRole("button", { name: "Зафиксировать оценку", exact: true })
    .click();
  await expect(sheet).toContainText("По этим критериям: 7 из 8");
  await saved(page);
  await page.getByLabel("Выберите один вопрос").selectOption("13.3");
  await expect(sheet.getByRole("checkbox").first()).not.toBeChecked();
  await page.getByLabel("Выберите один вопрос").selectOption("13.2");
  await expect(sheet.getByRole("checkbox").first()).toBeChecked();
  await expect(sheet.getByLabel("Замечания и план исправления")).toHaveValue(
    "Тема13.2: уточнить связь примеров с выводом.",
  );
  await saved(page);
  await page.reload();
  await expect(sheet).not.toContainText("По этим критериям:");
  await sheet
    .getByRole("button", { name: "Зафиксировать оценку", exact: true })
    .click();
  await expect(sheet).toContainText("По этим критериям: 7 из 8");
  await page
    .getByRole("button", { name: "Завершить работу", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Подтвердить завершение", exact: true })
    .click();
  await expect(page.locator("main")).toContainText(
    "записана оценка эксперта — 1",
  );
  const result = page.locator(".oge-result").first();
  await expect(result.locator(".question-prompt")).toHaveText(exercise.prompt);
  await expect(result.locator(".answer-options li")).toHaveCount(
    exercise.options.length,
  );
  await expect(result.locator(".oge-source")).toContainText(
    session.texts[0].paragraphs[0],
  );
  await expect(page.locator(".oge-result").last()).toContainText(
    "Выбранная тема: 13.2",
  );
  await expect(
    page.getByRole("button", {
      name: "Распечатать полную работу",
      exact: true,
    }),
  ).toBeVisible();
});

test("Учебные образцы соответствуют теме и скрыты во время контроля", async ({
  page,
}) => {
  const learn = work();
  await open(page, learn);
  await page
    .getByText("Учебный маршрут: от исходного текста к письменному ответу", {
      exact: true,
    })
    .click();
  await expect(page.locator(".oge-writing-guide")).toContainText("План работы");
  await page
    .locator(".oge-writing-guide")
    .getByText(/Полный сильный образец/u)
    .click();
  await expect(
    page.locator(".oge-writing-guide details[open] .oge-written-answer"),
  ).toBeVisible();
  const control = work("control");
  await open(page, control);
  await expect(page.locator(".oge-writing-guide")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Завершить работу", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Подтвердить завершение", exact: true })
    .click();
  await expect(page.locator(".oge-writing-guide")).toHaveCount(1);
});

test("Истечение времени останавливает уже играющее аудио контрольного изложения", async ({
  page,
}) => {
  const materials = { ...data, exercises: [] } as unknown as Materials;
  const writing = materials.writing.find((writing) => writing.line === 1)!;
  const session = createSession([{ kind: "writing", writing }], materials, {
    title: "Контрольное изложения с аудио",
    kind: "practice",
    mode: "control",
    seed: "audio-timeout",
  });
  session.durationMinutes = 1;
  await page.clock.install({ time: new Date() });
  await open(page, session);
  await page
    .getByRole("button", { name: "Слушать текст", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toBeVisible();
  await page.locator("audio").evaluate((audio: HTMLAudioElement) => {
    (window as Window & { __testAudio?: HTMLAudioElement }).__testAudio = audio;
  });
  await page.clock.fastForward(62000);
  await expect(page.locator("h1")).toHaveText("Результаты и разбор");
  expect(
    await page.evaluate(
      () =>
        (window as Window & { __testAudio?: HTMLAudioElement }).__testAudio
          ?.paused,
    ),
  ).toBe(true);
});

test("Грамотность: 139/140 слов считаются только после явного зачёта содержания проверяющим", async ({
  page,
}) => {
  await open(page, work());
  const answer = page.getByRole("textbox", {
    name: "Ваш письменный ответ",
    exact: true,
  });
  await answer.fill("слово ".repeat(139));
  const individual = page.locator(".oge-evaluation-sheet").first();
  const literacy = page.locator(".oge-criteria").last();
  await literacy.locator(":scope > summary").click();
  const fixLiteracy = literacy.getByRole("button", {
    name: "Зафиксировать оценку",
    exact: true,
  });
  await expect(fixLiteracy).toBeDisabled();
  await individual.getByLabel("Кто оценивает").selectOption("expert");
  await individual
    .getByLabel("Имя проверяющего")
    .fill("Проверяющий содержания");
  await individual
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
    await individual
      .getByRole("combobox", { name: new RegExp("^" + code) })
      .selectOption(value);
  await individual
    .getByRole("button", { name: "Зафиксировать оценку", exact: true })
    .click();
  await expect(literacy).toContainText(
    "В работах с явно зачтённым содержанием: 139 слов",
  );
  await expect(fixLiteracy).toBeDisabled();
  await answer.fill("слово ".repeat(140));
  await expect(literacy).toContainText(
    "В работах с явно зачтённым содержанием: 0 слов",
  );
  await individual
    .getByRole("button", { name: "Зафиксировать оценку", exact: true })
    .click();
  await expect(literacy).toContainText(
    "В работах с явно зачтённым содержанием: 140 слов",
  );
  await expect(fixLiteracy).toBeEnabled();
  await saved(page);
  await page.reload();
  await literacy.locator(":scope > summary").click();
  await expect(literacy).toContainText(
    "В работах с явно зачтённым содержанием: 140 слов",
  );
  await expect(fixLiteracy).toBeEnabled();
  await page.getByLabel("Выберите один вопрос").selectOption("13.2");
  await expect(fixLiteracy).toBeDisabled();
});

test("История восстанавливает устаревший компактный индекс с привязкой упражнения к общему тексту", async ({
  page,
}) => {
  const session = work();
  const exercise = reading.find(
    (item) => item.sourceTextId === session.texts[0].id,
  )!;
  session.items.unshift({
    kind: "exercise",
    exercise: exercise as unknown as Exercise,
  });
  session.activeIndex = 1;
  await open(page, session);
  async function index() {
    return page.evaluate(async (id) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("polina-oge-works-v2", 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const value = await new Promise<{
        historyVersion: number;
        exerciseRefs: { sourceTextId?: string }[];
      }>((resolve, reject) => {
        const request = db.transaction("index").objectStore("index").get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return value;
    }, session.id);
  }
  await expect.poll(async () => (await index())?.historyVersion).toBe(2);
  await page.evaluate(async (id) => {
    const db = await new Promise<IDBDatabase>((resolve) => {
      const request = indexedDB.open("polina-oge-works-v2", 1);
      request.onsuccess = () => resolve(request.result);
    });
    const tx = db.transaction("index", "readwrite");
    const request = tx.objectStore("index").get(id);
    request.onsuccess = () => {
      const legacy = request.result;
      delete legacy.historyVersion;
      delete legacy.exerciseRefs[0].sourceTextId;
      tx.objectStore("index").put(legacy, id);
      localStorage.setItem("polina-oge-index-v2:" + id, JSON.stringify(legacy));
    };
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, session.id);
  await page.goto("oge/results/");
  await expect(page.locator("h1")).toHaveText("Мои работы и результаты");
  await expect.poll(async () => (await index())?.historyVersion).toBe(2);
  expect((await index()).exerciseRefs[0].sourceTextId).toBe(
    exercise.sourceTextId,
  );
});
