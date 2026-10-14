import type { PracticeSession } from "./model";
import { advanceSession, SessionStorageError } from "./storage";

/** The persisted version advances only after the writer confirms success. */
export class SessionDraft {
  current: PracticeSession;
  saved: PracticeSession;
  remote?: PracticeSession;
  error = "";
  pending?: Promise<boolean>;
  constructor(session: PracticeSession) {
    this.current = session;
    this.saved = session;
  }
  get dirty() {
    return this.current.updatedAt !== this.saved.updatedAt;
  }
  edit(patch: Partial<PracticeSession>) {
    this.current = advanceSession(this.current, patch);
    return this.current;
  }
  save(write: (session: PracticeSession, previousUpdatedAt: string) => void) {
    if (this.remote) return false;
    if (!this.dirty) return true;
    try {
      write(this.current, this.saved.updatedAt);
      this.saved = this.current;
      this.error = "";
      return true;
    } catch (error) {
      this.error =
        error instanceof Error ? error.message : "Не удалось сохранить ответы.";
      if (error instanceof SessionStorageError && error.code === "conflict")
        this.remote = error.remote;
      return false;
    }
  }
  async saveAsync(
    write: (
      session: PracticeSession,
      previousUpdatedAt: string,
    ) => Promise<void>,
  ): Promise<boolean> {
    if (this.pending) {
      await this.pending;
      return this.dirty && !this.remote ? this.saveAsync(write) : !this.dirty;
    }
    if (this.remote) return false;
    if (!this.dirty) return true;
    const target = this.current,
      previous = this.saved.updatedAt;
    const operation = (async () => {
      try {
        await write(target, previous);
        if (this.saved.updatedAt <= target.updatedAt) this.saved = target;
        this.error = "";
        return true;
      } catch (error) {
        if (this.saved.updatedAt >= target.updatedAt) {
          this.error = "";
          return !this.dirty;
        }
        this.error =
          error instanceof Error
            ? error.message
            : "Не удалось сохранить ответы.";
        if (error instanceof SessionStorageError && error.code === "conflict")
          this.remote = error.remote;
        return false;
      } finally {
        this.pending = undefined;
      }
    })();
    this.pending = operation;
    return operation;
  }
  receive(remote: PracticeSession) {
    if (remote.updatedAt <= this.saved.updatedAt) return;
    if (this.dirty) {
      this.remote = remote;
      this.error =
        "В другой вкладке сохранена другая редакция. Обе версии доступны: текущий текст сохраните отдельной работой или скачайте обе редакции.";
    } else {
      this.current = this.saved = remote;
      this.error = "";
      this.remote = undefined;
    }
  }
}
