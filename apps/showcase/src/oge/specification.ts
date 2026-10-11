import data from "./specification.json" with { type: "json" };
import type { ExamSpecification } from "./model";
export const specification = data as ExamSpecification;
export const taskLines = specification.lines;
export const testLines = taskLines.filter(
  (line) => line.response !== "extended",
);
export const lineFor = (number: number) =>
  taskLines.find((line) => line.number === number);
export const modelLabel = "ОГЭ-2027 · проект ФИПИ";
