import type {
  Lesson,
  LessonBlock,
  Topic,
} from "../../apps/showcase/src/content/model";
import type { CourseModuleDescriptor } from "../../apps/showcase/src/content/course-model";
type SourceModule = {
  id: string;
  lesson?: Lesson;
  checkpoint?: LessonBlock;
  sectionIds?: string[];
  kind?: string;
  [key: string]: unknown;
};
export function courseIssues(
  modules: CourseModuleDescriptor[],
  source: SourceModule[],
  lessons: Lesson[],
  topics: Topic[],
  skills: { id: string }[],
  references: {
    sourceId: string;
    sha256: string;
    physicalPages: number;
  }[] = [],
) {
  const issues: string[] = [];
  const ids = new Set(modules.map((m) => m.id));
  if (ids.size !== modules.length) issues.push("duplicate module id");
  const visited = new Set<string>(),
    visiting = new Set<string>();
  function walk(id: string) {
    if (visiting.has(id)) {
      issues.push(id + ": prerequisite cycle");
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    for (const next of modules.find((m) => m.id === id)?.prerequisiteIds ?? [])
      walk(next);
    visiting.delete(id);
    visited.add(id);
  }
  for (const m of modules) {
    if (!topics.some((t) => t.id === m.topicId && t.examTags.includes("OGE")))
      issues.push(m.id + ": unknown OGE topic");
    if (
      !m.title ||
      !m.outcome ||
      !m.ogeLines.length ||
      m.ogeLines.some((n) => !Number.isInteger(n) || n < 1 || n > 13)
    )
      issues.push(m.id + ": incomplete descriptor");
    if (m.prerequisiteIds.some((id) => !ids.has(id)))
      issues.push(m.id + ": unknown prerequisite");
    if (m.skillIds.some((id) => !skills.some((s) => s.id === id)))
      issues.push(m.id + ": unknown skill");
    if (m.review !== "checked-demo" || m.teacherApproval !== "pending")
      issues.push(m.id + ": unconfirmed review label");
    const original = source.find((s) => s.id === m.id);
    const lesson =
      m.kind === "chapter-sections"
        ? lessons.find((l) => l.topicId === m.topicId)
        : original?.lesson;
    if (!lesson) {
      issues.push(m.id + ": missing lesson");
      continue;
    }
    if (
      m.sourceLessonId !== lesson.id ||
      m.sourceLessonRevision !== lesson.revision
    )
      issues.push(m.id + ": stale source revision");
    const selected = lesson.sections.filter((s) => m.sectionIds.includes(s.id));
    if (
      selected.length !== m.sectionIds.length ||
      !selected.length ||
      selected.some((s) => !s.blocks.length)
    )
      issues.push(m.id + ": missing paragraph");
    const blocks = [
      ...selected.flatMap((s) => s.blocks),
      ...(original?.checkpoint ? [original.checkpoint] : []),
    ];
    for (const block of blocks) {
      if (
        block.type === "checkpoint" &&
        (!Number.isInteger(block.answer) ||
          block.answer < 1 ||
          block.answer > block.options.length)
      )
        issues.push(m.id + ": checkpoint answer outside options");
      if (
        block.type === "table" &&
        block.rows.some((row) => row.length !== block.headers.length)
      )
        issues.push(m.id + ": uneven table");
      if (block.type === "interactive")
        for (const ex of block.data.examples)
          if (
            !ex.expected.length ||
            ex.expected.some(
              (n) => n < 1 || n > (ex.options ?? ex.tokens ?? []).length,
            )
          )
            issues.push(m.id + ": interactive answer outside options");
    }
    if (
      !blocks.some((b) => b.type === "checkpoint" || b.type === "interactive")
    )
      issues.push(m.id + ": no independent action");
    for (const p of m.prerequisitePaths) {
      const match = p.route.match(/^\/theory\/([^/]+)\/.*#([^#]+)$/);
      if (
        !match ||
        !lessons.some(
          (l) =>
            l.topicId === match[1] && l.sections.some((s) => s.id === match[2]),
        )
      )
        issues.push(m.id + ": unknown prerequisite anchor");
    }
    if (m.kind === "original")
      for (const s of m.sources ?? []) {
        const ref = references.find((r) => r.sourceId === s.sourceId);
        if (
          !Number.isInteger(s.pdfPage) ||
          s.pdfPage < 1 ||
          !/^[-a-f0-9]{64}$/.test(s.sourceSha256) ||
          (references.length > 0 &&
            (!ref ||
              ref.sha256 !== s.sourceSha256 ||
              s.pdfPage > ref.physicalPages))
        )
          issues.push(m.id + ": invalid physical source receipt");
      }
    walk(m.id);
  }
  return issues;
}
