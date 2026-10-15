import type { Exercise } from "../content/model";
export type AnswerDifference = {
  position: number;
  ruleIndex?: number;
  title: string;
  detail: string;
};
export function generalRulePath(exercise: Exercise) {
  const anchor =
    exercise.taskLine === 4
      ? "match"
      : exercise.taskLine === 7
        ? "gap-localization"
        : "algorithm";
  return "/theory/" + exercise.topicSlug + "/?exam=OGE#" + anchor;
}
export function answerDifference(
  exercise: Exercise,
  answer: string,
): AnswerDifference[] {
  const value = answer.replace(/[ ,]/gu, "").trim(),
    expected = exercise.answers[0] ?? "";
  if (exercise.responseKind !== "digits_sequence") return [];
  if (exercise.input === "matching")
    return [...expected].flatMap((digit, ruleIndex) =>
      value[ruleIndex] === digit
        ? []
        : [
            {
              position: Number(digit),
              ruleIndex,
              title: "Правило " + String.fromCharCode(1040 + ruleIndex),
              detail:
                "Вы выбрали предложение " +
                (value[ruleIndex] ?? "—") +
                "; правило объясняет предложение " +
                digit +
                ".",
            },
          ],
    );
  const given = new Set([...value]),
    wanted = new Set([...expected]);
  return [...new Set([...value, ...expected])]
    .filter((d) => given.has(d) !== wanted.has(d))
    .map((d) => ({
      position: Number(d),
      title: (wanted.has(d) ? "Пропущена" : "Лишняя") + " позиция " + d,
      detail:
        exercise.optionExplanations[Number(d) - 1] ??
        [
          ...exercise.explanation.matchAll(
            /(?:^|\n)(?:\((\d+)\)|(\d+)\))\s*([^\n]+)/gu,
          ),
        ].find((row) => Number(row[1] ?? row[2]) === Number(d))?.[3] ??
        "Проверьте условие выбора и правило для этой позиции.",
    }));
}
export function feedbackRuleTargets(
  exercise: Exercise,
  differences: AnswerDifference[],
) {
  const targets = differences.map((difference) =>
    exercise.input === "matching"
      ? exercise.ruleElements?.find(
          (rule) => rule.ruleIndex === difference.ruleIndex,
        )
      : exercise.elements?.find(
          (element) => element.position === difference.position,
        ),
  );
  // Missing metadata, including old snapshots, has no claimed exact skill.
  const paths = [
    ...new Set(
      targets.map((target) => target?.rulePath ?? generalRulePath(exercise)),
    ),
  ];
  const resolvedPaths = paths.length ? paths : [generalRulePath(exercise)];
  const links = resolvedPaths.map((path) => ({
    path,
    skillId: targets.find((target) => target?.rulePath === path)?.skillIds[0],
  }));
  return {
    paths: resolvedPaths,
    links,
    errorSkill: targets.flatMap((target) => target?.skillIds ?? [])[0],
  };
}

/** Literal constraints support feedback, not an automatic grammatical diagnosis. */
export function shortAnswerFeedback(
  exercise: Exercise,
  answer: string,
): string | undefined {
  if (
    exercise.taskLine !== 9 ||
    !exercise.shortAnswerConstraints?.requiredWords.length
  )
    return;
  const normalize = (value: string) =>
    value.trim().toLocaleLowerCase("ru").replace(/ё/gu, "е");
  const constraints = exercise.shortAnswerConstraints;
  if (
    constraints.unchangedPhrase &&
    constraints.transformation &&
    normalize(answer).replace(/\s/gu, "") ===
      normalize(constraints.unchangedPhrase).replace(/\s/gu, "")
  )
    return (
      "Вы повторили исходное словосочетание «" +
      constraints.unchangedPhrase +
      "» без преобразования. По условию замените связь «" +
      constraints.transformation.from +
      "» на «" +
      constraints.transformation.to +
      "», сохранив главное слово «" +
      constraints.requiredWords.join("», «") +
      "». Изменить только порядок слов недостаточно."
    );
  const words = normalize(answer).split(/\s+/u);
  // Exam answer strings may legitimately omit spaces; do not infer a missing word there.
  if (words.length < 2) return;
  const missing = exercise.shortAnswerConstraints.requiredWords.filter(
    (word) => !words.includes(normalize(word)),
  );
  if (missing.length)
    return (
      "В вашем ответе не найдено исходное главное слово «" +
      missing.join("», «") +
      "». В этой замене сохраните его без изменения и проверьте зависимое слово. Это проверка указанного ограничения, а не полный разбор грамматической ошибки."
    );
}
