import type { ActivitySituation, InteractiveActivity } from "./model";
import type { GameDraft, GameRecord, HistoricGameRecord } from "./game-storage";
export function nextGameControl(
  activity: InteractiveActivity,
  source: ActivitySituation,
  history: Pick<GameRecord, "activityId" | "situationId" | "revision">[],
  historic: Pick<HistoricGameRecord, "activityId" | "situationId">[],
  draftFor: (situation: ActivitySituation) => GameDraft | undefined,
) {
  const candidates = activity.situations
    .map((situation, index) => ({ situation, index }))
    .filter(
      ({ situation }) =>
        situation.id !== source.id &&
        !draftFor(situation) &&
        !history.some(
          (r) =>
            r.activityId === activity.id &&
            r.situationId === situation.id &&
            r.revision === (situation.revision ?? 1),
        ) &&
        !historic.some(
          (r) => r.activityId === activity.id && r.situationId === situation.id,
        ),
    );
  const specific = (source.skillIds ?? []).filter((s) => /^OGE:\d+\./u.test(s));
  const matched = (situation: ActivitySituation) =>
    specific.filter((s) => situation.skillIds?.includes(s));
  const selected =
    candidates.find((c) => matched(c.situation).length) ?? candidates[0];
  return selected
    ? { ...selected, matchedSkillIds: matched(selected.situation) }
    : undefined;
}
