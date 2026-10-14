import { z } from "zod";
import type { ActivitySituation, InteractiveActivity } from "./model";
import type { LocalStorage } from "./storage";
import { checkActivity } from "./game-check";
import { wordCount } from "./engine";

const kind = z.enum([
  "foundation",
  "punctuation",
  "correction",
  "phrase",
  "matching",
  "spelling",
  "compression",
]);
const text = z.string().max(50000);
const situationSchema = z.object({
  id: z.string(),
  revision: z.number().int().positive().optional(),
  title: text,
  instruction: text,
  text,
  tokens: z.array(text).optional(),
  fields: z
    .array(
      z.object({
        id: z.string(),
        label: text,
        options: z.array(text).optional(),
        expected: z.array(text),
        explanation: text.optional(),
      }),
    )
    .min(1)
    .max(20),
  explanation: text,
  details: z.array(text),
  skillIds: z.array(z.string()).optional(),
  hint: text.optional(),
});
const draftSchema = z.object({
  schemaVersion: z.literal(2),
  activityId: z.string(),
  situationId: z.string(),
  revision: z.number().int().positive(),
  answers: z.record(z.string(), text),
  checked: z.boolean(),
  checks: z.number().int().nonnegative(),
  hintUsed: z.boolean(),
  role: z.enum(["subject", "predicate"]),
  updatedAt: z.iso.datetime(),
});
export type GameDraft = z.infer<typeof draftSchema>;
const recordSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().uuid(),
  activityId: z.string(),
  situationId: z.string(),
  revision: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  snapshot: z.object({
    kind,
    title: text,
    topicId: z.string(),
    skillId: z.string(),
    situation: situationSchema,
  }),
  answers: z.record(z.string(), text),
  firstIndependent: z.boolean(),
  assisted: z.boolean(),
});
export type GameRecord = z.infer<typeof recordSchema>;
export type GameHistoryRecord = GameRecord & {
  correct: boolean;
  informationCorrect: boolean;
  writingDraft: boolean;
  requiresExpert: boolean;
  stale: boolean;
};
export type HistoricGameRecord = {
  id: string;
  activityId: string;
  situationId: string;
  createdAt: string;
  historic: true;
};
export const gameRecordsKey = "polina-oge-games-v2";
const draftPrefix = "polina-oge-game-drafts-v2:";
function key(activityId: string, situation: ActivitySituation) {
  return `${draftPrefix}${activityId}:${situation.id}:${situation.revision ?? 1}`;
}
export function readGameDraft(
  storage: LocalStorage,
  activityId: string,
  situation: ActivitySituation,
): GameDraft | undefined {
  try {
    const parsed = draftSchema.safeParse(
      JSON.parse(storage.getItem(key(activityId, situation)) ?? "null"),
    );
    if (
      !parsed.success ||
      parsed.data.activityId !== activityId ||
      parsed.data.situationId !== situation.id ||
      parsed.data.revision !== (situation.revision ?? 1) ||
      Object.keys(parsed.data.answers).some(
        (id) => !situation.fields.some((field) => field.id === id),
      )
    )
      return undefined;
    return parsed.data;
  } catch {
    return undefined;
  }
}
export function saveGameDraft(storage: LocalStorage, draft: GameDraft) {
  draftSchema.parse(draft);
  storage.setItem(
    `${draftPrefix}${draft.activityId}:${draft.situationId}:${draft.revision}`,
    JSON.stringify(draft),
  );
  try {
    storage.setItem(
      `polina-oge-game-position-v2:${draft.activityId}`,
      `${draft.situationId}:${draft.revision}`,
    );
  } catch {
    /* The independent draft is already durably written. */
  }
}
export function makeGameDraft(
  activity: InteractiveActivity,
  situation: ActivitySituation,
): GameDraft {
  return {
    schemaVersion: 2,
    activityId: activity.id,
    situationId: situation.id,
    revision: situation.revision ?? 1,
    answers: {},
    checked: false,
    checks: 0,
    hintUsed: false,
    role: "subject",
    updatedAt: new Date().toISOString(),
  };
}
export function gameOutcome(
  kind: InteractiveActivity["kind"],
  situation: ActivitySituation,
  answers: Record<string, string>,
) {
  const informationCorrect = checkActivity(situation, answers).every(
    (result) => result.correct,
  );
  const writingDraft =
    kind === "compression" && wordCount(answers.draft ?? "") > 0;
  return {
    informationCorrect,
    writingDraft,
    requiresExpert: kind === "compression",
    correct: informationCorrect && kind !== "compression",
  };
}
/** Version metadata is sufficient; history is always graded against its own snapshot. */
export type CurrentGameVersions = readonly {
  id: string;
  situations: readonly { id: string; revision?: number }[];
}[];
export function readGameRecords(
  storage: LocalStorage,
  current?: CurrentGameVersions,
): {
  records: GameHistoryRecord[];
  historic: HistoricGameRecord[];
  damaged: number;
} {
  const records: GameHistoryRecord[] = [],
    historic: HistoricGameRecord[] = [];
  let damaged = 0;
  try {
    const raw: unknown = JSON.parse(storage.getItem(gameRecordsKey) ?? "[]");
    if (Array.isArray(raw))
      for (const value of raw) {
        const parsed = recordSchema.safeParse(value);
        if (
          !parsed.success ||
          parsed.data.snapshot.situation.id !== parsed.data.situationId ||
          (parsed.data.snapshot.situation.revision ?? 1) !==
            parsed.data.revision
        ) {
          damaged++;
          continue;
        }
        const record = parsed.data;
        const latest = current
          ?.find((activity) => activity.id === record.activityId)
          ?.situations.find((situation) => situation.id === record.situationId);
        records.push({
          ...record,
          ...gameOutcome(
            record.snapshot.kind,
            record.snapshot.situation,
            record.answers,
          ),
          stale:
            current !== undefined &&
            (!latest || (latest.revision ?? 1) !== record.revision),
        });
      }
  } catch {
    damaged++;
  }
  try {
    const raw: unknown = JSON.parse(
      storage.getItem("polina-oge-games-v1") ?? "[]",
    );
    if (Array.isArray(raw))
      for (const value of raw)
        if (
          value &&
          typeof value === "object" &&
          typeof value.activityId === "string" &&
          typeof value.situationId === "string" &&
          typeof value.createdAt === "string" &&
          Number.isFinite(Date.parse(value.createdAt))
        )
          historic.push({
            id: String(value.id ?? `${value.activityId}:${value.createdAt}`),
            activityId: value.activityId,
            situationId: value.situationId,
            createdAt: value.createdAt,
            historic: true,
          });
  } catch {
    damaged++;
  }
  return { records, historic, damaged };
}
export function saveGameRecord(storage: LocalStorage, record: GameRecord) {
  recordSchema.parse(record);
  const raw = storage.getItem(gameRecordsKey);
  const previous: unknown = raw ? JSON.parse(raw) : [];
  if (!Array.isArray(previous))
    throw new Error(
      "История тренажёров повреждена. Она сохранена без изменений; скачайте текущую попытку.",
    );
  storage.setItem(
    gameRecordsKey,
    JSON.stringify([
      ...previous.filter((value) => value?.id !== record.id),
      record,
    ]),
  );
}
