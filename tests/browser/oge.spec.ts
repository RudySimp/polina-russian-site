import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import activities from "../../apps/showcase/src/oge/activities.json" with { type: "json" };
import type {
  PracticeSession,
  InteractiveActivity,
} from "../../apps/showcase/src/oge/model";
async function currentWork(page: Page): Promise<PracticeSession> {
  // The immutable assignment and debounced mutable draft are persisted separately.
  await expect(
    page.getByRole("status").filter({ hasText: "Черновик сохранён" }),
  ).toBeVisible();
  return page.evaluate(() => {
    const id = new URLSearchParams(location.search).get("id");
    const snapshot = JSON.parse(
      localStorage.getItem("polina-oge-work-v1:" + id)!,
    );
    const state = JSON.parse(
      localStorage.getItem("polina-oge-state-v2:" + id) ?? "null",
    );
    return { ...snapshot, ...(state?.state ?? {}) };
  });
}
async function finish(page: Page) {
  await page
    .getByRole("button", { name: "Завершить работу", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Подтвердить завершение", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("Результаты и разбор");
}
async function answerCurrent(page: Page, answer: string) {
  const work = await currentWork(page),
    item = work.items[work.activeIndex];
  if (item.kind !== "exercise") throw Error("Ожидалось тестовое задание");
  if (item.exercise.input === "matching") {
    for (const [n, value] of [...answer].entries())
      await page
        .locator("#work-question fieldset select")
        .nth(n)
        .selectOption(value);
  } else
    await page
      .locator("#work-question")
      .getByLabel("Ваш ответ", { exact: true })
      .fill(answer);
}

test("ОГЭ: пять направлений, теория по линии и прямое задание с общим текстом", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("oge/");
  await expect(page.locator("h1")).toHaveText("Подготовка к ОГЭ");
  await expect(page.locator(".oge-directions a")).toHaveCount(5);
  await expect(page.locator("#bank .oge-lines a")).toHaveCount(13);
  await page.locator("#bank .oge-lines a").filter({ hasText: "№ 10" }).click();
  await expect(page.locator(".results-count")).toHaveText(
    "Найдено заданий: 25",
  );
  await page.locator(".exercise-card").first().click();
  await expect(page.locator(".oge-source")).toBeVisible();
  await expect(page.locator(".oge-source")).toContainText("(1)");
  await page
    .getByRole("link", { name: "Вернуться к подборке", exact: true })
    .click();
  await expect(page.locator(".results-count")).toHaveText(
    "Найдено заданий: 25",
  );
  await page.goto("oge/theory/?line=11");
  await expect(page.locator(".course-topic")).toHaveCount(1);
  await page
    .getByRole("link", { name: "Полная справочная глава", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("Средства выразительности");
  await page
    .getByRole("link", { name: "Вернуться к каталогу", exact: true })
    .click();
  await expect(page.getByLabel("Номер ОГЭ")).toHaveValue("11");
  expect(errors).toEqual([]);
});

test("Банк №4: ответы на странице, формат и порядок АБВ, независимые формы", async ({
  page,
}) => {
  await page.goto("oge/bank/4/?view=expanded");
  const card = page.locator(".oge-inline").first();
  await card
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect(card.getByRole("alert")).toBeVisible();
  const first = await page.evaluate(async () => {
    const response = await fetch(location.href);
    return response.ok;
  });
  expect(first).toBe(true);
  // Each task exposes three rules and independent selects, with no duplicated input ids.
  await expect(card.locator("fieldset select")).toHaveCount(3);
  const ids = await page
    .locator("[id]")
    .evaluateAll((nodes) => nodes.map((n) => n.id));
  expect(new Set(ids).size).toBe(ids.length);
  const selects = card.locator("fieldset select");
  for (const [n, value] of ["1", "2", "3"].entries())
    await selects.nth(n).selectOption(value);
  await card
    .getByRole("button", { name: "Проверить ответ", exact: true })
    .click();
  await expect(card.locator(".feedback")).toContainText("Эталон:");
  await expect(
    card.getByRole("button", { name: "Проверить ответ", exact: true }),
  ).toBeDisabled();
  await page
    .locator(".oge-inline")
    .nth(1)
    .locator("fieldset select")
    .first()
    .selectOption("5");
  await expect(selects.first()).toHaveValue("1");
});

test("Подборка: контроль в конце, сохранение, формат отдельно, повторение только ошибок", async ({
  page,
}) => {
  await page.goto("oge/bank/5/");
  await page.getByText("Размер, режим и отбор", { exact: true }).click();
  await page
    .getByRole("combobox", { name: "Количество", exact: true })
    .selectOption("5");
  await page.getByLabel("Режим проверки").selectOption("control");
  await page
    .getByRole("button", { name: "Начать подборку", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("Подборка: задание № 5");
  const initial = await currentWork(page);
  for (let n = 0; n < 5; n++) {
    const item = initial.items[n];
    if (item.kind !== "exercise") throw Error("Нет задания");
    const positions = [
      ...new Set(
        [...(item.exercise.text ?? "").matchAll(/\((\d+)\)/gu)].map(
          (match) => match[1],
        ),
      ),
    ];
    const wrong = positions.find(
      (value) => !item.exercise.answers.includes(value),
    );
    if (!wrong)
      throw Error("В условии нет доступного неправильного одиночного ответа");
    if (n !== 3)
      await answerCurrent(
        page,
        n === 0 || n === 4 ? item.exercise.answers[0] : n === 1 ? wrong : "1,2",
      );
    await expect(page.locator("#work-question .feedback")).toHaveCount(0);
    if (n < 4)
      await page
        .getByRole("button", { name: "Следующее задание", exact: true })
        .click();
  }
  const url = page.url();
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Подборка: задание № 5");
  expect((await currentWork(page)).startedAt).toBe(initial.startedAt);
  await finish(page);
  await expect(
    page.getByText("Автоматически проверенная часть:", { exact: false }),
  ).toContainText("2 из 5");
  await expect(page.locator("main")).toContainText("Ошибок формата: 1");
  await expect(page.locator("main")).toContainText(
    "пропущенных тестовых заданий",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("polina-showcase-attempts-v1")!).length,
    ),
  ).toBe(3);
  await page.reload();
  await expect(page.locator("h1")).toHaveText("Результаты и разбор");
  await page
    .getByRole("button", { name: "Повторить только ошибки", exact: true })
    .click();
  await expect(page.locator("h1")).toContainText("Повторение ошибок");
  const repeat = await currentWork(page);
  expect(repeat.items).toHaveLength(1);
  expect(repeat.answers).toEqual({});
  expect(page.url()).not.toBe(url);
  await page.goto("oge/results/");
  await expect(page.locator(".oge-work-list article")).toHaveCount(2);
});

test("Полный вариант: действительное аудио, 13 заданий, черновик сочинения и все 11 результатов", async ({
  page,
}) => {
  test.setTimeout(120000);
  await page.goto("oge/variants/1/");
  await page
    .getByRole("button", { name: "Начать новую попытку", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText(/вариант/iu);
  const initial = await currentWork(page);
  expect(initial.items).toHaveLength(13);
  expect(initial.durationMinutes).toBe(235);
  await expect(
    page.getByText("Текст и микротемы для разбора", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Слушать текст", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Пауза", exact: true }),
  ).toBeVisible();
  await page.locator("audio").evaluate((element: HTMLAudioElement) => {
    element.currentTime = element.duration - 0.08;
  });
  await expect(
    page.getByRole("status").filter({ hasText: "Завершено прослушиваний" }),
  ).toContainText("1 из 2");
  await expect(
    page.getByRole("button", { name: "Слушать текст", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Ваш письменный ответ", exact: true })
    .fill("Мой черновик изложения.");
  await page
    .getByRole("navigation", { name: "Задания работы" })
    .getByRole("button", { name: /^№ 13 / })
    .click();
  await page.getByLabel("Выберите один вопрос").selectOption("13.2");
  const essay =
    "Герой меняет своё отношение к поступкам. " +
    Array(15).fill("Это важный пример из прочитанного текста.").join(" ");
  await page
    .getByRole("textbox", { name: "Ваш письменный ответ", exact: true })
    .fill(essay);
  await expect(page.locator("#work-question")).toContainText("Слов:");
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Ваш письменный ответ", exact: true }),
  ).toHaveValue(essay);
  await expect(page.getByLabel("Выберите один вопрос")).toHaveValue("13.2");
  expect((await currentWork(page)).startedAt).toBe(initial.startedAt);
  for (let line = 2; line <= 12; line++) {
    await page
      .getByRole("navigation", { name: "Задания работы" })
      .getByRole("button", { name: new RegExp(`^№ ${line} `) })
      .click();
    const work = await currentWork(page),
      item = work.items[work.activeIndex];
    if (item.kind !== "exercise") throw Error("Нет задания");
    await answerCurrent(page, item.exercise.answers[0]);
  }
  await finish(page);
  await expect(page.locator("main")).toContainText(
    "Автоматически проверенная часть: 11 из 11",
  );
  await expect(page.locator(".oge-written-answer").last()).toHaveText(essay);
  await expect(page.locator("main")).toContainText(
    "меньше 70 слов — 1; требует проверки — 1",
  );
  await expect(page.locator("main")).toContainText(
    "Общий официальный балл и школьная отметка не вычисляются",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("polina-showcase-attempts-v1")!).length,
    ),
  ).toBe(11);
});

test("Генератор: сохранённый состав, независимая новая работа и честная нехватка ошибок", async ({
  page,
}) => {
  await page.goto("oge/generator/");
  await page.getByLabel("Тип работы").selectOption("test");
  await page
    .getByRole("button", { name: "Сформировать вариант", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("Случайная тестовая часть ОГЭ");
  const a = await currentWork(page);
  expect(a.items).toHaveLength(11);
  await page.reload();
  await expect(page.locator("h1")).toHaveText(a.title);
  expect((await currentWork(page)).items).toEqual(a.items);
  await page.goto("oge/generator/");
  await page.getByLabel("Тип работы").selectOption("test");
  await page
    .getByRole("button", { name: "Сформировать вариант", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText(a.title);
  const b = await currentWork(page);
  expect(a.id).not.toBe(b.id);
  await page.goto("oge/generator/");
  await page
    .getByRole("combobox", { name: "Отбор", exact: true })
    .selectOption("errors");
  await page
    .getByRole("button", { name: "Сформировать вариант", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Не хватает");
  await page.goto("oge/generator/?mode=thematic");
  await expect(page.getByLabel("Тип работы")).toHaveValue("thematic");
  const quick = page.getByRole("button", { name: "5 заданий", exact: true });
  await expect(quick).toBeVisible();
  await quick.click();
  await expect(page.locator("h1")).toHaveText("Смешанная тренировка ОГЭ");
  expect((await currentWork(page)).items).toHaveLength(5);
});

test("Семь тренажёров: ошибка, исправление и все ситуации каждой механики", async ({
  page,
}) => {
  test.setTimeout(180000);
  for (const activity of activities as InteractiveActivity[]) {
    await page.goto(`oge/games/${activity.id}/`);
    await expect(page.locator("h1")).toHaveText(activity.title);
    const game = page.locator(".oge-game");
    await game
      .getByRole("button", { name: "Проверить действие", exact: true })
      .click();
    await expect(game.locator(".feedback")).toContainText("Исправьте");
    for (const [index, situation] of activity.situations.entries()) {
      if (activity.kind === "foundation") {
        for (const role of ["subject", "predicate"]) {
          await game
            .getByRole("button", {
              name: role === "subject" ? "Подлежащее" : "Сказуемое",
              exact: true,
            })
            .click();
          const value = situation.fields.find((f) => f.id === role)!
            .expected[0];
          for (const n of value ? value.split(",") : [])
            await game
              .locator(".word-buttons button")
              .nth(Number(n) - 1)
              .click();
        }
      } else if (activity.kind === "punctuation") {
        for (const field of situation.fields)
          if (field.expected[0])
            await game
              .locator(".oge-punctuation select")
              .nth(Number(field.id.split("-")[1]) - 1)
              .selectOption(field.expected[0]);
      } else if (activity.kind === "correction") {
        await game
          .locator(".word-buttons button")
          .nth(Number(situation.fields[0].expected[0]) - 1)
          .click();
        await game
          .getByLabel("Исправленная форма")
          .fill(situation.fields[1].expected[0]);
      } else if (activity.kind === "compression") {
        for (const n of situation.fields[0].expected[0].split(","))
          await game
            .locator(".oge-compression button")
            .nth(Number(n) - 1)
            .click();
        await game
          .getByLabel("Ваше сжатие", { exact: true })
          .fill("Свободный пересказ для самостоятельного анализа.");
      } else
        for (const field of situation.fields) {
          if (field.options)
            await game
              .getByRole("combobox", { name: field.label, exact: true })
              .selectOption(field.expected[0]);
          else
            await game
              .getByLabel(field.label, { exact: true })
              .fill(field.expected[0]);
        }
      await game
        .getByRole("button", { name: "Проверить действие", exact: true })
        .click();
      if (activity.kind === "compression") {
        await expect(game.locator(".feedback")).toContainText(
          "Основная информация выбрана",
        );
        await expect(game.locator(".feedback")).toContainText(
          "Черновик написан",
        );
        await expect(game.locator(".feedback")).toContainText(
          "автоматически не оценены",
        );
        await expect(game.locator(".feedback")).not.toContainText(
          "Действие выполнено верно",
        );
      } else
        await expect(game.locator(".feedback")).toContainText(
          "Действие выполнено верно",
        );
      await expect(game.locator(".feedback")).toContainText(
        situation.explanation,
      );
      if (index < activity.situations.length - 1)
        await page
          .getByRole("button", { name: "Следующая ситуация", exact: true })
          .click();
    }
  }
  await page.goto("oge/results/");
  await expect(page.locator("main")).toContainText(
    "Проверенных действий: " +
      activities.reduce(
        (sum, activity) => sum + activity.situations.length + 1,
        0,
      ),
  );
});

test("ОГЭ: доступность каталога, развёрнутого банка, генератора, тренажёров и письменной формы", async ({
  page,
}) => {
  test.setTimeout(180000);
  for (const path of [
    "oge/",
    "oge/theory/",
    "oge/bank/4/?view=expanded",
    "oge/variants/",
    "oge/generator/",
    "oge/games/foundation/",
    "oge/results/",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const scan = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      scan.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => n.html),
      })),
      path,
    ).toEqual([]);
  }
  await page.goto("oge/bank/13/");
  await page
    .getByRole("button", { name: "Открыть письменное задание", exact: true })
    .first()
    .click();
  await expect(page.getByLabel("Ваш письменный ответ")).toBeVisible();
  const scan = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(scan.violations.map((v) => v.id)).toEqual([]);
});
