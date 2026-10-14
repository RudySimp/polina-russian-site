import { useState } from "react";
export function useLessonState<T>(
  scope: string,
  initial: T,
  valid: (value: unknown) => value is T,
): [T, (value: T) => void, boolean] {
  const key = "polina-lesson-state-v2:" + scope;
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw && raw.length < 100000) {
        const value: unknown = JSON.parse(raw);
        if (valid(value)) return value;
      }
    } catch {}
    return initial;
  });
  const [error, setError] = useState(false);
  function update(value: T) {
    setState(value);
    try {
      localStorage.setItem(key, JSON.stringify(value));
      setError(false);
    } catch {
      setError(true);
    }
  }
  return [state, update, error];
}
