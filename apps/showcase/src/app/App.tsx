import { routeMetadata } from "../route-metadata";
import { ContentBoundary } from "../components/ContentBoundary";
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { Layout } from "../components/Layout";
import { currentPath } from "../routes";
import {
  readAttemptsAddressed,
  storageKey,
  type LocalAttempt,
} from "../progress";
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
  useEffect(() => {
    const update = () => {
      const metadata = routeMetadata(
        window.location.pathname,
        window.location.search,
      );
      document.title = metadata.title;
      document
        .querySelector<HTMLMetaElement>('meta[name="description"]')
        ?.setAttribute("content", metadata.description);
    };
    update();
    window.addEventListener("popstate", update);
    window.addEventListener("polina-catalog-changed", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("polina-catalog-changed", update);
    };
  }, [path]);
  const [attempts, setAttempts] = useState<LocalAttempt[]>([]);
  const attemptsRef = useRef<LocalAttempt[]>([]);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    if (
      path === "/" ||
      path === "/oge/" ||
      path.startsWith("/theory/") ||
      path === "/oge/theory/" ||
      path === "/ege/"
    )
      return;
    let active = true;
    try {
      if (window.localStorage.getItem(storageKey))
        import("../content/load")
          .then((m) =>
            readAttemptsAddressed(window.localStorage, m.loadExercises),
          )
          .then((previous) => {
            if (active) {
              const pending = attemptsRef.current;
              const ids = new Set(previous.map((a) => a.id));
              const next = [
                ...previous,
                ...pending.filter((a) => !ids.has(a.id)),
              ].slice(-1000);
              attemptsRef.current = next;
              setAttempts(next);
            }
          })
          .catch(() => {
            if (active) setStorageError(true);
          });
    } catch {
      /* History is optional when local storage is disabled. */
    }
    return () => {
      active = false;
    };
  }, [path]);
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
  if (path === "/") page = <HomePage />;
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
      <ContentBoundary>
        <Suspense
          fallback={
            <p className="route-loading" role="status">
              Загружаем учебные материалы…
            </p>
          }
        >
          {page}
        </Suspense>
      </ContentBoundary>
    </Layout>
  );
}
