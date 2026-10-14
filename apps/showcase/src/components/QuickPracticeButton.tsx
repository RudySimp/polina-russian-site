import { useState } from "react";
export function QuickPracticeButton({
  label = "5 заданий ОГЭ",
  secondary = false,
}: {
  label?: string;
  secondary?: boolean;
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <button
        className={"button" + (secondary ? " secondary" : "")}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          try {
            const practiceModule = await import("../oge/quick-practice");
            await practiceModule.startQuickPractice();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Не удалось начать работу.",
            );
            setBusy(false);
          }
        }}
      >
        {busy ? "Готовим задания…" : label}
      </button>
      {error && <p role="alert">{error}</p>}
    </>
  );
}
