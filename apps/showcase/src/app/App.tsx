import { Suspense, useState } from "react";
import { Layout } from "../components/Layout";
import { currentPath } from "../routes";
import { readAttempts, storageKey, type LocalAttempt } from "../progress";
import { HomePage } from "../pages/HomePage";
import { ExamPage } from "../pages/ExamPage";
import { TheoryCatalogPage, PracticeCatalogPage } from "../pages/CatalogPages";
import { LessonPage } from "../pages/LessonPage";
import { PracticePage } from "../pages/PracticePage";
import { ProgressPage } from "../pages/ProgressPage";
import { SourcesPage, AboutPage, NotFoundPage } from "../pages/InfoPages";

export function App() {
  const path = currentPath(window.location.pathname);
  const [attempts, setAttempts] = useState<LocalAttempt[]>(() => {
    try {
      return readAttempts(window.localStorage);
    } catch {
      return [];
    }
  });
  const [storageError, setStorageError] = useState(false);
  function save(attempt: LocalAttempt) {
    const next = [...attempts, attempt].slice(-1000);
    setAttempts(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }
  function clear() {
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
  else if (path === "/oge/" || path === "/ege/")
    page = <ExamPage exam={path === "/oge/" ? "OGE" : "EGE"} />;
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
      <Suspense fallback={<p role="status">Открываем урок…</p>}>
        {page}
      </Suspense>
    </Layout>
  );
}
