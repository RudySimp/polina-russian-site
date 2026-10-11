import type {
  AudioMaterial,
  ExamVariant,
  SourceText,
  WritingAssignment,
  InteractiveActivity,
} from "./model";
import { loadAllExercises } from "../content/load";
let original:
  | Promise<{
      texts: SourceText[];
      audio: AudioMaterial[];
      writing: WritingAssignment[];
      variants: ExamVariant[];
    }>
  | undefined;
export function loadOriginals() {
  return (original ??= import("./materials.json", {
    with: { type: "json" },
  }).then(
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
  return (activities ??= import("./activities.json", {
    with: { type: "json" },
  }).then((m) => m.default as InteractiveActivity[]));
}
