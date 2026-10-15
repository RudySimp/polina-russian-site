import { useEffect, useRef, useState } from "react";
import { href } from "../routes";
/** One history entry per search editing session; discrete filters and pages are entries. */
export function useCatalogQuery(base: string) {
  const [params, setParams] = useState(
    () => new URLSearchParams(window.location.search),
  );
  const searching = useRef(false);
  useEffect(() => {
    const pop = () => {
      searching.current = false;
      setParams(new URLSearchParams(window.location.search));
    };
    window.addEventListener("popstate", pop);
    try {
      const position = sessionStorage.getItem(
        "polina-catalog-scroll:" + location.pathname + location.search,
      );
      if (position)
        requestAnimationFrame(() => window.scrollTo(0, Number(position)));
    } catch {}
    return () => window.removeEventListener("popstate", pop);
  }, []);
  function change(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== "page") next.delete("page");
    if (key === "topic") next.delete("skill");
    const url = href(base + (next.size ? "?" + next : ""));
    if (key === "q" && searching.current)
      window.history.replaceState(null, "", url);
    else window.history.pushState(null, "", url);
    searching.current = key === "q";
    setParams(next);
    window.dispatchEvent(new Event("polina-catalog-changed"));
  }
  function reset() {
    searching.current = false;
    window.history.pushState(null, "", href(base));
    setParams(new URLSearchParams());
    window.dispatchEvent(new Event("polina-catalog-changed"));
  }
  function rememberScroll() {
    try {
      sessionStorage.setItem(
        "polina-catalog-scroll:" + location.pathname + location.search,
        String(window.scrollY),
      );
    } catch {}
  }
  return {
    params,
    change,
    reset,
    rememberScroll,
    endSearch: () => {
      searching.current = false;
    },
  };
}
