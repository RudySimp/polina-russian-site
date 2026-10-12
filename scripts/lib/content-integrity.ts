/** Checks the final, displayed spelling task, after every editorial replacement. */
export function numberedGapIssues(
  text: string,
  answers: string[] = [],
): string[] {
  const issues: string[] = [];
  const markers = [...text.matchAll(/\((\d+)\)/gu)];
  const gaps = [
    ...text.matchAll(/([А-ЯЁа-яё]+)(?:…|\.\.\.)\((\d+)\)([А-ЯЁа-яё]*)/gu),
  ];
  if (!markers.length) issues.push("Нет пронумерованных пропусков");
  if (markers.length !== gaps.length)
    issues.push(
      "Номер должен следовать непосредственно за пропуском внутри словоформы",
    );
  const numbers = markers.map((match) => Number(match[1]));
  if (new Set(numbers).size !== numbers.length)
    issues.push("Повторён номер пропуска");
  if (numbers.some((number, index) => number !== index + 1))
    issues.push("Номера пропусков должны идти подряд с 1");
  const ellipses = [...text.matchAll(/…|\.\.\./gu)];
  if (ellipses.length !== gaps.length)
    issues.push(
      "Каждый пропуск должен иметь один номер и одну вставляемую букву",
    );
  for (const gap of gaps) {
    const preceding = text.slice(0, gap.index);
    if (/[А-ЯЁа-яё…)]$/u.test(preceding))
      issues.push(`Повреждена словоформа в позиции ${gap[2]}`);
  }
  for (const answer of answers)
    if ([...answer].some((digit) => !numbers.includes(Number(digit))))
      issues.push(`Ключ ${answer} содержит отсутствующую позицию`);
  return [...new Set(issues)];
}

export function vowelExerciseIssues(exercise: {
  text?: string;
  prompt: string;
  answers: string[];
  explanation: string;
}): string[] {
  const text = exercise.text ?? "";
  const issues = numberedGapIssues(text, exercise.answers);
  const target = exercise.prompt.match(/буква\s+([АЕЁИОУЫЭЮЯ])/u)?.[1];
  if (!target) issues.push("Не названа выбираемая гласная");
  const expected: number[] = [];
  for (const gap of text.matchAll(
    /([А-ЯЁа-яё]+)(?:…|\.\.\.)\((\d+)\)([А-ЯЁа-яё]*)/gu,
  )) {
    const detail = exercise.explanation.match(
      new RegExp(
        `(?:^|\\n)${gap[2]}\\)\\s*([А-ЯЁа-яё]+)\\s*—\\s*([АЕЁИОУЫЭЮЯ])\\.`,
        "u",
      ),
    );
    if (!detail) {
      issues.push(`Нет отдельного разбора позиции ${gap[2]}`);
      continue;
    }
    const restored = `${gap[1]}${detail[2]}${gap[3]}`.toLocaleLowerCase("ru");
    if (restored !== detail[1].toLocaleLowerCase("ru"))
      issues.push(
        `В позиции ${gap[2]} вставка буквы не даёт разобранную форму «${detail[1]}»`,
      );
    if (detail[2] === target) expected.push(Number(gap[2]));
  }
  if (
    target &&
    exercise.answers.some(
      (answer) =>
        [...answer]
          .map(Number)
          .sort((a, b) => a - b)
          .join("") !== expected.join(""),
    )
  )
    issues.push(
      "Ключ не соответствует выбранной гласной в поэлементном разборе",
    );
  return [...new Set(issues)];
}
