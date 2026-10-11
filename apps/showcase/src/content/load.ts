import { collections } from "./exercise-loaders";
import type { Exercise } from "./model";
const cached = new Map<number, Promise<Exercise[]>>();
function loadCollection(index: number) {
  if (!cached.has(index)) cached.set(index, collections[index].load());
  return cached.get(index)!;
}
const lineCache = new Map<number, Promise<Exercise[]>>();
export function loadLine(line: number): Promise<Exercise[]> {
  if (!lineCache.has(line))
    lineCache.set(
      line,
      Promise.all(
        collections.flatMap((c, i) =>
          c.lines.includes(line) ? [loadCollection(i)] : [],
        ),
      ).then((groups) =>
        groups.flat().filter((e) => e.exam === "OGE" && e.taskLine === line),
      ),
    );
  return lineCache.get(line)!;
}
export async function loadExercise(id: string): Promise<Exercise | undefined> {
  const index = collections.findIndex((c) => c.ids.includes(id));
  return index < 0
    ? undefined
    : (await loadCollection(index)).find((e) => e.id === id);
}
let all: Promise<Exercise[]> | undefined;
export function loadAllExercises(): Promise<Exercise[]> {
  return (all ??= Promise.all(
    collections.map((_, i) => loadCollection(i)),
  ).then((groups) => groups.flat()));
}
