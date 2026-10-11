import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Layout } from "../components/Layout";
import { currentPath } from "../routes";
import { readAttempts, storageKey, type LocalAttempt } from "../progress";
import { HomePage } from "../pages/HomePage";
const ExamPage = lazy(() =>
  import("../pages/ExamPage").then((m) => ({ default: m.ExamPage })),
);
const TheoryCatalogPage = lazy(() =>
  import("../pages/CatalogPages").then((m) => ({
    default: m.TheoryCatalogPage,
  })),
);
const PracticeCatalogPage = lazy(() =>
  import("../pages/CatalogPages").then((m) => ({
    default: m.PracticeCatalogPage,
  })),
);
const LessonPage = lazy(() =>
  import("../pages/LessonPage").then((m) => ({ default: m.LessonPage })),
);
const PracticePage = lazy(() =>
  import("../pages/PracticePage").then((m) => ({ default: m.PracticePage })),
);
const ProgressPage = lazy(() =>
  import("../pages/ProgressPage").then((m) => ({ default: m.ProgressPage })),
);
const SourcesPage = lazy(() =>
  import("../pages/InfoPages").then((m) => ({ default: m.SourcesPage })),
);
const AboutPage = lazy(() =>
  import("../pages/InfoPages").then((m) => ({ default: m.AboutPage })),
);
const NotFoundPage = lazy(() =>
  import("../pages/InfoPages").then((m) => ({ default: m.NotFoundPage })),
);
const OgeRouter = lazy(() => import("../oge/OgeRouter"));

export function App() {
  const path = currentPath(window.location.pathname);
  const [attempts, setAttempts] = useState<LocalAttempt[]>([]);
  const attemptsRef = useRef<LocalAttempt[]>([]);
  useEffect(() => {
    let active = true;
    try {
      if (window.localStorage.getItem(storageKey))
        import("../content/load")
          .then((m) => m.loadAllExercises())
          .then((bank) => {
            if (active) {
              const previous = readAttempts(window.localStorage, bank);
              const pending = attemptsRef.current;
              const ids = new Set(previous.map((a) => a.id));
              const next = [
                ...previous,
                ...pending.filter((a) => !ids.has(a.id)),
              ].slice(-1000);
              attemptsRef.current = next;
              setAttempts(next);
            }
          });
    } catch {
      /* History is optional when local storage is disabled. */
    }
    return () => {
      active = false;
    };
  }, []);
  const [storageError, setStorageError] = useState(false);
  function save(attempt: LocalAttempt) {
    const next = [...attemptsRef.current, attempt].slice(-1000);
    attemptsRef.current = next;
    setAttempts(next);
    try {
      // Keep raw attempts from previous exercise revisions; only checked current revisions enter metrics.
      let raw: unknown = [];
      try {
        raw = JSON.parse(window.localStorage.getItem(storageKey) ?? "[]");
      } catch {}
      const ids = new Set(next.map((a) => a.id));
      const previous = Array.isArray(raw)
        ? raw.filter((a) => a && typeof a.id === "string" && !ids.has(a.id))
        : [];
      window.localStorage.setItem(
        storageKey,
        JSON.stringify([...previous, ...next].slice(-1000)),
      );
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  function clear() {
    attemptsRef.current = [];
    setAttempts([]);
    try {
      window.localStorage.removeItem(storageKey);
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  let page;
  if (path === "/") page = <HomePage attempts={attempts} />;
  else if (path.startsWith("/oge/"))
    page = <OgeRouter path={path} attempts={attempts} save={save} />;
  else if (path === "/ege/") page = <ExamPage exam="EGE" />;
  else if (path === "/theory/") page = <TheoryCatalogPage />;
  else if (path.startsWith("/theory/"))
    page = <LessonPage slug={path.split("/")[2]} />;
  else if (path === "/practice/") page = <PracticeCatalogPage />;
  else if (path.startsWith("/practice/"))
    page = (
      <PracticePage slug={path.split("/")[2]} attempts={attempts} save={save} />
    );
  else if (path === "/progress/")
    page = <ProgressPage attempts={attempts} clear={clear} />;
  else if (path === "/sources/") page = <SourcesPage />;
  else if (path === "/about/") page = <AboutPage />;
  else page = <NotFoundPage />;
  return (
    <Layout path={path}>
      {storageError && (
        <p className="storage-error" role="status">
          Браузер не разрешил сохранить историю. Текущие результаты доступны до
          закрытия этой страницы.
        </p>
      )}
      <Suspense
        fallback={
          <p className="route-loading" role="status">
            Загружаем учебные материалы…
          </p>
        }
      >
        {page}
      </Suspense>
    </Layout>
  );
}
