import { collections } from "./exercise-loaders";
import type { Exercise } from "./model";
// React use() must observe the same rejected promise; retries reset explicitly.
const cached = new Map<number, Promise<Exercise[]>>();
const lineCache = new Map<number, Promise<Exercise[]>>();
let all: Promise<Exercise[]> | undefined;
const exerciseCache = new Map<string, Promise<Exercise | undefined>>();
const batchCache = new Map<string, Promise<Exercise[]>>();
const collectionForId = new Map(
  collections.flatMap((collection, index) =>
    collection.ids.map((id) => [id, index] as const),
  ),
);
function loadCollection(index: number) {
  if (!cached.has(index)) cached.set(index, collections[index].load());
  return cached.get(index)!;
}
export function resetContentLoaders() {
  cached.clear();
  lineCache.clear();
  exerciseCache.clear();
  batchCache.clear();
  all = undefined;
}
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
export function loadExercise(id: string): Promise<Exercise | undefined> {
  if (!exerciseCache.has(id)) {
    const index = collectionForId.get(id);
    exerciseCache.set(
      id,
      index === undefined
        ? Promise.resolve(undefined)
        : loadCollection(index).then((values) =>
            values.find((e) => e.id === id),
          ),
    );
  }
  return exerciseCache.get(id)!;
}
export function loadExercises(ids: string[]): Promise<Exercise[]> {
  const key = [...new Set(ids)].sort().join("|");
  if (!batchCache.has(key)) {
    const wanted = new Set(ids);
    const indexes = new Set(
      ids
        .map((id) => collectionForId.get(id))
        .filter((i): i is number => i !== undefined),
    );
    batchCache.set(
      key,
      Promise.all([...indexes].map(loadCollection)).then((groups) =>
        groups.flat().filter((e) => wanted.has(e.id)),
      ),
    );
  }
  return batchCache.get(key)!;
}
export function loadAllExercises(): Promise<Exercise[]> {
  return (all ??= Promise.all(
    collections.map((_, i) => loadCollection(i)),
  ).then((groups) => groups.flat()));
}
