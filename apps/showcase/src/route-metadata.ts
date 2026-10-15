import { courseModules } from "./content/course.ts";
import { exerciseIndex, topics } from "./content/catalog.ts";
import { taskLines } from "./oge/specification.ts";

export type PageMetadata = { title: string; description: string };
const named: Record<string, [string, string]> = {
  "/": [
    "Русский язык в своём темпе",
    "Понятная теория русского языка, примеры и самостоятельная практика ОГЭ и ЕГЭ на сайте Полины.",
  ],
  "/oge/": [
    "Русский язык — ОГЭ",
    "Теория, банк заданий, готовые варианты, генератор и тематические тренажёры письменного ОГЭ.",
  ],
  "/oge/theory/": [
    "Теория ОГЭ по номеру и теме",
    "Правила русского языка, условия применения, примеры и практика. Поиск внутри параграфов.",
  ],
  "/oge/bank/": [
    "Банк заданий ОГЭ",
    "Выберите номер, тему и учебный уровень. Решайте подборку и разбирайте конкретные ошибки.",
  ],
  "/oge/variants/": [
    "Готовые учебные варианты ОГЭ",
    "Пять фиксированных учебных вариантов с аудиоизложением, заданиями 2–12 и сочинением.",
  ],
  "/oge/generator/": [
    "Генератор варианта ОГЭ",
    "Полная работа, тестовая часть или тематическая подборка из проверенной учебной редакции.",
  ],
  "/oge/games/": [
    "Тематические тренажёры ОГЭ",
    "Выделение основы, пунктуация, исправление формы, словосочетание, сопоставление, орфография и сжатие.",
  ],
  "/oge/results/": [
    "Сохранённые работы ОГЭ",
    "Продолжайте черновики, смотрите результаты и переносите сохранённые работы резервными файлами.",
  ],
  "/oge/practice/session/": [
    "Работа ОГЭ",
    "Сохранённое условие, ответы и черновики учебной или контрольной работы в этом браузере.",
  ],
  "/theory/": [
    "Учебник русского языка",
    "Правила, примеры и учебные действия по темам русского языка.",
  ],
  "/practice/": [
    "Практика русского языка",
    "Самостоятельные задания с проверкой ответа и объяснением.",
  ],
  "/ege/": ["Русский язык — ЕГЭ", "Учебные материалы русского языка для ЕГЭ."],
  "/progress/": [
    "Мой учебный прогресс",
    "Результаты самостоятельной практики, повторение ошибок и сохранённые работы в этом браузере.",
  ],
  "/sources/": [
    "Источники учебных материалов",
    "Происхождение учебных материалов, редакционные статусы и основания использования.",
  ],
  "/about/": [
    "О сайте Полины",
    "Как устроены теория, самостоятельная практика и разбор ошибок.",
  ],
};
const gameTitles: Record<string, string> = {
  foundation: "Грамматическая основа",
  punctuation: "Пунктуация",
  correction: "Исправление формы",
  phrase: "Словосочетание",
  matching: "Правило и предложение",
  spelling: "Орфографический конструктор",
  compression: "Сжатие текста",
};
const aliases: Record<string, string> = {
  "oge-syntax": "oge-syntax-1",
  "ege-punctuation": "ege-punctuation-1",
  "ege-stress": "ege-stress-1",
};
export function routeMetadata(pathname: string, search = ""): PageMetadata {
  const clean = pathname.replace(/^\/polina-russian-site(?=\/|$)/, "") || "/";
  const path = clean.endsWith("/") ? clean : clean + "/";
  let [title, description] = named[path] ?? [
    "Страница не найдена",
    "Выберите раздел русского языка на сайте Полины.",
  ];
  const bank = path.match(/^\/oge\/bank\/(\d+)\/$/);
  const selectedLine = bank
    ? Number(bank[1])
    : path === "/oge/bank/"
      ? Number(new URLSearchParams(search).get("line"))
      : 0;
  if (selectedLine >= 1 && selectedLine <= 13) {
    const line = taskLines.find((l) => l.number === selectedLine)!;
    title = "ОГЭ № " + selectedLine + " — " + line.title;
    description =
      "Самостоятельная практика: " +
      line.title +
      ". Задания, ответы и разбор ошибок.";
  } else if (path.startsWith("/oge/theory/modules/")) {
    const entry = courseModules.find((m) => m.id === path.split("/")[4]);
    if (entry) {
      title = entry.title + " — учебный модуль ОГЭ";
      description = entry.outcome;
    }
  } else if (path.startsWith("/theory/") && path !== "/theory/") {
    const topic = topics.find((t) => t.slug === path.split("/")[2]);
    if (topic) {
      title = topic.title + " — теория русского языка";
      description = topic.description;
    }
  } else if (path.startsWith("/practice/") && path !== "/practice/") {
    const slug = path.split("/")[2];
    const exercise = exerciseIndex.find(
      (e) => e.slug === (aliases[slug] ?? slug),
    );
    if (exercise) {
      const number = exercise.id.match(/-(\d+)$/)?.[1];
      title =
        exercise.title +
        " · " +
        (exercise.exam === "OGE" ? "ОГЭ" : "ЕГЭ") +
        (exercise.taskLine ? " № " + exercise.taskLine : "") +
        (number ? " · пример " + number : "");
      description =
        exercise.topicTitle +
        ": самостоятельное задание с проверкой и объяснением.";
    }
  } else if (/^\/oge\/variants\/[1-5]\/$/.test(path)) {
    title = "Учебный вариант ОГЭ № " + path.split("/")[3];
    description =
      "Аудиоизложение, согласованные задания 2–12 и сочинение. Состав варианта фиксирован.";
  } else if (path.startsWith("/oge/games/") && path !== "/oge/games/") {
    const game = gameTitles[path.split("/")[3]];
    if (game) {
      title = game + " — тренажёр ОГЭ";
      description =
        "Самостоятельные учебные действия, объяснение ошибки и новые случаи: " +
        game +
        ".";
    }
  }
  return { title: title + " | Сайт Полины", description };
}
export function pageHtml(html: string, metadata: PageMetadata) {
  const escape = (value: string) =>
    value
      .replaceAll("&", "&amp;")
      .replaceAll('"', "&quot;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  return html
    .replace(
      /<title>[^<]*<\/title>/,
      "<title>" + escape(metadata.title) + "</title>",
    )
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/?>/,
      '<meta name="description" content="' +
        escape(metadata.description) +
        '" />',
    );
}
