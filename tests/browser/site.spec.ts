import { lessons } from "../../apps/showcase/src/content/library";
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { exercises, topics } from "../../apps/showcase/src/content/registry";

test("Главная, прямые маршруты, поиск и возврат к фильтрам", async ({
  page,
}) => {
  const failed: string[] = [],
    errors: string[] = [];
  page.on("response", (r) => {
    if (r.status() >= 400) failed.push(r.url());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("");
  await expect(page.locator("h1")).toHaveText(
    /Русский язык\s*становится понятнее\./,
  );
  await page
    .getByRole("link", { name: "Открыть учебник", exact: true })
    .click();
  await page.getByPlaceholder("Найти тему или правило").fill("не");
  await expect(page.locator(".results-count")).toHaveText("Найдено тем: 1");
  await page
    .getByRole("combobox", { name: "Экзамен", exact: true })
    .selectOption("EGE");
  await page.reload();
  await expect(page.getByPlaceholder("Найти тему или правило")).toHaveValue(
    "не",
  );
  await page.locator(".topic-card").first().click();
  await expect(page.locator("h1")).toHaveText("НЕ с прилагательными");
  await expect(
    page.getByRole("link", { name: "Начать практику ЕГЭ" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Вернуться к каталогу", exact: true })
    .click();
  await expect(page.getByPlaceholder("Найти тему или правило")).toHaveValue(
    "не",
  );
  await expect(
    page.getByRole("combobox", { name: "Экзамен", exact: true }),
  ).toHaveValue("EGE");
  await page
    .getByPlaceholder("Найти тему или правило")
    .fill("неизвестная тема");
  await expect(
    page.getByRole("heading", { name: "Такой темы пока нет" }),
  ).toBeVisible();
  await page.goto("practice/?exam=OGE&topic=formy-slov");
  await expect(page.locator(".results-count")).toHaveText(
    "Найдено заданий: 10",
  );
  await page.locator(".exercise-card").first().click();
  await page.reload();
  await expect(page.locator("h1")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Вернуться к правилу" }),
  ).toHaveAttribute("href", /formy-slov\/\?exam=OGE/);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test("Фильтры банка, страницы и возврат из задания", async ({ page }) => {
  await page.goto("practice/?exam=EGE");
  await expect(page.locator(".results-count")).toHaveText(
    "Найдено заданий: 30",
  );
  await page.getByRole("button", { name: "Следующая", exact: true }).click();
  await page.reload();
  await expect(
    page.getByText("Страница 2 из 3", { exact: true }),
  ).toBeVisible();
  await page.locator(".exercise-card").first().click();
  await page.getByRole("link", { name: "Вернуться к подборке" }).click();
  await expect(
    page.getByText("Страница 2 из 3", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("combobox", { name: "Тема", exact: true })
    .selectOption("udarenie");
  await expect(page.locator(".results-count")).toHaveText(
    "Найдено заданий: 10",
  );
  await page
    .getByRole("combobox", { name: "Экзамен", exact: true })
    .selectOption("OGE");
  await expect(page.locator(".results-count")).toHaveText(
    "Найдено заданий: 50",
  );
  await expect(
    page.getByRole("combobox", { name: "Тема", exact: true }),
  ).toHaveValue("");
});

test("Шесть учебных механик: неверный ответ, объяснение и смена примера", async ({
  page,
}) => {
  for (const lesson of lessons) {
    const topic = topics.find((t) => t.id === lesson.topicId)!;
    await page.goto(`theory/${topic.slug}/`);
    await expect(page.locator("h1")).toHaveText(topic.title);
    for (const block of lesson.sections.flatMap((s) => s.blocks)) {
      if (block.type !== "interactive") continue;
      const lab = page.locator(".interactive-card").filter({
        has: page.getByRole("heading", {
          name: block.data.title,
          exact: true,
        }),
      });
      await lab.getByRole("button", { name: "Проверить", exact: true }).click();
      await expect(
        lab.getByRole("heading", { name: "Посмотрим на правило ещё раз" }),
      ).toBeVisible();
      for (const example of block.data.examples) {
        await lab
          .getByRole("button", { name: example.label, exact: true })
          .click();
        for (const n of example.expected) {
          if (block.data.kind === "punctuation")
            await lab
              .locator(".comma-slot")
              .nth(n - 1)
              .click();
          else if (block.data.kind === "foundation")
            await lab
              .locator(".word-buttons button")
              .nth(n - 1)
              .click();
          else if (block.data.kind === "stress")
            await lab
              .getByRole("button", { name: new RegExp(`буква ${n}$`) })
              .click();
          else
            await lab
              .getByRole("radio")
              .nth(n - 1)
              .check();
        }
        await lab
          .getByRole("button", { name: "Проверить", exact: true })
          .click();
        await expect(
          lab.getByRole("heading", { name: "Верно — разберём почему" }),
        ).toBeVisible();
        await expect(lab.getByRole("status")).toContainText(
          example.explanation,
        );
      }
    }
    const example = page.locator(".example-block").first();
    await example.getByRole("button", { name: "Открыть первый шаг" }).click();
    await expect(example.locator("ol li")).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: "Содержание урока" }),
    ).toBeVisible();
    const checkpoint = page.locator(".checkpoint");
    await checkpoint.getByRole("button", { name: "Проверить себя" }).click();
    await expect(checkpoint.getByRole("status")).toContainText(
      "Посмотрите на объяснение",
    );
  }
});

test("Практика: формат, лишний вариант, повторение, локальный прогресс и отмена очистки", async ({
  page,
}) => {
  await page.goto("practice/ege-punctuation/");
  await page.getByLabel("Ваш ответ", { exact: true }).fill("1,3");
  await page.getByRole("button", { name: "Проверить ответ" }).click();
  await expect(
    page.getByRole("heading", { name: "Уточните формат ответа" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("polina-showcase-attempts-v1") || "[]")
          .length,
    ),
  ).toBe(0);
  await page.getByLabel("Ваш ответ", { exact: true }).fill("2");
  await page.getByRole("button", { name: "Проверить ответ" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Вариант 2: выбран лишний вариант.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Вариант 1: верный вариант пропущен.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Проверить ответ" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Похожее задание" }).click();
  await page.getByLabel("Ваш ответ", { exact: true }).fill("31");
  await page.getByRole("button", { name: "Проверить ответ" }).click();
  await expect(
    page.getByRole("heading", { name: "Повторение получилось!" }),
  ).toBeVisible();
  await page.goto("progress/");
  await page.getByRole("button", { name: "ЕГЭ", exact: true }).click();
  await expect(
    page.getByText("1 верных из 2 попыток · ЕГЭ.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Данных пока недостаточно для вывода об освоении темы"),
  ).toBeVisible();
  await expect(page.locator(".exercise-card")).toHaveCount(1);
  await expect(page.locator(".exercise-card")).toContainText("ЕГЭ");
  await page.reload();
  await page.getByRole("button", { name: "ЕГЭ", exact: true }).click();
  await expect(
    page.getByText("1 верных из 2 попыток · ЕГЭ.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Очистить локальную историю" })
    .click();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(
    page.getByText("1 верных из 2 попыток · ЕГЭ.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Очистить локальную историю" })
    .click();
  await page.getByRole("button", { name: "Удалить историю" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Здесь появятся ваши первые результаты",
    }),
  ).toBeVisible();
});

test("Полная подборка из десяти задач завершается без цикла", async ({
  page,
}) => {
  await page.goto("practice/ege-punctuation-1/");
  const seen = new Set<string>();
  for (let index = 0; index < 10; index++) {
    const slug = new URL(page.url()).pathname
      .split("/")
      .filter(Boolean)
      .at(-1)!;
    const exercise = exercises.find((e) => e.slug === slug)!;
    expect(exercise.skillId).toBe("EGE:punctuation.homogeneous");
    expect(seen.has(exercise.id)).toBe(false);
    seen.add(exercise.id);
    await page
      .getByLabel("Ваш ответ", { exact: true })
      .fill(exercise.answers[0]);
    await page.getByRole("button", { name: "Проверить ответ" }).click();
    if (index < 9)
      await page.getByRole("button", { name: "Следующее упражнение" }).click();
  }
  await expect(
    page.getByRole("heading", { name: "Подборка завершена" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Следующее упражнение" }),
  ).toHaveCount(0);
  expect(seen.size).toBe(10);
});

test("Все модули: импортированные ответы, словосочетания и учебный выбор", async ({
  page,
}) => {
  for (const topic of topics.filter((t) => t.status === "published")) {
    const exercise =
      exercises.find(
        (e) =>
          e.topicId === topic.id &&
          e.provenance.method === "local-original-import",
      ) ?? exercises.find((e) => e.topicId === topic.id)!;
    await page.goto(`practice/${exercise.slug}/`);
    if (exercise.input === "single")
      await page
        .getByRole("radio")
        .nth(Number(exercise.answers[0]) - 1)
        .check();
    else
      await page
        .getByLabel("Ваш ответ", { exact: true })
        .fill(exercise.answers[0]);
    await page.getByRole("button", { name: "Проверить ответ" }).click();
    await expect(
      page.getByRole("heading", { name: "Верно! Правило работает." }),
    ).toBeVisible();
    await expect(page.locator(".answer-feedback")).toContainText(
      exercise.explanation.split("\n\n")[0],
    );
    await expect(
      page.getByRole("link", { name: "Разобрать правило" }),
    ).toHaveAttribute(
      "href",
      new RegExp(`${topic.slug}/\\?exam=${exercise.exam}`),
    );
  }
});

test("ОГЭ и ЕГЭ: отдельные направления и честные статусы", async ({ page }) => {
  for (const exam of ["ОГЭ", "ЕГЭ"]) {
    await page.goto(exam === "ОГЭ" ? "oge/" : "ege/");
    await expect(page.locator("h1")).toHaveText(
      `Готовимся к ${exam} осознанно`,
    );
  }
  await page.goto("theory/ne-prilagatelnye/?exam=OGE");
  await expect(
    page.getByRole("link", { name: "Другие задания ОГЭ" }),
  ).toHaveAttribute("href", /exam=OGE/);
  await page.goto("sources/");
  await expect(
    page.getByText("2027: предварительная модель", { exact: true }),
  ).toBeVisible();
  await page.goto("about/");
  await expect(
    page.getByRole("heading", {
      name: "Что означает демонстрационная редакция",
    }),
  ).toBeVisible();
});

test("Клавиатура и мобильное модальное меню", async ({ page, isMobile }) => {
  await page.goto("");
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Перейти к содержанию" }),
  ).toBeFocused();
  if (!isMobile) return;
  const trigger = page.getByRole("button", { name: "Открыть меню" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Меню сайта" });
  await expect(dialog).toBeVisible();
  for (let n = 0; n < 15; n++) {
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("link", { name: "Учебник", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Сначала поймём правило");
});

test("Доступность основных страниц, урока, формы и обратной связи", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(120000);
  for (const path of [
    "",
    "theory/",
    "practice/",
    "theory/osnova/",
    "practice/ege-punctuation/",
    "progress/",
  ]) {
    await page.goto(path);
    if (path === "practice/ege-punctuation/") {
      await page.getByLabel("Ваш ответ", { exact: true }).fill("2");
      await page.getByRole("button", { name: "Проверить ответ" }).click();
    }
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      result.violations.map((v) => ({
        id: v.id,
        nodes: v.nodes.map((n) => ({
          html: n.html,
          failure: n.failureSummary,
        })),
      })),
    ).toEqual([]);
  }
  if (isMobile) {
    await page.getByRole("button", { name: "Открыть меню" }).click();
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(result.violations).toEqual([]);
  }
});
