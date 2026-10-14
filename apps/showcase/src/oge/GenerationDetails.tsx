import { useState } from "react";
import type { PracticeSession } from "./model";
import { downloadBackup, downloadGenerationCode } from "./backup";
export function GenerationDetails({ session }: { session: PracticeSession }) {
  const [error, setError] = useState("");
  function download(action: () => void) {
    setError("");
    try {
      action();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось подготовить файл.",
      );
    }
  }
  return (
    <details className="oge-generation-details">
      <summary>Код и редакция варианта</summary>
      <p>
        Код выбора: {session.seed}. Алгоритм: {session.generationVersion ?? 1}.
        Модель: {session.specificationId}. Редакция банка:{" "}
        {session.catalogVersion?.slice(0, 16) ?? "исторический снимок"}.
      </p>
      <p>
        Короткий код использует сохранённый снимок в этом браузере или текущую
        редакцию банка. Для переноса старой работы на другое устройство скачайте
        полную копию с условиями. Аудиозаписи доступны по сохранённым ссылкам.
      </p>
      <div className="inline-actions">
        <button
          className="button secondary"
          onClick={() => download(() => downloadGenerationCode(session))}
        >
          Скачать код состава
        </button>
        <button
          className="button secondary"
          onClick={() => download(() => downloadBackup([session]))}
        >
          Скачать работу с условиями
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
