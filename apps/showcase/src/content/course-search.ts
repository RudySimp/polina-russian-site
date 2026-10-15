export type CourseSearchParagraph = {
  topicId: string;
  moduleId: string;
  sectionId: string;
  title: string;
  text: string;
  route: string;
};
let pending: Promise<CourseSearchParagraph[]> | undefined;
export function courseSearchFor() {
  return (pending ??= import("./course-search.json").then(
    (m) => m.default as CourseSearchParagraph[],
  ));
}
export function resetCourseSearch() {
  pending = undefined;
  allPending = undefined;
}

export type TheorySearchParagraph = {
  topicId: string;
  sectionId: string;
  title: string;
  text: string;
  route?: string;
};
let allPending: Promise<TheorySearchParagraph[]> | undefined;
export function theorySearchFor(): Promise<TheorySearchParagraph[]> {
  return (allPending ??= Promise.all([
    import("./lesson-search.json"),
    courseSearchFor(),
  ]).then(([legacy, original]) => [...legacy.default, ...original]));
}
