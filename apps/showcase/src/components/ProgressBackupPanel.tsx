import { useState } from "react";
import {
  downloadProgress,
  progressBackupMaxBytes,
  restoreProgress,
} from "../lib/progress-backup";
export function ProgressBackupPanel() {
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  async function restore(file: File) {
    setError("");
    setNotice("");
    setBusy(true);
    try {
      if (file.size > progressBackupMaxBytes)
        throw Error("Файл прогресса превышает 20 МБ.");
      const result = restoreProgress(localStorage, await file.text());
      setNotice(
        "Восстановлено записей: " +
          result.restored +
          ". Совпавшие или уже существующие отметки сохранены: " +
          result.skipped +
          ".",
      );
      setRestored(result.restored > 0);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось восстановить учебный прогресс.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="oge-progress-backup"
      aria-labelledby="progress-backup-title"
    >
      <h2 id="progress-backup-title">Копия учебного прогресса</h2>
      <p>
        Это отдельный файл: отметки чтения, ответы самопроверок, отдельные
        попытки, история и черновики тренажёров. Работы с письменными текстами и
        оценочными листами сохраняйте кнопкой «Скачать резервную копию всех
        работ» выше. Для полного переноса нужны оба файла.
      </p>
      <p>
        При восстановлении существующие отметки и черновики сохраняются, новые
        результаты добавляются без замены совпавших попыток.
      </p>
      <div className="inline-actions">
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => {
            setError("");
            try {
              downloadProgress(localStorage);
              setNotice("Файл учебного прогресса подготовлен.");
            } catch (reason) {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Не удалось подготовить копию.",
              );
            }
          }}
        >
          Скачать учебный прогресс
        </button>
        <label className="button secondary">
          Восстановить учебный прогресс
          <input
            type="file"
            accept="application/json,.json"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void restore(file);
              event.target.value = "";
            }}
          />
        </label>
        {restored && (
          <button
            className="button secondary"
            onClick={() => window.location.reload()}
          >
            Обновить результаты
          </button>
        )}
      </div>
      {notice && <p role="status">{notice}</p>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
