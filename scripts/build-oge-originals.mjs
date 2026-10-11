import fs from "node:fs/promises";
import assert from "node:assert/strict";
const directory = "apps/showcase/src";
const read = async (path) => JSON.parse(await fs.readFile(path, "utf8"));
const spec = await read(`${directory}/oge/specification.json`);
const originals = [
  ...(await read("content/oge-original-reading.json")),
  ...(await read("content/oge-original-reading-extra.json")),
];
const syntax = await read("content/oge-original-syntax.json");
const dated = "2026-10-11";
const rights =
  "Оригинальные учебные условия, тексты и объяснения созданы для этого проекта по поручению владельца. Сторонние литературные произведения не воспроизводятся; авторство Полине не приписывается.";
const source = {
  sourceType: "original_demo",
  sourceUrl: "",
  sourceTitle: "Оригинальные учебные материалы проекта",
  author: "Редакция проекта; окончательное утверждение Полиной ожидается",
  rightsStatus: "owned",
  licenseNote: rights,
  verifiedAt: dated,
  examYear: 2027,
  editorialStatus: "needs_review",
};
const provenance = {
  sourceId: "project-oge-2027-originals",
  method: "project-original",
  rightsBasis: rights,
  reviewNote:
    "Ключи сопоставлены с конкретными предложениями и условиями; объяснения раскрывают основание каждого ответа. Методическое утверждение преподавателем ожидается.",
  reviewedAt: dated,
  teacherApproval: "pending",
};
const groups = new Map();
function add(
  line,
  topicId,
  topicTitle,
  title,
  prompt,
  options,
  answer,
  details,
  textId,
  extra = {},
) {
  const config = spec.lines.find((l) => l.number === line),
    kind = config.response;
  const id = `oge-${topicId}-${textId}`;
  const answers = [answer];
  if (kind === "short_text" && answer.includes(" "))
    answers.push(answer.replaceAll(" ", ""));
  const item = {
    id,
    slug: id,
    revision: 1,
    title,
    prompt,
    sourceTextId: textId,
    topicId,
    topicSlug: topicId,
    topicTitle,
    exam: "OGE",
    responseKind: kind,
    answers,
    maxScore: 1,
    policy: {
      version: 1,
      trim: true,
      caseSensitive: false,
      collapseSpaces: kind === "short_text",
      allowYoAsE: [8, 9, 12].includes(line),
      orderMatters: config.orderMatters,
      allowDigitSeparators: false,
      minLength: config.minLength,
      maxLength: config.maxLength,
    },
    source,
    skillId: `OGE:${{ 2: "syntax.foundation", 3: "syntax.analysis", 10: "text.comprehension", 11: "text.expression", 12: "lexis.analysis" }[line]}`,
    misconceptionId: `line-${line}-analysis`,
    instruction:
      kind === "short_text"
        ? "Выпишите слово или выражение в форме из текста. Ё можно заменить на Е."
        : "Запишите номера подряд, без пробелов. Порядок цифр не важен.",
    options,
    optionExplanations: options.length ? details : [],
    explanation: details.join("\n\n"),
    steps:
      line === 2
        ? [
            "Определите главные члены каждой части.",
            "Сохраните все части составного сказуемого.",
            "Сверьте полный состав предложенной основы.",
          ]
        : line === 3
          ? [
              "Найдите основы.",
              "Определите связь и осложняющие элементы.",
              "Проверьте каждую характеристику.",
            ]
          : line === 10
            ? [
                "Сопоставьте каждое утверждение с текстом.",
                "Различите прямо названный факт и вывод.",
                "Не добавляйте отсутствующие события.",
              ]
            : line === 11
              ? [
                  "Определите значение названного средства.",
                  "Проверьте каждую цитату на соответствующий перенос или сопоставление.",
                  "Отличите образное употребление от буквального.",
                ]
              : [
                  "Прочитайте указанный диапазон предложений.",
                  "Сопоставьте значение слова с условием.",
                  "Выпишите требуемую форму полностью.",
                ],
    hint:
      line === 10
        ? "Проверьте, кто именно действует, когда происходит событие и что герой действительно решил."
        : line === 11
          ? "Найдите образное значение в контексте; одного союза или необычного слова недостаточно."
          : "Сохраняйте форму из текста и все слова устойчивого выражения.",
    formatLabel: `ОГЭ · задание ${line}`,
    input: config.input,
    level: "standard",
    taskLine: line,
    format: "exam-model",
    examModel: {
      year: spec.year,
      status: spec.status,
      sourceUrl: spec.sourceUrl,
    },
    provenance,
    reviewStatus: "checked-demo",
    reviewStages: [
      "answer-checked",
      "explanation-checked",
      "publication-approved",
    ].map((stage) => ({
      stage,
      at: dated,
      by: "Редакторская проверка проекта; методическое утверждение ожидается",
    })),
    ...extra,
  };
  const list = groups.get(topicId) ?? [];
  list.push(item);
  groups.set(topicId, list);
  return item;
}
const texts = [],
  writing = [];
const numbering = (sentences) =>
  sentences
    .map((s, n) => `(${n + 1}) ${s}`)
    .reduce((paragraphs, s, n) => {
      if (n % 4 === 0) paragraphs.push(s);
      else paragraphs[paragraphs.length - 1] += " " + s;
      return paragraphs;
    }, []);
for (const story of originals) {
  assert(
    story.claims.length === 5 &&
      story.extracts.length === 5 &&
      story.why10.length === 5 &&
      story.why11.length === 5,
    `${story.id}: неполные авторские данные`,
  );
  if (story.id === "tool") {
    story.lexPrompt =
      "Из предложения 8 выпишите слово, обозначающее уверенность в честности человека.";
    story.lexWhy =
      "«Доверие» в предложении 8 обозначает уверенность в честности Никиты. Выписывается именно форма из указанного предложения.";
  }
  if (story.id === "chess") {
    story.sentences[3] =
      "Соня решила взять себя в руки и поздравила победительницу.";
    story.why11[2] =
      "«Взять себя в руки» — устойчивое сочетание со значением справиться с волнением и сдержать эмоции.";
  }
  if (story.id === "chess")
    story.claims[4] =
      "После разбора Соня решила продолжить работу над позициями.";
  if (story.id === "rehearsal") {
    story.claims[0] = "Артём узнал о предстоящем соло за месяц до концерта.";
    story.why10[0] =
      "В предложении 1 сказано, что Артём узнал о соло за день до концерта, а не за месяц.";
    story.lexPrompt =
      "Из предложения 18 выпишите существительное со значением «помощь, ободрение».";
  }
  if (story.id === "map")
    story.lexPrompt =
      "Из предложения 10 выпишите слово со значением «предположение, которое ещё нужно проверить».";
  if (story.id === "team") {
    story.sentences[6] = story.sentences[6].replace("о всех", "обо всех");
    story.sentences[7] = story.sentences[7].replace(
      "согласованный оркестр",
      "слаженный оркестр",
    );
    story.sentences[8] = story.sentences[8].replace(
      "выполнил маршрут",
      "прошёл маршрут",
    );
    story.why11 = story.why11.map((s) =>
      s.replace("согласованный оркестр", "слаженный оркестр"),
    );
  }
  if (story.id === "bread")
    story.sentences[6] =
      "К вечеру они смеялись над тем, как старались не уронить ни одной крошки.";
  if (story.id === "boat")
    story.sentences[5] =
      "В лодке накопилось столько дождевой воды, что к вечеру она коснулась дна.";
  if (story.id === "draft") {
    story.sentences[4] =
      "Одноклассники поздравляли Дашу, а у неё был камень на душе.";
    story.lexPrompt =
      "Из предложений 4–6 выпишите фразеологизм со значением «тягостное чувство, тревога».";
    story.lexAnswer = "камень на душе";
    story.lexWhy =
      "«Камень на душе» — устойчивое выражение со значением тягостного чувства. В предложении 5 оно передаёт переживание Даши из-за нечестного поступка.";
  }
  const id = `reading-${story.id}`;
  texts.push({
    id,
    revision: 1,
    title: story.title,
    paragraphs: numbering(story.sentences),
    kind: "reading",
    authorship: "Оригинальный учебный текст проекта.",
    rightsBasis: rights,
    reviewNote: provenance.reviewNote,
  });
  add(
    10,
    "analiz-teksta",
    "Анализ содержания текста",
    `${story.title}: смысл и факты`,
    "Какие высказывания соответствуют содержанию текста? Укажите номера ответов.",
    story.claims,
    story.key10,
    story.why10,
    id,
    {
      hint: `Сопоставьте мотивы и последовательность поступков героев в тексте «${story.title}».`,
      subtopic: "Факт, последовательность, мотив героя",
    },
  );
  add(
    11,
    "vyrazitelnost",
    "Средства выразительности",
    `${story.title}: ${story.feature}`,
    `Укажите варианты, в которых используется ${story.feature}.`,
    story.extracts.map((n) => `(${n}) ${story.sentences[n - 1]}`),
    story.key11,
    story.why11,
    id,
    {
      hint: `Проверьте каждую цитату: требуется именно ${story.feature}, а не любое выразительное слово.`,
      subtopic: story.feature,
    },
  );
  add(
    12,
    "leksika",
    "Лексический анализ",
    `${story.title}: значение в контексте`,
    story.lexPrompt,
    [],
    story.lexAnswer,
    [story.lexWhy],
    id,
    {
      hint: "Условие задаёт значение и диапазон предложений. Не заменяйте найденное слово собственным синонимом.",
      subtopic: story.lexPrompt.includes("фразеологизм")
        ? "Фразеологизм"
        : story.lexPrompt.includes("антоним")
          ? "Антоним"
          : "Значение и синоним",
    },
  );
  if (originals.indexOf(story) < 5)
    writing.push({
      id: `essay-${story.id}`,
      revision: 1,
      line: 13,
      title: `Сочинение: ${story.title}`,
      sourceTextId: id,
      prompts: [
        {
          id: "13.1",
          label: "13.1 · Языковые средства",
          text: `Как языковые средства помогают раскрыть переживания героя в тексте «${story.title}»? Напишите рассуждение не менее 70 слов. Приведите два примера из данного текста, поясните роль каждого и сделайте вывод.`,
        },
        {
          id: "13.2",
          label: "13.2 · Смысл финала",
          text: `Объясните смысл финала: «${story.sentences.at(-1)}» Напишите рассуждение не менее 70 слов, приведите два подтверждающих примера из текста, поясните каждый и сделайте вывод.`,
        },
        {
          id: "13.3",
          label: "13.3 · Содержательный вопрос",
          text: `${story.essayQuestion} Напишите рассуждение не менее 70 слов. Подтвердите ответ двумя примерами из данного текста, поясните каждый и сделайте вывод.`,
        },
      ],
      checklist: [
        "Я ответил на выбранный вопрос.",
        "Я привёл два разных примера из данного текста.",
        "Я пояснил, как каждый пример подтверждает мысль.",
        "Вывод соответствует рассуждению.",
        "Я проверил связь абзацев и языковые ошибки.",
      ],
      analysis: story.analysis,
    });
}
for (const record of syntax) {
  const id = `syntax-${record.id}`;
  if (record.id === "snowfall") {
    record.sentences[0] = "Трое ребят вышли во двор.";
    record.options2[0] = "трое ребят вышли (предложение 1)";
    record.why2[0] =
      "Подлежащее — неделимое количественное сочетание «трое ребят», сказуемое — «вышли».";
  }
  if (record.id === "meeting") {
    record.sentences[2] = "Дежурный открыл окна.";
    record.options2[2] = "дежурный открыл (предложение 3)";
    record.why2[2] =
      "Субстантивированное прилагательное «дежурный» — подлежащее, «открыл» — простое глагольное сказуемое. Дополнение «окна» в основу не входит.";
  }
  if (record.id === "museum") {
    record.sentences[4] = "Слушать его выступление — удовольствие.";
    record.options2[3] = "границы отличаются (предложение 4)";
    record.options2[4] = "слушать его — удовольствие (предложение 5)";
    record.why2[3] =
      "В придаточной части подлежащее «границы» и сказуемое «отличаются». Главная часть имеет отдельную основу «он объяснил».";
    record.why2[4] =
      "Подлежащее — инфинитив «слушать», сказуемое — существительное «удовольствие» с нулевой связкой. Дополнение «его» не входит в основу.";
    record.why3[4] =
      "Инфинитив «слушать» называет действие как предмет сообщения, существительное «удовольствие» — сказуемое.";
    record.hint2 =
      "Учитывайте число сказуемого при сочетании «мы с сестрой»; дополнение при инфинитиве не входит в основу.";
  }
  texts.push({
    id,
    revision: 1,
    title: record.title,
    paragraphs: numbering(record.sentences),
    kind: "syntax",
    authorship: "Оригинальный учебный микротекст проекта.",
    rightsBasis: rights,
    reviewNote: provenance.reviewNote,
  });
  for (const line of [2, 3].filter((line) => record[`options${line}`]))
    add(
      line,
      line === 2 ? "osnova" : "sintaksis",
      line === 2 ? "Грамматическая основа" : "Синтаксический анализ",
      `${record.title}: ${line === 2 ? "основы" : "структура"}`,
      line === 2
        ? "Укажите варианты, в которых верно определена грамматическая основа одного из предложений или одной из частей сложного предложения."
        : "Укажите верные характеристики предложений текста.",
      record[`options${line}`],
      record[`key${line}`],
      record[`why${line}`],
      id,
      {
        hint: record[`hint${line}`],
        subtopic:
          line === 2
            ? "Составное сказуемое и односоставная конструкция"
            : "Тип предложения и осложнение",
      },
    );
}
for (const [topicId, items] of groups) {
  const file = `${directory}/content/exercises/${topicId}.json`;
  let previous = [];
  try {
    previous = await read(file);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const kept = previous.filter(
    (e) => e.provenance.sourceId !== "project-oge-2027-originals",
  );
  await fs.writeFile(file, JSON.stringify([...kept, ...items], null, 2) + "\n");
}
let previous = { audio: [], variants: [], texts: [], writing: [] };
try {
  previous = await read(`${directory}/oge/materials.json`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
await fs.writeFile(
  `${directory}/oge/materials.json`,
  JSON.stringify(
    {
      ...previous,
      texts: [...texts, ...previous.texts.filter((t) => t.kind === "summary")],
      writing: [...writing, ...previous.writing.filter((w) => w.line === 1)],
    },
    null,
    2,
  ) + "\n",
);
console.log(
  `Подготовлены оригинальные тексты: ${texts.length}; задания: ${[...groups.values()].flat().length}; темы сочинений: ${writing.length}.`,
);
