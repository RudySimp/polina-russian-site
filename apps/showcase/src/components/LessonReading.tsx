import type { Lesson } from "../content/model";
import { useLessonState } from "../lib/lesson-state";
import { LessonBlocks } from "./LessonBlocks";
type ReadingProgress = { read: string[]; last?: string };
export function LessonReading({
  lesson,
  sectionIds,
}: {
  lesson: Lesson;
  sectionIds?: string[];
}) {
  const visibleSections = sectionIds
    ? sectionIds.flatMap((id) => {
        const section = lesson.sections.find((s) => s.id === id);
        return section ? [section] : [];
      })
    : lesson.sections;
  const [state, update, error] = useLessonState<ReadingProgress>(
    lesson.id + "@" + lesson.revision + ":reading",
    { read: [] },
    (v): v is ReadingProgress => {
      if (!v || typeof v !== "object") return false;
      const x = v as ReadingProgress;
      return (
        Array.isArray(x.read) &&
        x.read.length <= lesson.sections.length &&
        x.read.every(
          (id) =>
            typeof id === "string" && lesson.sections.some((s) => s.id === id),
        ) &&
        (!x.last || lesson.sections.some((s) => s.id === x.last))
      );
    },
  );
  return (
    <>
      <div className="lesson-reading-progress">
        <p>
          Отмечено прочитанным:{" "}
          {
            state.read.filter((id) => visibleSections.some((s) => s.id === id))
              .length
          }{" "}
          из {visibleSections.length} параграфов.
          {state.last && visibleSections.some((s) => s.id === state.last) && (
            <>
              {" "}
              <a href={"#" + state.last}>Продолжить чтение</a>
            </>
          )}
        </p>
        {error && <p role="status">Отметки чтения не сохранены в браузере.</p>}
      </div>
      {visibleSections.map((section, n) => (
        <section id={section.id} className="lesson-section" key={section.id}>
          <h2>{section.title}</h2>
          <LessonBlocks
            blocks={section.blocks}
            scope={lesson.id + "@" + lesson.revision + ":" + section.id}
          />
          <button
            className="text-button"
            aria-pressed={state.read.includes(section.id)}
            onClick={() => {
              const read = state.read.includes(section.id)
                ? state.read.filter((id) => id !== section.id)
                : [...state.read, section.id];
              update({
                read,
                last: visibleSections[
                  Math.min(n + 1, visibleSections.length - 1)
                ].id,
              });
            }}
          >
            {state.read.includes(section.id)
              ? "Прочитано · снять отметку"
              : "Отметить параграф прочитанным"}
          </button>
        </section>
      ))}
    </>
  );
}
