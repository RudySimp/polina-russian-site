import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { courseIssues } from "../scripts/lib/oge-course-integrity";
import { courseModules, modulePath } from "../apps/showcase/src/content/course";
import {
  courseModuleFor,
  resetCourseLoads,
} from "../apps/showcase/src/content/course-load";
import {
  chooseCoursePractice,
  courseReadingCount,
} from "../apps/showcase/src/content/course-practice";
import { exerciseIndex, topics } from "../apps/showcase/src/content/catalog";
import { lessons } from "../apps/showcase/src/content/library";
import { routeMetadata } from "../apps/showcase/src/route-metadata";
import { routes } from "../apps/showcase/src/routes";
import subskills from "../apps/showcase/src/content/subskills.json";
const source = [
  ...JSON.parse(readFileSync("content/oge-course.json", "utf8")).modules,
  ...JSON.parse(readFileSync("content/oge-theory-modules.json", "utf8"))
    .modules,
];
describe("A module is a bounded view of a current source, with honest progression", () => {
  it("validates prerequisites, exact section references, review labels, answers and routes", () => {
    expect(
      courseIssues(courseModules, source, lessons, topics, subskills),
    ).toEqual([]);
    for (const entry of courseModules) {
      expect(routes).toContain(modulePath(entry.id));
      expect(routeMetadata(modulePath(entry.id)).title).toContain(entry.title);
      expect(entry.sectionIds.length).toBeLessThanOrEqual(6);
    }
  });
  it("detects a prerequisite cycle and missing source paragraph", () => {
    const changed = structuredClone(courseModules);
    changed[0].prerequisiteIds = [changed[1].id];
    changed[1].prerequisiteIds = [changed[0].id];
    changed[0].sectionIds = ["missing"];
    expect(
      courseIssues(changed, source, lessons, topics, subskills).join(" "),
    ).toContain("prerequisite cycle");
    expect(
      courseIssues(changed, source, lessons, topics, subskills).join(" "),
    ).toContain("missing paragraph");
  });
  it("rejects an impossible checkpoint instead of publishing an unanswerable card", () => {
    const changed = structuredClone(source);
    changed[0].checkpoint.answer = 0;
    expect(
      courseIssues(courseModules, changed, lessons, topics, subskills),
    ).toContain(changed[0].id + ": checkpoint answer outside options");
  });
  it("loads a shared chapter once and retains historical lesson IDs and revisions", async () => {
    resetCourseLoads();
    const first = courseModuleFor("osnova-subject");
    expect(courseModuleFor("osnova-subject")).toBe(first);
    const a = await first,
      b = await courseModuleFor("osnova-predicate");
    expect(a.lesson).toBe(b.lesson);
    expect(a.lesson.id).toBe(lessons.find((l) => l.topicId === "osnova")!.id);
    expect(a.lesson.revision).toBe(
      lessons.find((l) => l.topicId === "osnova")!.revision,
    );
    expect(a.checkpoint?.type).toBe("checkpoint");
  });
  it("retains rejected promises until explicit reset, preventing React retry loops", async () => {
    const first = courseModuleFor("unknown");
    await expect(first).rejects.toThrow();
    expect(courseModuleFor("unknown")).toBe(first);
    resetCourseLoads();
    const second = courseModuleFor("unknown");
    expect(second).not.toBe(first);
    await expect(second).rejects.toThrow();
  });
  it("counts only the module paragraphs without rewriting compatible chapter reading state", () => {
    const entry = courseModules.find((m) => m.id === "osnova-subject")!;
    const read = {
      read: ["concept", "subject-forms", "predicates"],
      last: "predicates",
    };
    const keys: string[] = [];
    const storage = {
      getItem: (key: string) => {
        keys.push(key);
        return JSON.stringify(read);
      },
    };
    expect(courseReadingCount(entry, storage)).toBe(2);
    expect(keys).toEqual([
      "polina-lesson-state-v2:" +
        entry.sourceLessonId +
        "@" +
        entry.sourceLessonRevision +
        ":reading",
    ]);
    expect(read.read).toEqual(["concept", "subject-forms", "predicates"]);
  });
  it("keeps answers and full lesson bodies out of the descriptor index", () => {
    expect(
      courseModules.every((m) => !("lesson" in m) && !("checkpoint" in m)),
    ).toBe(true);
    expect(
      source
        .filter((m) => m.kind === "chapter-sections")
        .every((m) => !("lesson" in m)),
    ).toBe(true);
  });
});
describe("New practice follows actual attempts in the current revision", () => {
  const candidates = exerciseIndex
    .filter((e) => e.exam === "OGE" && e.topicId === "osnova")
    .slice(0, 3);
  const attempt = (index: number, revision = candidates[index].revision) => ({
    exerciseId: candidates[index].id,
    revision,
    createdAt: "2026-10-15T02:00:00Z",
    results: [{ status: "correct" }],
  });
  it("moves to an unattempted example after the first one was solved", () => {
    const initial = chooseCoursePractice(candidates, []).exercise!;
    const selected = chooseCoursePractice(candidates, [
      { ...attempt(0), exerciseId: initial.id, revision: initial.revision },
    ]);
    expect(selected.fresh).toBe(true);
    expect(selected.exercise!.id).not.toBe(initial.id);
  });
  it("uses the least attempted example after all examples have been seen", () => {
    const selected = chooseCoursePractice(candidates, [
      attempt(0),
      attempt(0),
      attempt(1),
      attempt(2),
      attempt(2),
    ]);
    expect(selected).toMatchObject({
      fresh: false,
      exercise: { id: candidates[1].id },
    });
  });
  it("does not treat obsolete revisions or format errors as solved examples", () => {
    expect(
      chooseCoursePractice(
        [candidates[0]],
        [attempt(0, candidates[0].revision - 1)],
      ).fresh,
    ).toBe(true);
    expect(
      chooseCoursePractice(
        [candidates[0]],
        [{ ...attempt(0), results: [{ status: "format_error" }] }],
      ).fresh,
    ).toBe(true);
  });
});
