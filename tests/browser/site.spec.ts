import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
test('Главная, экспортированные страницы и ассеты', async ({ page }) => {
  const failed: string[] = [];
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Русский становится понятным.');
  await page.getByRole('link', { name: 'Открыть учебник' }).click();
  await expect(page.getByRole('heading', { name: 'Сначала поймём правило' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Сначала поймём правило' })).toBeVisible();
  await page.getByPlaceholder('Найти тему или правило').fill('неизвестная тема');
  await expect(page.getByRole('heading', { name: 'Такой темы пока нет' })).toBeVisible();
  expect(failed).toEqual([]); expect(errors).toEqual([]);
});
test('Теория: ошибка, верная запятая и смена союза', async ({ page }) => {
  await page.goto('theory/odnorodnye/');
  await page.getByRole('button', { name: 'Одиночное «и»' }).click();
  await page.getByRole('button', { name: 'Проверить расстановку' }).click();
  await expect(page.getByRole('heading', { name: 'Давайте посмотрим на способ связи' })).toBeVisible();
  await page.getByRole('button', { name: 'Запятая после «книги»' }).click();
  await page.getByRole('button', { name: 'Проверить расстановку' }).click();
  await expect(page.getByRole('heading', { name: 'Верно: вы увидели связь!' })).toBeVisible();
  await page.getByRole('button', { name: 'Повторяющееся «и»' }).click();
  await page.getByRole('button', { name: 'Запятая после «и книги»' }).click();
  await page.getByRole('button', { name: 'Проверить расстановку' }).click();
  await expect(page.getByRole('heading', { name: 'Верно: вы увидели связь!' })).toBeVisible();
});
test('НЕ: неверный выбор получает разбор; ударение работает', async ({ page }) => {
  await page.goto('theory/ne-prilagatelnye/');
  await page.getByRole('button', { name: 'Раздельно', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Проверьте, какой смысл мы выражаем' })).toBeVisible();
  await page.getByRole('button', { name: 'Слитно', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Верно!', exact: true })).toBeVisible();
  await page.goto('theory/udarenie/');
  await page.getByRole('button', { name: 'тортЫ', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Нормативное ударение — тОрты' })).toBeVisible();
});
test('Практика: формат, ошибка, похожее задание и сохранение прогресса', async ({ page }) => {
  await page.goto('practice/ege-punctuation/');
  await page.getByLabel('Ваш ответ').fill('1,3');
  await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('heading', { name: 'Уточните формат ответа' })).toBeVisible();
  await page.getByLabel('Ваш ответ').fill('2');
  await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('heading', { name: 'Разберём ответ вместе' })).toBeVisible();
  await expect(page.getByText('Вариант 2: выбран лишний вариант.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Похожее задание' }).click();
  await page.getByLabel('Ваш ответ').fill('31');
  await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('heading', { name: 'Повторение получилось!' })).toBeVisible();
  await page.goto('progress/');
  await expect(page.getByText('1 верных из 2 попыток', { exact: false })).toBeVisible();
  await page.reload();
  await expect(page.getByText('1 верных из 2 попыток', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Очистить локальную историю' }).click();
  await page.getByRole('button', { name: 'Удалить историю' }).click();
  await expect(page.getByRole('heading', { name: 'Здесь появятся ваши первые результаты' })).toBeVisible();
});
test('ОГЭ и ЕГЭ: раздельные направления и проверка ответа', async ({ page }) => {
  await page.goto('oge/');
  await expect(page.getByRole('heading', { name: 'Готовимся к ОГЭ осознанно' })).toBeVisible();
  await page.getByRole('link', { name: /Найти грамматическую основу/ }).click();
  await page.getByLabel('Ваш ответ').fill('1235');
  await page.getByRole('button', { name: 'Проверить ответ' }).click();
  await expect(page.getByRole('heading', { name: 'Верно! Правило работает.' })).toBeVisible();
  await page.goto('ege/');
  await expect(page.getByRole('heading', { name: 'Готовимся к ЕГЭ осознанно' })).toBeVisible();
});
test('Клавиатура, мобильная ширина и честная маркировка', async ({ page }) => {
  await page.goto('');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Перейти к содержанию' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('about/');
  await expect(page.getByRole('heading', { name: 'Что означает демонстрационный режим' })).toBeVisible();
  await page.goto('sources/');
  await expect(page.getByText('2027: предварительная модель', { exact: true })).toBeVisible();
});
test('Доступность главной и формы ответа', async ({ page }) => {
  for (const path of ['', 'practice/ege-punctuation/']) {
    await page.goto(path);
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    expect(result.violations.map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ html: n.html, failure: n.failureSummary })) }))).toEqual([]);
  }
});
