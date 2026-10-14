import type {
  AudioMaterial,
  ExamVariant,
  SourceText,
  WritingAssignment,
  InteractiveActivity,
} from "./model";
import {
  loadExercises,
  loadAllExercises,
  resetContentLoaders,
} from "../content/load";
let original:
  | Promise<{
      texts: SourceText[];
      audio: AudioMaterial[];
      writing: WritingAssignment[];
      variants: ExamVariant[];
    }>
  | undefined;
export function loadOriginals() {
  return (original ??= import("./materials.json").then(
    (m) =>
      m.default as {
        texts: SourceText[];
        audio: AudioMaterial[];
        writing: WritingAssignment[];
        variants: ExamVariant[];
      },
  ));
}
let materials:
  | Promise<
      Awaited<ReturnType<typeof loadOriginals>> & {
        exercises: Awaited<ReturnType<typeof loadAllExercises>>;
      }
    >
  | undefined;
export function loadMaterials() {
  return (materials ??= Promise.all([loadOriginals(), loadAllExercises()]).then(
    ([data, exercises]) => ({ ...data, exercises }),
  ));
}
let activities: Promise<InteractiveActivity[]> | undefined;
export function loadActivities() {
  return (activities ??= import("./activities.json").then(
    (m) => m.default as InteractiveActivity[],
  ));
}

const fixedData = new Map<
  number,
  Promise<Awaited<ReturnType<typeof loadMaterials>>>
>();
export function loadFixedVariant(number: number) {
  const previous = fixedData.get(number);
  if (previous) return previous;
  const pending = loadOriginals().then(async (originals) => {
    const variant = originals.variants.find((v) => v.number === number);
    if (!variant) throw Error("Такой вариант не опубликован.");
    const exercises = await loadExercises(
      variant.assignments.map((ref) => ref.id),
    );
    return { ...originals, exercises };
  });
  fixedData.set(number, pending);
  return pending;
}

/** Explicit retry only; never discard a rejection during a React use() render. */
export function resetMaterialLoads() {
  original = undefined;
  materials = undefined;
  activities = undefined;
  fixedData.clear();
  resetContentLoaders();
}
