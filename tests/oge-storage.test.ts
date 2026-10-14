import { describe, expect, it } from "vitest";
import { exercises } from "../apps/showcase/src/content/registry";
import { createSession, itemId } from "../apps/showcase/src/oge/engine";
import { SessionDraft } from "../apps/showcase/src/oge/draft";
import {
  advanceSession,
  readSession,
  listSessionSummaries,
  parseSessionSummary,
  saveSession,
} from "../apps/showcase/src/oge/storage";
import {
  exportSessions,
  importSessions,
} from "../apps/showcase/src/oge/backup";

function fixture() {
  const values = new Map<string, string>();
  let fail = false;
  const store = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      if (fail) throw new DOMException("Full", "QuotaExceededError");
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    key: (n: number) => [...values.keys()][n] ?? null,
    get length() {
      return values.size;
    },
  };
  const session = createSession(
    exercises
      .filter((e) => e.taskLine === 8)
      .slice(0, 1)
      .map((exercise) => ({ kind: "exercise" as const, exercise })),
    { texts: [], audio: [], exercises, writing: [] },
    {
      title: "Восстановление черновика",
      kind: "practice",
      mode: "learn",
      seed: "storage",
    },
  );
  saveSession(store, session);
  return {
    store,
    session,
    fail: (value: boolean) => {
      fail = value;
    },
  };
}
describe("Восстановление и резервные копии работ ОГЭ", () => {
  it("отложенная старая запись не заменяет более новый текст, сохранённый при уходе", async () => {
    const { store, session } = fixture(),
      id = itemId(session.items[0]);
    const draft = new SessionDraft(session);
    draft.edit({ answers: { [id]: "Старая редакция" } });
    const older = draft.current;
    let release: (() => void) | undefined;
    const pending = draft.saveAsync(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    draft.edit({ answers: { [id]: "Новая редакция со следующей фразой" } });
    expect(
      draft.save((value, previous) => saveSession(store, value, previous)),
    ).toBe(true);
    expect(() => saveSession(store, older)).toThrow("другой вкладке");
    release!();
    expect(await pending).toBe(true);
    expect(draft.dirty).toBe(false);
    expect(readSession(store, session.id)?.answers[id]).toBe(
      "Новая редакция со следующей фразой",
    );
  });

  it("старый компактный индекс перестраивается до версии 2, повреждённая статистика не принимается", () => {
    const { store, session } = fixture();
    const key = "polina-oge-index-v2:" + session.id;
    const legacy = JSON.parse(store.getItem(key)!);
    delete legacy.historyVersion;
    delete legacy.exerciseRefs[0].sourceTextId;
    store.setItem(key, JSON.stringify(legacy));
    const summaries = listSessionSummaries(store);
    expect(summaries).toHaveLength(1);
    expect(summaries[0].historyVersion).toBe(2);
    expect(JSON.parse(store.getItem(key)!).historyVersion).toBe(2);
    expect(
      parseSessionSummary({ ...summaries[0], answerCount: 2000 }),
    ).toBeUndefined();
    expect(
      parseSessionSummary({
        ...summaries[0],
        exerciseRefs: [{ ...summaries[0].exerciseRefs[0], revision: -1 }],
      }),
    ).toBeUndefined();
  });

  it("успешная запись при уходе не становится ошибкой из-за более позднего отказа той же асинхронной записи", async () => {
    const { store, session } = fixture(),
      id = itemId(session.items[0]);
    const draft = new SessionDraft(session);
    let rejectWrite: ((reason: Error) => void) | undefined;
    draft.edit({ answers: { [id]: "Текст сохранён при уходе" } });
    const pending = draft.saveAsync(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectWrite = reject;
        }),
    );
    expect(
      draft.save((value, previous) => saveSession(store, value, previous)),
    ).toBe(true);
    rejectWrite!(new Error("Асинхронная запись прервана при уходе"));
    expect(await pending).toBe(true);
    expect(draft.error).toBe("");
    expect(draft.dirty).toBe(false);
    expect(readSession(store, session.id)?.answers[id]).toBe(
      "Текст сохранён при уходе",
    );
  });

  it("P0-04: отказ записи → новый ввод → восстановление → retry сохраняют весь текст без ложного конфликта", () => {
    const { store, session, fail } = fixture();
    const draft = new SessionDraft(session),
      id = itemId(session.items[0]);
    const write = (next: typeof session, previous: string) =>
      saveSession(store, next, previous);
    fail(true);
    draft.edit({ answers: { [id]: "Длинный черновик ".repeat(900) } });
    expect(draft.save(write)).toBe(false);
    expect(draft.saved.updatedAt).toBe(session.updatedAt);
    expect(draft.remote).toBeUndefined();
    draft.edit({
      answers: { [id]: draft.current.answers[id] + "Последняя фраза." },
    });
    expect(draft.save(write)).toBe(false);
    expect(draft.dirty).toBe(true);
    fail(false);
    expect(draft.save(write)).toBe(true);
    expect(draft.error).toBe("");
    expect(draft.dirty).toBe(false);
    expect(readSession(store, session.id)?.answers[id]).toBe(
      draft.current.answers[id],
    );
  });
  it("реальный конфликт оставляет обе редакции, чистая вкладка получает новую запись", () => {
    const { store, session } = fixture(),
      id = itemId(session.items[0]);
    const dirty = new SessionDraft(session),
      clean = new SessionDraft(session);
    dirty.edit({ answers: { [id]: "Мой текст" } });
    const remote = advanceSession(session, {
      answers: { [id]: "Текст другой вкладки" },
    });
    saveSession(store, remote, session.updatedAt);
    expect(
      dirty.save((value, previous) => saveSession(store, value, previous)),
    ).toBe(false);
    expect(dirty.current.answers[id]).toBe("Мой текст");
    expect(dirty.remote?.answers[id]).toBe("Текст другой вкладки");
    clean.receive(remote);
    expect(clean.current).toEqual(remote);
    expect(clean.dirty).toBe(false);
    expect(readSession(store, session.id)?.answers[id]).toBe(
      "Текст другой вкладки",
    );
  });
  it("резервный файл сохраняет снимки и ответы, повреждённый импорт отклоняется до записи", () => {
    const { session } = fixture();
    const original = advanceSession(session, {
      answers: { [itemId(session.items[0])]: "Текст" },
    });
    expect(importSessions(exportSessions([original]))).toEqual([original]);
    expect(() =>
      importSessions(
        '{"format":"polina-oge-backup","version":2,"sessions":[]}',
      ),
    ).toThrow("версия");
    const corrupt = JSON.parse(exportSessions([original]));
    corrupt.sessions[0].items[0].exercise.revision = -1;
    expect(() => importSessions(JSON.stringify(corrupt))).toThrow(
      "Импорт не начат",
    );
    expect(() => importSessions("not-json")).toThrow("JSON");
  });
  it("повторный ввод меняет только state, неизменный снимок записывается один раз", () => {
    const { store, session } = fixture();
    const raw = store.getItem("polina-oge-work-v1:" + session.id);
    let current = session;
    for (let n = 0; n < 20; n++) {
      const previous = current.updatedAt;
      current = advanceSession(current, {
        answers: { [itemId(current.items[0])]: "Ответ " + n },
      });
      saveSession(store, current, previous);
    }
    expect(store.getItem("polina-oge-work-v1:" + session.id)).toBe(raw);
    const mutable = JSON.parse(
      store.getItem("polina-oge-state-v2:" + session.id)!,
    );
    expect(mutable.state).not.toHaveProperty("items");
    expect(mutable.state.answers).toEqual(current.answers);
    expect(readSession(store, session.id)?.answers).toEqual(current.answers);
  });
  it("асинхронная запись не теряет изменения, введённые пока предыдущая запись выполняется", async () => {
    const { session } = fixture(),
      id = itemId(session.items[0]);
    const draft = new SessionDraft(session);
    let release: (() => void) | undefined;
    draft.edit({ answers: { [id]: "Первая фраза" } });
    const first = draft.current;
    const pending = draft.saveAsync(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    draft.edit({ answers: { [id]: "Первая фраза и новый абзац" } });
    release!();
    expect(await pending).toBe(true);
    expect(draft.saved.updatedAt).toBe(first.updatedAt);
    expect(draft.current.answers[id]).toBe("Первая фраза и новый абзац");
    expect(draft.dirty).toBe(true);
    expect(await draft.saveAsync(async () => {})).toBe(true);
    expect(draft.dirty).toBe(false);
    draft.receive(first);
    expect(draft.current.answers[id]).toBe("Первая фраза и новый абзац");
  });
});
