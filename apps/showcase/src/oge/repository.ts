import type { PracticeSession } from "./model";
import {
  applySessionState,
  listSessions,
  parseSession,
  parseSessionSummary,
  readSession,
  saveSession,
  sessionState,
  sessionSummary,
  SessionStorageError,
  type SessionSummary,
} from "./storage";

const databaseName = "polina-oge-works-v2";
let database: Promise<IDBDatabase> | undefined;
function openDatabase(): Promise<IDBDatabase> {
  if (database) return database;
  database = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB недоступен"));
      return;
    }
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      for (const name of ["snapshots", "drafts", "index", "revisions"])
        if (!request.result.objectStoreNames.contains(name))
          request.result.createObjectStore(name);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        database = undefined;
      };
      resolve(db);
    };
    request.onerror = () =>
      reject(request.error ?? new Error("Не удалось открыть хранилище"));
    request.onblocked = () =>
      reject(
        new Error("Закройте старую вкладку, блокирующую обновление хранилища"),
      );
  }).catch((error) => {
    database = undefined;
    throw error;
  });
  return database!;
}
function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function committed(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Запись прервана"));
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("Не удалось записать работу"));
  });
}
function localWork(id: string) {
  try {
    return readSession(window.localStorage, id);
  } catch {
    return undefined;
  }
}
function newest(a?: PracticeSession, b?: PracticeSession) {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}
function announce(id: string) {
  window.dispatchEvent(new CustomEvent("polina-session-saved", { detail: id }));
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel("polina-oge-work-changes");
    channel.postMessage(id);
    channel.close();
  }
}
export async function readSessionDurably(
  id: string,
): Promise<PracticeSession | undefined> {
  const legacy = localWork(id);
  try {
    const db = await openDatabase(),
      transaction = db.transaction(["snapshots", "drafts"], "readonly");
    const [base, state] = await Promise.all([
      requestValue(transaction.objectStore("snapshots").get(id)),
      requestValue(transaction.objectStore("drafts").get(id)),
    ]);
    const checked = base ? parseSession(JSON.stringify(base)) : undefined;
    const stored =
      checked && state ? applySessionState(checked, state) : checked;
    const result = newest(legacy, stored);
    if (legacy && (!stored || legacy.updatedAt > stored.updatedAt)) {
      // A migration copies data. It never clears or rewrites the original v1 record.
      await writeDatabase(legacy, stored?.updatedAt);
    }
    return result;
  } catch {
    return legacy;
  }
}
async function writeDatabase(
  session: PracticeSession,
  previousUpdatedAt?: string,
) {
  if (!applySessionState(session, sessionState(session)))
    throw new SessionStorageError(
      "invalid",
      "Состояние работы не прошло проверку. Текущие ответы остаются на странице.",
    );
  const db = await openDatabase();
  const transaction = db.transaction(
    ["snapshots", "drafts", "index", "revisions"],
    "readwrite",
  );
  const finish = committed(transaction);
  const draftStore = transaction.objectStore("drafts");
  let conflict = false;
  await new Promise<void>((resolve, reject) => {
    const request = draftStore.get(session.id);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const existing = request.result;
      if (
        existing &&
        previousUpdatedAt &&
        existing.updatedAt !== previousUpdatedAt
      ) {
        conflict = true;
        transaction.abort();
        resolve();
        return;
      }
      const keyRequest = transaction
        .objectStore("snapshots")
        .getKey(session.id);
      keyRequest.onerror = () => reject(keyRequest.error);
      keyRequest.onsuccess = () => {
        if (keyRequest.result === undefined)
          transaction.objectStore("snapshots").put(session, session.id);
        // Recovery checkpoints are separate from the immutable assignment snapshot.
        if (
          existing &&
          (session.completedAt ||
            Date.parse(session.updatedAt) -
              Date.parse(existing.checkpointAt ?? session.startedAt) >=
              60000)
        ) {
          transaction
            .objectStore("revisions")
            .put(existing, `${session.id}:${existing.updatedAt}`);
        }
        const state = sessionState(session);
        draftStore.put(
          {
            ...state,
            checkpointAt:
              session.completedAt ||
              !existing ||
              Date.parse(session.updatedAt) -
                Date.parse(existing.checkpointAt ?? session.startedAt) >=
                60000
                ? session.updatedAt
                : existing.checkpointAt,
          },
          session.id,
        );
        transaction
          .objectStore("index")
          .put(sessionSummary(session), session.id);
        resolve();
      };
    };
  });
  try {
    await finish;
  } catch (error) {
    if (conflict)
      throw new SessionStorageError(
        "conflict",
        "В другой вкладке уже сохранена новая редакция. Текущие ответы остаются на странице.",
        await readSessionDurably(session.id),
      );
    throw error;
  }
}
export async function saveSessionDurably(
  session: PracticeSession,
  previousUpdatedAt?: string,
): Promise<void> {
  const local = localWork(session.id);
  if (local && previousUpdatedAt && local.updatedAt > previousUpdatedAt)
    throw new SessionStorageError(
      "conflict",
      "В другой вкладке сохранена новая редакция. Сохраните обе версии или отдельный черновик.",
      local,
    );
  try {
    await writeDatabase(session, previousUpdatedAt);
  } catch (error) {
    if (error instanceof SessionStorageError && error.code === "conflict")
      throw error;
    // Browsers that deny IndexedDB retain the compatible, split localStorage path.
    saveSession(window.localStorage, session, previousUpdatedAt);
    announce(session.id);
    return;
  }
  // Mirror for older routes/tabs. A failed mirror does not undo a committed IDB write.
  try {
    saveSession(window.localStorage, session, local?.updatedAt);
  } catch {
    /* Durable IndexedDB still holds every answer. */
  }
  announce(session.id);
}
export async function listSessionsDurably(): Promise<PracticeSession[]> {
  const works = new Map<string, PracticeSession>();
  try {
    for (const work of listSessions(window.localStorage))
      works.set(work.id, work);
  } catch {
    /* IDB may still be readable. */
  }
  try {
    const db = await openDatabase(),
      ids = await requestValue(
        db.transaction("index", "readonly").objectStore("index").getAllKeys(),
      );
    for (const id of ids) {
      const work = await readSessionDurably(String(id));
      if (work) works.set(work.id, work);
    }
  } catch {
    /* Legacy works remain accessible. */
  }
  return [...works.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
export async function listSessionSummariesDurably(): Promise<SessionSummary[]> {
  const { listSessionSummaries } = await import("./storage");
  const summaries = new Map<string, SessionSummary>();
  try {
    for (const summary of listSessionSummaries(window.localStorage))
      summaries.set(summary.id, summary);
  } catch {
    /* IDB may be available. */
  }
  try {
    const db = await openDatabase(),
      values: SessionSummary[] = await requestValue(
        db.transaction("index", "readonly").objectStore("index").getAll(),
      );
    for (let summary of values) {
      if (!parseSessionSummary(summary)) {
        const session = await readSessionDurably(summary.id);
        if (!session) continue;
        summary = sessionSummary(session);
        try {
          const transaction = db.transaction("index", "readwrite"),
            finish = committed(transaction);
          transaction.objectStore("index").put(summary, summary.id);
          await finish;
        } catch {
          /* Keep the rebuilt in-memory index when writing is denied. */
        }
      }
      const old = summaries.get(summary.id);
      if (!old || summary.updatedAt > old.updatedAt)
        summaries.set(summary.id, summary);
    }
  } catch {
    /* Use the compatible index. */
  }
  return [...summaries.values()].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
}
export async function deleteSessionDurably(id: string) {
  const { deleteSession } = await import("./storage");
  let db: IDBDatabase | undefined;
  try {
    db = await openDatabase();
  } catch {
    /* Fall back when this browser denies IndexedDB. */
  }
  if (db) {
    const transaction = db.transaction(
        ["snapshots", "drafts", "index", "revisions"],
        "readwrite",
      ),
      finish = committed(transaction);
    for (const name of ["snapshots", "drafts", "index"])
      transaction.objectStore(name).delete(id);
    const cursor = transaction
      .objectStore("revisions")
      .openCursor(IDBKeyRange.bound(`${id}:`, `${id}:\uffff`));
    cursor.onsuccess = () => {
      const value = cursor.result;
      if (value) {
        value.delete();
        value.continue();
      }
    };
    await finish;
  }
  deleteSession(window.localStorage, id);
  announce(id);
}

/** Checkpoints remain attached to the immutable assignment revision. */
export async function sessionRevisions(id: string): Promise<PracticeSession[]> {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(["snapshots", "revisions"], "readonly");
    const [base, states] = await Promise.all([
      requestValue(transaction.objectStore("snapshots").get(id)),
      requestValue(
        transaction
          .objectStore("revisions")
          .getAll(IDBKeyRange.bound(`${id}:`, `${id}:\uffff`)),
      ),
    ]);
    const snapshot = base ? parseSession(JSON.stringify(base)) : undefined;
    if (!snapshot) return [];
    return states
      .flatMap((state) => {
        const session = applySessionState(snapshot, state);
        return session ? [session] : [];
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}
