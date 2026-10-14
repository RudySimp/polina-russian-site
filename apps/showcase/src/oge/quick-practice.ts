import { exerciseIndex } from "../content/catalog";
import { loadExercises } from "../content/load";
import { shuffled, createSession, selectPractice } from "./engine";
import { loadOriginals } from "./materials";
import { saveSessionDurably } from "./repository";
import { href } from "../routes";
export async function startQuickPractice() {
  const seed = crypto.randomUUID();
  const selected = shuffled(
    exerciseIndex.filter(
      (e) => e.exam === "OGE" && e.taskLine === 2 && e.generationEligible,
    ),
    seed,
  ).slice(0, 5);
  if (selected.length < 5)
    throw Error("Недостаточно проверенных заданий для быстрой подборки.");
  const bank = await loadExercises(selected.map((e) => e.id)),
    originals = await loadOriginals(),
    items = selectPractice(bank, { count: 5 }, seed),
    session = createSession(
      items.map((exercise) => ({ kind: "exercise", exercise })),
      { ...originals, exercises: bank },
      {
        title: "Грамматическая основа: 5 заданий",
        kind: "practice",
        mode: "learn",
        seed,
      },
    );
  await saveSessionDurably(session);
  window.location.assign(href("/oge/practice/session/?id=" + session.id));
}
