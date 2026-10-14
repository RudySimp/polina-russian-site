import fs from "node:fs/promises";
import { exercises } from "../apps/showcase/src/content/registry";
import { lessons } from "../apps/showcase/src/content/library";
import { exerciseIndex } from "../apps/showcase/src/content/catalog";
import subskillsData from "../apps/showcase/src/content/subskills.json";
import materialsData from "../apps/showcase/src/oge/materials.json";
import activitiesData from "../apps/showcase/src/oge/activities.json";
import guidesData from "../apps/showcase/src/oge/writing-guides.json";
import catalogVersion from "../apps/showcase/src/content/catalog-version.json";
import {
  eligible,
  generateVariantMetadata,
  validateVariant,
  type Materials,
} from "../apps/showcase/src/oge/engine";
import {
  specification,
  testLines,
} from "../apps/showcase/src/oge/specification";
import type { Exercise } from "../apps/showcase/src/content/model";
import type {
  ExamVariant,
  InteractiveActivity,
} from "../apps/showcase/src/oge/model";

const date = "2026-10-13";
const materials = { ...materialsData, exercises } as unknown as Materials & {
  variants: ExamVariant[];
};
const activities = activitiesData as unknown as InteractiveActivity[];
const current = exercises.filter(
  (e) =>
    e.exam === "OGE" &&
    e.examModel.year === specification.year &&
    e.examModel.status === specification.status &&
    !!e.taskLine,
);
const bank = current.filter((e) => eligible(e) && e.format === "exam-model");
const sourceAvailable = (id: string) =>
  materials.texts.some((text) => text.id === id && !!text.rightsBasis.trim());
function compatible(lines: number[]) {
  return [
    ...new Set(
      bank
        .filter((e) => lines.includes(e.taskLine!))
        .map((e) => e.sourceTextId),
    ),
  ].filter(
    (id): id is string =>
      !!id &&
      sourceAvailable(id) &&
      lines.every((line) =>
        bank.some((e) => e.taskLine === line && e.sourceTextId === id),
      ),
  );
}
const syntax = compatible([2, 3]);
const readingTest = compatible([10, 11, 12]);
const readingFull = readingTest.filter((id) =>
  materials.writing.some(
    (w) => w.line === 13 && w.sourceTextId === id && w.prompts.length === 3,
  ),
);
const summaries = materials.writing.filter(
  (w) =>
    w.line === 1 &&
    sourceAvailable(w.sourceTextId) &&
    materials.audio.some(
      (a) =>
        a.id === w.audioId &&
        a.textId === w.sourceTextId &&
        !!a.path &&
        a.durationSeconds > 0,
    ),
);
const poolFor = (kind: "full" | "test") =>
  bank.filter((e) => {
    if ([2, 3].includes(e.taskLine!)) return syntax.includes(e.sourceTextId!);
    if ([10, 11, 12].includes(e.taskLine!))
      return (kind === "full" ? readingFull : readingTest).includes(
        e.sourceTextId!,
      );
    return true;
  });
const fullPool = poolFor("full"),
  testPool = poolFor("test");
const currentIds = new Set(current.map((e) => e.id));
const indexMismatch = exerciseIndex
  .filter(
    (e) =>
      currentIds.has(e.id) &&
      !!e.generationEligible !== bank.some((item) => item.id === e.id),
  )
  .map((e) => e.id);
const probes: { kind: string; count: number; errors: string[] }[] = [];
for (const kind of ["full", "test"] as const) {
  const errors: string[] = [];
  for (let n = 0; n < 32; n += 1) {
    try {
      const plan = generateVariantMetadata(
        { ...materials, exercises: exerciseIndex },
        kind,
        "coverage-" + kind + "-" + n,
      );
      validateVariant(plan, {
        ...materials,
        exercises: exercises.filter((e) =>
          plan.assignments.some(
            (ref) => ref.id === e.id && ref.revision === e.revision,
          ),
        ),
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  probes.push({ kind, count: 32, errors });
}
if (indexMismatch.length || probes.some((probe) => probe.errors.length))
  throw new Error(
    "Generator coverage verification failed: " +
      JSON.stringify({ indexMismatch, probes }),
  );

function countsBy<T>(values: T[], key: (value: T) => string) {
  return Object.fromEntries(
    [...new Set(values.map(key))]
      .sort()
      .map((name) => [
        name,
        values.filter((item) => key(item) === name).length,
      ]),
  );
}
const positivePositions = (exercise: Exercise) =>
  new Set(
    exercise.answers.flatMap((answer) =>
      [...answer.replace(/[ ,]/gu, "")]
        .filter((char) => /^[1-9]$/u.test(char))
        .map(Number),
    ),
  );
const rows = subskillsData.map((skill) => {
  const annotated = current.filter((e) => e.skillIds?.includes(skill.id));
  let selected = 0,
    distractors = 0,
    directShort = 0;
  const positiveIds = new Set<string>();
  for (const exercise of annotated) {
    if (exercise.responseKind === "short_text") {
      directShort += 1;
      positiveIds.add(exercise.id);
      continue;
    }
    const positions = positivePositions(exercise);
    for (const element of exercise.elements ?? []) {
      if (!element.skillIds.includes(skill.id)) continue;
      if (positions.has(element.position)) {
        selected += 1;
        positiveIds.add(exercise.id);
      } else distractors += 1;
    }
  }
  const url = new URL(skill.rulePath, "https://local.invalid");
  const section = lessons
    .find((lesson) => lesson.topicId === skill.topicId)
    ?.sections.find(
      (part) => part.id === decodeURIComponent(url.hash.slice(1)),
    );
  const games = activities
    .flatMap((activity) => activity.situations)
    .filter((situation) => situation.skillIds?.includes(skill.id)).length;
  const paragraphExamples =
    section?.blocks.filter((block) => block.type === "example").length ?? 0;
  const paragraphCounterexamples =
    section?.blocks.filter(
      (block) => block.type === "example" && !!block.counterexample?.trim(),
    ).length ?? 0;
  return {
    ...skill,
    annotatedExercises: annotated.length,
    positiveExercises: positiveIds.size,
    selectedPositions: selected,
    distractorPositions: distractors,
    directShortAnswers: directShort,
    paragraphExists: !!section,
    paragraphExamples,
    paragraphCounterexamples,
    gameSituations: games,
    gap: positiveIds.size === 0,
  };
});

let inventory: {
  files: number;
  docx: number;
  pdf: number;
  nonempty: number;
  empty: number;
  basis: string;
};
try {
  const local = JSON.parse(
    await fs.readFile(
      "private-materials/import/learning-materials-registry.json",
      "utf8",
    ),
  ) as { records: { format: string; bytes: number }[] };
  inventory = {
    files: local.records.length,
    docx: local.records.filter((r) => r.format === "docx").length,
    pdf: local.records.filter((r) => r.format === "pdf").length,
    nonempty: local.records.filter((r) => r.bytes > 0).length,
    empty: local.records.filter((r) => r.bytes === 0).length,
    basis:
      "private-materials/import/learning-materials-registry.json (только суммы)",
  };
} catch {
  const publicDoc = await fs.readFile(
    "docs/РЕЕСТР_УЧЕБНЫХ_МАТЕРИАЛОВ.md",
    "utf8",
  );
  const records = publicDoc
    .split(/\r?\n/u)
    .filter((line) => /\| `[a-f0-9]{64}` \|/u.test(line))
    .map((line) => line.split("|").map((cell) => cell.trim()));
  inventory = {
    files: records.length,
    docx: records.filter((r) => r[1].endsWith(".docx")).length,
    pdf: records.filter((r) => r[1].endsWith(".pdf")).length,
    nonempty: records.filter((r) => Number(r[3]) > 0).length,
    empty: records.filter((r) => Number(r[3]) === 0).length,
    basis: "Публичная таблица docs/РЕЕСТР_УЧЕБНЫХ_МАТЕРИАЛОВ.md",
  };
}
const exerciseFiles = (await fs.readdir("apps/showcase/src/content/exercises"))
  .filter((file) => file.endsWith(".json"))
  .sort();
let shardCount = 0;
for (const filename of exerciseFiles) {
  const collection = JSON.parse(
    await fs.readFile(
      "apps/showcase/src/content/exercises/" + filename,
      "utf8",
    ),
  ) as Exercise[];
  shardCount += Math.ceil(collection.length / 20);
}
const report = {
  schemaVersion: 1,
  checkedAt: date,
  specification: {
    id: specification.id,
    year: specification.year,
    status: specification.status,
  },
  catalogVersion: catalogVersion.version,
  baseline: {
    totalExercises: 252,
    currentOge: 220,
    localOriginalImports: 148,
    sourceFiles: 39,
  },
  counts: {
    totalExercises: exercises.length,
    currentOge: current.length,
    legacyOge: exercises.filter(
      (e) => e.exam === "OGE" && !currentIds.has(e.id),
    ).length,
    ege: exercises.filter((e) => e.exam === "EGE").length,
    localOriginalImports: current.filter(
      (e) => e.provenance.method === "local-original-import",
    ).length,
    official: current.filter((e) => e.originCategory === "official").length,
    origins: {
      official: current.filter((e) => e.originCategory === "official").length,
      "author-model": current.filter((e) => e.originCategory === "author-model")
        .length,
      learning: current.filter((e) => e.originCategory === "learning").length,
      unclassified: current.filter((e) => !e.originCategory).length,
    },
    provenance: countsBy(current, (e) => e.provenance.method),
    teacherPending: current.filter(
      (e) => e.provenance.teacherApproval === "pending",
    ).length,
    teacherApproved: current.filter(
      (e) => (e.provenance.teacherApproval as string) === "approved",
    ).length,
    classificationDraft: current.filter(
      (e) =>
        (e as Exercise & { classificationReview?: string })
          .classificationReview === "editorial-draft",
    ).length,
    revisionMatchedReceipts: current.filter(
      (e) => e.publicationReview?.revision === e.revision,
    ).length,
    lessonsOge: lessons.filter((lesson) => lesson.topicId !== "udarenie")
      .length,
    writing: materials.writing.length,
    summaries: materials.writing.filter((w) => w.line === 1).length,
    essays: materials.writing.filter((w) => w.line === 13).length,
    writingGuides: guidesData.guides.length,
    guideRoutes: guidesData.guides.reduce(
      (sum, guide) => sum + guide.routes.length,
      0,
    ),
    activities: activities.length,
    gameSituations: activities.reduce(
      (sum, activity) => sum + activity.situations.length,
      0,
    ),
    sourceTexts: materials.texts.length,
    audio: materials.audio.length,
    fixedVariants: materials.variants.length,
    subskills: rows.length,
    zeroPositiveSubskills: rows.filter((row) => row.gap).length,
    exerciseShards: shardCount,
    maxExercisesPerShard: 20,
  },
  sourceInventory: inventory,
  lines: testLines.map((line) => ({
    number: line.number,
    title: line.title,
    current: current.filter((e) => e.taskLine === line.number).length,
    eligible: bank.filter((e) => e.taskLine === line.number).length,
    fullPool: fullPool.filter((e) => e.taskLine === line.number).length,
    testPool: testPool.filter((e) => e.taskLine === line.number).length,
  })),
  generation: {
    eligible: bank.length,
    syntaxTextIds: syntax,
    readingTestTextIds: readingTest,
    readingFullTextIds: readingFull,
    summaryIds: summaries.map((w) => w.id),
    fullPool: fullPool.length,
    testPool: testPool.length,
    indexMismatch,
    probes,
  },
  activities: activities.map((activity) => ({
    id: activity.id,
    title: activity.title,
    kind: activity.kind,
    count: activity.situations.length,
  })),
  coverage: rows,
};
await fs.writeFile(
  "docs/oge-coverage.json",
  JSON.stringify(report, null, 2) + "\n",
);
const table = (headers: string[], data: (string | number)[][]) =>
  [
    "| " + headers.join(" | ") + " |",
    "| " + headers.map(() => "---").join(" | ") + " |",
    ...data.map(
      (row) =>
        "| " +
        row
          .map((cell) =>
            String(cell).replaceAll("|", "¦").replaceAll("\n", " "),
          )
          .join(" | ") +
        " |",
    ),
  ].join("\n");
const c = report.counts;
const doc = [
  "# Матрица покрытия ОГЭ",
  "",
  "Срез: 13 октября 2026 года. Воспроизводимая команда: `npx tsx scripts/report-oge-coverage.ts`; машиночитаемый результат — [oge-coverage.json](oge-coverage.json). Источники: текущий registry, library, subskills, materials, activities, writing-guides и фактические функции eligible / validateVariant движка.",
  "",
  "Матрица описывает доступные редакции и разметку проекта. Она не удостоверяет полноту подготовки к ОГЭ, не является независимым утверждением каждого ключа и не превращает проектные ID навыков в официальные коды ФИПИ. Экзаменационная модель: " +
    specification.id +
    ", статус **" +
    specification.status +
    "**.",
  "",
  "## Фактические объёмы",
  "",
  table(
    ["Показатель", "Аудит 12 октября", "Текущий банк"],
    [
      ["Упражнения всего", 252, c.totalExercises],
      ["Текущие упражнения ОГЭ", 220, c.currentOge],
      ["Авторский локальный импорт", 148, c.localOriginalImports],
      ["Официальные задания", 0, c.official],
      ["Источники файлов", 39, inventory.files],
    ],
  ),
  "",
  "Дополнительно: " +
    c.legacyOge +
    " прежние редакции ОГЭ и " +
    c.ege +
    " упражнений ЕГЭ; " +
    c.lessonsOge +
    " глав ОГЭ; " +
    c.writing +
    " письменных заданий (" +
    c.summaries +
    " изложений, " +
    c.essays +
    " комплектов сочинений); " +
    c.writingGuides +
    " разборов / " +
    c.guideRoutes +
    " маршрутов; " +
    c.activities +
    " игровых механик / " +
    c.gameSituations +
    " ситуаций. " +
    c.sourceTexts +
    " общих текстов, " +
    c.audio +
    " аудиозаписей и " +
    c.fixedVariants +
    " сохранённых полных вариантов.",
  "",
  "Инвентаризация содержит " +
    inventory.docx +
    " DOCX и " +
    inventory.pdf +
    " PDF: " +
    inventory.nonempty +
    " непустых, " +
    inventory.empty +
    " пустой. Это количество найденных файлов, а не число полностью прочитанных книг или разрешённых упражнений. Основание: " +
    inventory.basis +
    ". Приватные условия не попадают в отчёт.",
  "",
  "## Происхождение и допуск",
  "",
  table(
    ["Категория / статус", "Текущих упражнений ОГЭ"],
    [
      ...Object.entries(c.origins).map(
        ([key, value]) => [key, value] as [string, number],
      ),
      ["local-original-import", c.localOriginalImports],
      ["project-original", c.provenance["project-original"] ?? 0],
      ["teacherApproval: pending", c.teacherPending],
      ["teacherApproval: approved", c.teacherApproved],
      ["classificationReview: editorial-draft", c.classificationDraft],
      ["publicationReview совпадает с revision", c.revisionMatchedReceipts],
    ],
  ),
  "",
  "Допуск checked-demo позволяет использовать авторскую демонстрационную редакцию. Он отделён от решения Полины. Наличие publicationReview или прохождение технической проверки собственного эталона не подтверждает независимое предметное решение. Старые редакционные стадии и права дополнительно проверяет eligible(); проектные и локальные авторские материалы не называются официальными заданиями.",
  "",
  "## Возможность включения в вариант",
  "",
  "До связности групп eligible() допускает " +
    bank.length +
    " упражнений. Без фильтров уровня и истории полный вариант может использовать " +
    fullPool.length +
    ", тестовая часть — " +
    testPool.length +
    ". В знаменателе " +
    c.currentOge +
    " текущих карточек: наличие карточки в линии не означает включение в согласованный вариант.",
  "",
  table(
    ["№", "Линия", "Текущий банк", "eligible", "Пул полного", "Пул тестового"],
    report.lines.map((line) => [
      line.number,
      line.title,
      line.current,
      line.eligible,
      line.fullPool,
      line.testPool,
    ]),
  ),
  "",
  "Совместимых общих текстов № 2–3: **" +
    syntax.length +
    "**. Совместимых комплектов № 10–12 для тестовой части: **" +
    readingTest.length +
    "**; для полной работы с сочинением к тому же тексту: **" +
    readingFull.length +
    "**. Изложений с согласованным исходным текстом и аудио: **" +
    summaries.length +
    "**.",
  "",
  "Распределение вычисляется по фактической принадлежности к полным группам, а не по случайной выборке. Дополнительно проверены 32 детерминированных плана каждого вида: все " +
    probes.reduce((sum, probe) => sum + probe.count, 0) +
    " прошли validateVariant после обращения к выбранным полным условиям. Расхождений generationEligible в метаданных с eligible текущего банка: " +
    indexMismatch.length +
    ". Проверка не подтверждает качество аудиозаписи на слух и не заменяет редактора.",
  "",
  "## Поднавыки и положительные случаи",
  "",
  "«Выбрано» — число элементов, номера которых присутствуют в допустимом ключе; «Отвлекает» — остальные размеченные элементы. Учитываются варианты ключа. Для коротких ответов без позиционной разметки отдельно указан счётчик карточек. Слова в неверном утверждении и его опровержении могут дать regex-метку навыка: такая метка не доказывает наличие положительного нормативного примера. Все " +
    c.classificationDraft +
    " размеченных карточек имеют статус editorial-draft; даже выбранные позиции требуют предметной сверки самих меток.",
  "",
  "Коды ниже — внутренние ID проекта. «Параграф» проверяет существование указанного якоря; наличие якоря не доказывает достаточности объяснения. Игры учитываются только при явном skillIds ситуации. Письменные задания пока не имеют собственной разметки этими поднавыками и поэтому не прибавляются к числам тестовых карточек.",
  "",
  table(
    [
      "ID / поднавык",
      "Карточек с меткой",
      "Выбрано",
      "Отвлекает",
      "Короткий ответ",
      "Параграф",
      "Игр",
      "Пробел",
    ],
    rows.map((row) => [
      row.id + " — " + row.title,
      row.annotatedExercises,
      row.selectedPositions,
      row.distractorPositions,
      row.directShortAnswers,
      row.paragraphExists ? "[есть](" + row.rulePath + ")" : "нет якоря",
      row.gameSituations,
      row.gap
        ? row.line === 1 || row.line === 13
          ? "письмо без разметки"
          : "0 размеченных положительных карточек"
        : "черновая разметка",
    ]),
  ),
  "",
  "## Непокрытые и неподтверждённые области",
  "",
  "Нулевой счётчик размеченных положительных карточек у " +
    c.zeroPositiveSubskills +
    " из " +
    c.subskills +
    " поднавыков:",
  "",
  ...rows
    .filter((row) => row.gap)
    .map(
      (row) =>
        "- **" +
        row.id +
        " — " +
        row.title +
        "**: " +
        row.annotatedExercises +
        " меток, " +
        row.distractorPositions +
        " невыбранных позиций, " +
        row.gameSituations +
        " размеченных игровых ситуаций. " +
        (row.line === 1 || row.line === 13
          ? "Обучающие письменные маршруты существуют; их индивидуальная разметка и экспертный допуск не выполнены."
          : "Нужны проверка позиционной разметки, отдельные положительные примеры и перенос навыка. Нулевой счётчик при наличии целых карточек может означать пробел разметки, а не отсутствие конструкции в условии."),
    ),
  "",
  "Ненулевой счётчик не означает методической полноты. Для каждого поднавыка остаются сверка разметки, разнообразие конструкций и ограничений, самостоятельные новые примеры, проверка контрпримеров и фактическое решение преподавателя. Очные сценарии со школьниками не проводились. Сторонний сборник остаётся в карантине до подтверждения прав.",
  "",
  "Каталожный SHA-256 этого среза: `" +
    catalogVersion.version +
    "`. Он охватывает JSON упражнений и materials; редакции уроков, игр и письменных разборов учитываются их собственными revision.",
  "",
].join("\n");
await fs.writeFile("docs/МАТРИЦА_ПОКРЫТИЯ_ОГЭ.md", doc);

const bankSource = await fs.readFile(
  "apps/showcase/src/oge/BankPage.tsx",
  "utf8",
);
const searchBehavior =
  /^import\s+searchIndex\s+from\s+["']\.\.\/content\/exercise-search\.json["']/mu.test(
    bankSource,
  )
    ? "Полнотекстовый `exercise-search.json` подключён к отложенному модулю страницы банка. Главная его не загружает; при открытии банка текущая версия читает весь поисковый индекс сразу, даже без запроса. Это отдельный компактный индекс текста, без ключей и разборов; условия остаются адресными. Отложенная загрузка самого индекса до поискового ввода пока не реализована."
    : "Полнотекстовый `exercise-search.json` загружается отдельно по запросу поиска; главная и обзор не обращаются к нему. Это индекс текста без ключей и разборов; полные условия остаются адресными.";
const architecture =
  '# Архитектура банка и вариантов\n\nСрез: 14 октября 2026 года. Документ формируется вместе с матрицей командой `npx tsx scripts/report-oge-coverage.ts`. Описана существующая React/Vite-витрина и её локальное хранение; серверные API и база Next.js не заменяются.\n\n## От индекса к полной редакции\n\nБанк содержит ${c.totalExercises} упражнений: ${c.currentOge} текущих ОГЭ, ${c.legacyOge} прежние редакции ОГЭ и ${c.ege} ЕГЭ. `registry.ts` с полными объектами применяется в скриптах и предметных проверках. Пользовательские страницы читают `catalog.ts` / `exercise-index.json` с метаданными. Привязка id к порции генерируется в `exercise-loaders.ts`.\n\nПолные условия разделены на **${c.exerciseShards} порции по не более чем ${c.maxExercisesPerShard} упражнений**. Это количество JSON-порций текущего набора, а не обещание постоянного числа файлов. `loadExercise(id)` обращается к нужной порции; `loadExercises(ids)` объединяет нужные порции и возвращает только запрошенные объекты. Внутри порции могут загрузиться соседние задания. Кэши Promise стабильны, одинаковые запросы объединяются; при отказе соответствующий Promise удаляется и допускается повторная загрузка. Старые неиспользуемые файлы в каталоге shards не считаются доступными, если их нет в сгенерированном загрузчике.\n\n${searchBehavior}\n\n`lesson-loaders.ts` отделён от статического полного registry; глава загружается по topicId. `lesson-search.json` содержит тексты параграфов с topicId, revision и sectionId, поэтому поиск может вести к якорю конкретного параграфа. Наличие поискового индекса не удостоверяет предметное качество совпадения.\n\nНа главной странице, обзоре ОГЭ и странице теории восстановление истории отдельных упражнений не обращается к полным условиям: App пропускает этот эффект для этих маршрутов. Обзор читает компактные записи работ и их метаданные. На страницах, где нужна проверка прежних ответов, `readAttemptsAddressed` загружает условия только для имеющихся id, а не весь банк. При восстановлении старого или повреждённого индекса может понадобиться отдельное чтение снимка.\n\n## Генерация варианта\n\n```mermaid\nflowchart LR\n  A[Метаданные и фильтры] --> B[План: id и revision]\n  B --> C[Адресная загрузка 11 условий]\n  C --> D[validateVariant и снимок работы]\n  D --> E[Снимок + состояние + индекс]\n  E --> F[Продолжение и разбор сохранённой редакции]\n```\n\n`generateVariantMetadata` выбирает по индексу 11 ссылок для № 2–12 и согласованные исходные тексты. Для полной работы добавляются изложение с аудио и сочинение к тому же тексту, что № 10–12. Метаданные содержат предварительный `generationEligible`; перед началом `sessionFromVariant` вызывает `validateVariant` на **полных выбранных условиях**. Только после этого создаётся и сохраняется работа. Проверка ключа, прав, редакционных стадий и финальной редакции в `eligible` остаётся обязательной.\n\nБез дополнительных фильтров текущие пулы: **${fullPool.length}** карточек для полного варианта и **${testPool.length}** для тестового из ${c.currentOge}. № 2–3 имеют ${syntax.length} согласованных общих текстов, № 10–12 — ${readingTest.length} для теста и ${readingFull.length} с сочинением; изложений с согласованным аудио — ${summaries.length}. Уровень, история и выбор только новых заданий уменьшают эти пулы. Новизна упражнений, письменных заданий, текстов и аудио учитывается раздельно; прежняя revision не подменяет выполнение текущей.\n\nСуществующие ${c.fixedVariants} полных вариантов сохраняют явные ссылки на редакции. Их загрузчик обращается только к условиям выбранного варианта. Генерация использует детерминированное перемешивание с seed. Для точного повторения требуются также specificationId, generationVersion, catalogVersion и ссылки id/revision. Seed без версии банка недостаточен.\n\nКаталожный SHA-256: `${catalogVersion.version}`. Сборщик хеширует файлы упражнений и `materials.json`. Хеш не охватывает уроки, игры и письменные разборы — у них собственные revision. Снимок сохраняет полные упражнения, выбранные задания письма, тексты и сведения об аудио, поэтому будущая редакция банка не меняет историческое условие. Ссылку на аудиофайл следует сохранять при публикациях: JSON-резервная копия не содержит сами звуковые байты.\n\n## Локальная запись и восстановление\n\nОсновное асинхронное хранилище — IndexedDB `polina-oge-works-v2`, версия базы 1:\n\n| Store | Содержимое | Обновление |\n| --- | --- | --- |\n| snapshots | Полный исходный снимок конкретной работы | Однократная запись по id |\n| drafts | Ответы, выбранные темы, позиция, аудиосостояние, проверки и завершение | Транзакционная запись текущего состояния |\n| index | Краткая запись, счётчики и ссылки на редакции | Для списка работ и фильтров истории |\n| revisions | Предыдущие состояния контрольных точек | При завершении либо интервале не менее 60 секунд |\n\n`saveSessionDurably` завершает транзакцию до объявления успешного сохранения. При запрете IndexedDB используется совместимый путь localStorage. Зеркало для старых вкладок сохраняется отдельно; отказ зеркала после успешной транзакции IDB не отменяет уже записанные ответы.\n\nСовместимые ключи: `polina-oge-work-v1:<id>` для исходного снимка, `polina-oge-state-v2:<id>` для изменяемого состояния, `polina-oge-index-v2:<id>` для компактного списка. Первичная миграция копирует проверенную работу в IDB, **не удаляет и не переписывает автоматически прежнюю v1-запись**. Явное удаление пользователем удаляет эту работу и её состояния. При чтении выбирается свежая проверенная редакция; повреждённый дополнительный индекс восстанавливается из данных, а не изобретает ответы.\n\n`SessionDraft` хранит отдельно текущий текст и последнюю успешно записанную основу. Отказ записи не повышает время последнего сохранения. Последующий ввод накапливается поверх черновика; повторная запись сравнивается с прежней успешной основой. `updatedAt` проверяется перед записью и внутри транзакции. Изменение в другой вкладке поступает через storage / BroadcastChannel; чистая вкладка обновляется, собственный несохранённый ввод получает конфликт. Интерфейс показывает обе редакции и допускает отдельную копию или резервный файл.\n\nСписок работ и обзор используют `listSessionSummariesDurably`: условия не перечитываются при обычной фильтрации и пагинации истории. Открытие конкретной работы обращается к её снимку. Полное чтение всей истории используется намеренно при экспорте всех работ, а не для рисования списка.\n\nДля исторических полных работ validateVariant(variant, materials, {mode: "snapshot"}) проверяет структуру, формат, модели и связи общего текста/письма/аудио, не применяя современный publication guard к прежнему условию. parseSession использует именно этот режим. Например, реальный доаудитный №7-013 revision 1 с «гн…тся(8)т» сохраняется и переносится в собственном снимке; current eligible/publication по-прежнему отклоняет эту повреждённую редакцию. Историческое восстановление не исправляет условие задним числом и не означает нынешнего допуска ключа или материала.\n\n## Резервная копия и код воспроизведения\n\nФормат резервной копии: `polina-oge-backup`, version 1. Экспорт содержит полные снимки и состояния, письменные тексты и оценочные листы, а также описания воспроизведения. Импорт проверяет размер до 20 МБ, JSON, формат/версию, число работ 1–200 и каждый снимок через `parseSession`, включая редакции, формат и связи. Все записи проверяются до начала импорта. Для всей истории prepareBackupParts предварительно формирует независимые компактные UTF-8-файлы по 1–200 работ и не более 20 000 000 байт каждый; при 201 работе получаются части 200+1. Все части подготовлены до первого скачивания, список частей доступен в результатах. Один снимок не делится: он должен помещаться в 20 МБ и в 3 000 000 символов сериализованного JSON (String.length), как при восстановлении. Превышение/ошибка показывает понятный отказ, исходные данные остаются в браузере; все потребители download обрабатывают ошибку. При совпадении id создаётся отдельная копия; при отказе фактической записи интерфейс сообщает, сколько работ удалось сохранить.\n\nОтдельное описание `polina-oge-generation`, version 1 включает seed, версии модели/генерации/каталога, тип и режим работы, id/revision условий, текстов и аудио, выбранные темы. Из результатов можно скачать код и загрузить его на странице генератора: создаётся отдельная попытка с очищенными ответами и теми же условиями. Сначала используется совпадающий сохранённый снимок, включая историческую редакцию; при его отсутствии адресно загружаются только ссылки текущего каталога и проверяется полный состав. Неизвестная прежняя редакция не заменяется новым заданием: нужен полный резервный файл со снимком. Максимум кода — 1 МБ; модель, редакции, уникальность ссылок, темы и связи текстов/аудио проверяются до сохранения. Код состава не является резервной копией звуковых файлов или полной работой ученика.\n\nЗавершённая работа показывает исходное сохранённое условие и общий текст, варианты ответа, введённый ответ, правильный результат и различия, выбранную формулировку письма и сохранённую рубрику. Печать относится к этой редакции. Самопроверка, реальный экспертный лист, недостаточный объём и пустой ответ имеют разные статусы; автоматическая тестовая часть не превращается в официальный итоговый балл.\n\n## Учебные состояния и границы проверки\n\nИгры сохраняют revision ситуации и её снимок при результате, незавершённое действие — отдельно. Первая самостоятельная попытка отделена от результата после подсказки и повторной проверки. Прежние записи без снимка не переоцениваются как текущие ситуации. Уроки сохраняют состояние учебного действия; достижение после раскрытия пояснения не считается новым независимым переносом.\n\nПользовательская граница ошибок `ContentBoundary` показывает повторную загрузку при отказе материалов. Сохранённые данные остаются в браузере; это не обещание восстановить текст, который ни разу не был записан. Кэши модулей/JSON сбрасывают отклонённый Promise, чтобы временный сетевой отказ не оставался постоянным.\n\n`scripts/benchmark-bank.mjs` создаёт изолированные синтетические банки на 1000 и 5000 записей для браузерной проверки загрузки, поиска, фильтрации, пагинации, открытия, возврата, истории и формирования работы. Эти записи не публикуются и не увеличивают ${c.currentOge} реальных заданий. Результаты и условия запуска должны приводиться в отчёте сценариев; эта схема хранения сама по себе не доказывает время отклика.\n\nМатериалы происходят из ${inventory.files} зарегистрированных файлов (${inventory.docx} DOCX, ${inventory.pdf} PDF), ${inventory.nonempty} непустых. Разметка ${c.subskills} поднавыков — editorial-draft по шаблонам, ${c.teacherPending} текущих упражнений ожидают решения преподавателя. Архитектура сохраняет эти статусы и права; она не предоставляет разрешение на публикацию стороннего сборника.\n'
    .replaceAll("${c.totalExercises}", String(c.totalExercises))
    .replaceAll("${c.currentOge}", String(c.currentOge))
    .replaceAll("${c.legacyOge}", String(c.legacyOge))
    .replaceAll("${c.ege}", String(c.ege))
    .replaceAll("${c.exerciseShards}", String(c.exerciseShards))
    .replaceAll("${c.maxExercisesPerShard}", String(c.maxExercisesPerShard))
    .replaceAll("${searchBehavior}", searchBehavior)
    .replaceAll("${fullPool.length}", String(fullPool.length))
    .replaceAll("${testPool.length}", String(testPool.length))
    .replaceAll("${syntax.length}", String(syntax.length))
    .replaceAll("${readingTest.length}", String(readingTest.length))
    .replaceAll("${readingFull.length}", String(readingFull.length))
    .replaceAll("${summaries.length}", String(summaries.length))
    .replaceAll("${c.fixedVariants}", String(c.fixedVariants))
    .replaceAll("${catalogVersion.version}", catalogVersion.version)
    .replaceAll("${inventory.files}", String(inventory.files))
    .replaceAll("${inventory.docx}", String(inventory.docx))
    .replaceAll("${inventory.pdf}", String(inventory.pdf))
    .replaceAll("${inventory.nonempty}", String(inventory.nonempty))
    .replaceAll("${c.subskills}", String(c.subskills))
    .replaceAll("${c.teacherPending}", String(c.teacherPending));
await fs.writeFile("docs/АРХИТЕКТУРА_БАНКА_И_ВАРИАНТОВ.md", architecture);

console.log(
  JSON.stringify(
    {
      counts: c,
      sourceInventory: inventory,
      generator: {
        syntax: syntax.length,
        readingTest: readingTest.length,
        readingFull: readingFull.length,
        fullPool: fullPool.length,
        testPool: testPool.length,
        probes: 64,
      },
      zeroPositive: rows.filter((row) => row.gap).map((row) => row.id),
    },
    null,
    2,
  ),
);
