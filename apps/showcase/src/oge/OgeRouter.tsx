import { lazy, Suspense } from "react";
import type { LocalAttempt } from "../progress";
const Overview = lazy(() => import("./OverviewPage"));
const Bank = lazy(() =>
  import("./BankPage").then((m) => ({ default: m.BankPage })),
);
const Theory = lazy(() =>
  import("./TheoryPage").then((m) => ({ default: m.OgeTheoryPage })),
);
const Variants = lazy(() =>
  import("./VariantPages").then((m) => ({ default: m.VariantCatalog })),
);
const Variant = lazy(() =>
  import("./VariantPages").then((m) => ({ default: m.FixedVariantPage })),
);
const Generator = lazy(() =>
  import("./VariantPages").then((m) => ({ default: m.GeneratorPage })),
);
const Games = lazy(() =>
  import("./GamePages").then((m) => ({ default: m.GamesCatalog })),
);
const Game = lazy(() =>
  import("./GamePages").then((m) => ({ default: m.GamePage })),
);
const Session = lazy(() =>
  import("./SessionPage").then((m) => ({ default: m.SessionPage })),
);
const Results = lazy(() => import("./ResultsPage"));
export default function OgeRouter({
  path,
  attempts,
  save,
}: {
  path: string;
  attempts: LocalAttempt[];
  save: (a: LocalAttempt) => void;
}) {
  let page;
  if (path === "/oge/") page = <Overview attempts={attempts} />;
  else if (path === "/oge/bank/")
    page = <Bank attempts={attempts} save={save} />;
  else if (/^\/oge\/bank\/(?:[1-9]|1[0-3])\/$/u.test(path))
    page = (
      <Bank line={Number(path.split("/")[3])} attempts={attempts} save={save} />
    );
  else if (path === "/oge/theory/") page = <Theory />;
  else if (path === "/oge/variants/") page = <Variants />;
  else if (/^\/oge\/variants\/[1-5]\/$/u.test(path))
    page = <Variant number={Number(path.split("/")[3])} />;
  else if (path === "/oge/generator/") page = <Generator attempts={attempts} />;
  else if (path === "/oge/games/") page = <Games />;
  else if (path.startsWith("/oge/games/"))
    page = <Game id={path.split("/")[3]} />;
  else if (path === "/oge/practice/session/")
    page = <Session saveAttempt={save} />;
  else if (path === "/oge/results/") page = <Results attempts={attempts} />;
  else page = <p>Страница ОГЭ не найдена.</p>;
  return (
    <Suspense
      fallback={
        <p className="route-loading" role="status">
          Загружаем материалы ОГЭ…
        </p>
      }
    >
      {page}
    </Suspense>
  );
}
