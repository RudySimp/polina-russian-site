import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  GraduationCap,
  Home,
  Leaf,
  Menu,
  PencilLine,
  TrendingUp,
  X,
} from "lucide-react";
import { exerciseIndex, topics } from "../content/catalog";
import { href } from "../routes";

const generalNavigation = [
  { path: "/", label: "Главная", icon: Home },
  { path: "/oge/", label: "ОГЭ · 9 класс", icon: GraduationCap },
  { path: "/ege/", label: "ЕГЭ · 10–11 класс", icon: GraduationCap },
  { path: "/theory/", label: "Учебник", icon: BookOpen },
  { path: "/practice/", label: "Практика", icon: PencilLine },
  { path: "/progress/", label: "Мой прогресс", icon: TrendingUp },
];
const ogeNavigation = [
  { path: "/", label: "Главная", icon: Home },
  { path: "/oge/", label: "ОГЭ · 9 класс", icon: GraduationCap },
  { path: "/oge/theory/", label: "Вся теория", icon: BookOpen },
  { path: "/oge/bank/", label: "Все задания", icon: PencilLine },
  { path: "/oge/variants/", label: "Готовые варианты", icon: BookOpen },
  { path: "/oge/generator/", label: "Генератор", icon: PencilLine },
  { path: "/oge/games/", label: "Тематические тренажёры", icon: PencilLine },
  { path: "/oge/results/", label: "Работы и черновики", icon: TrendingUp },
];
export function Layout({
  path,
  children,
}: {
  path: string;
  children: ReactNode;
}) {
  const params = new URLSearchParams(window.location.search);
  const requestedExam = params.get("exam");
  const exerciseExam = path.startsWith("/practice/")
    ? exerciseIndex.find((item) => item.slug === path.split("/")[2])?.exam
    : undefined;
  const lesson = path.startsWith("/theory/")
    ? topics.find((topic) => topic.slug === path.split("/")[2])
    : undefined;
  const ogeContext =
    path.startsWith("/oge/") ||
    requestedExam === "OGE" ||
    exerciseExam === "OGE" ||
    (!requestedExam &&
      (params.get("from")?.startsWith("/oge/") ||
        (lesson?.examTags.length === 1 && lesson.examTags[0] === "OGE")));
  const egeContext =
    path.startsWith("/ege/") || requestedExam === "EGE" || exerciseExam === "EGE";
  const navigation = ogeContext ? ogeNavigation : generalNavigation;
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) {
      dialog.current?.showModal();
      document.body.style.overflow = "hidden";
    } else {
      dialog.current?.close();
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);
  function closeMenu() {
    setOpen(false);
    trigger.current?.focus();
  }
  const menu = (
    <>
      <a href={href("/")} className="brand">
        <span className="brand-mark" aria-hidden="true">
          П
        </span>
        <span>
          Сайт Полины<small>Русский язык с пониманием</small>
        </span>
      </a>
      <p className="nav-caption">
        {ogeContext ? "Подготовка к ОГЭ" : "Моя подготовка"}
      </p>
      <nav aria-label="Основная навигация">
        {navigation.map((item) => {
          const active =
            item.path === "/" || item.path === "/oge/"
              ? path === item.path
              : path.startsWith(item.path) ||
                (ogeContext &&
                  ((item.path === "/oge/theory/" && !!lesson) ||
                    (item.path === "/oge/bank/" && exerciseExam === "OGE")));
          const Icon = item.icon;
          return (
            <a
              key={item.path}
              href={href(item.path)}
              aria-current={active ? "page" : undefined}
              className={active ? "active" : ""}
              onClick={closeMenu}
            >
              <Icon size={20} aria-hidden="true" />
              {item.label}
            </a>
          );
        })}
      </nav>
      <div className="nav-foot">
        <div className="nav-note">
          <Leaf size={20} aria-hidden="true" />
          <p>
            Понимать правило.
            <br />
            Практиковаться в своём темпе.
          </p>
        </div>
        <nav aria-label="О проекте">
          {ogeContext && <a href={href("/ege/")}>Подготовка к ЕГЭ</a>}
          <a href={href("/sources/")}>Источники</a>
          <a href={href("/about/")}>О проекте</a>
        </nav>
      </div>
    </>
  );
  return (
    <>
      <a className="skip-link" href="#main">
        Перейти к содержанию
      </a>
      <aside className="sidebar">{menu}</aside>
      <header className="topbar">
        <button
          className="icon-button mobile-toggle"
          ref={trigger}
          aria-label="Открыть меню"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(true)}
        >
          <Menu size={23} />
        </button>
        <a
          className="topbar-context"
          href={href(ogeContext ? "/oge/" : egeContext ? "/ege/" : "/")}
        >
          {ogeContext
            ? "ОГЭ · русский язык"
            : egeContext
              ? "ЕГЭ · русский язык"
              : "Сайт Полины"}
        </a>
        <nav className="exam-switch" aria-label="Выбор экзамена">
          <a href={href("/oge/")} aria-current={ogeContext ? "true" : undefined}>
            ОГЭ
          </a>
          <a href={href("/ege/")} aria-current={egeContext ? "true" : undefined}>
            ЕГЭ
          </a>
        </nav>
      </header>
      <dialog
        className="mobile-dialog"
        id="mobile-menu"
        ref={dialog}
        onCancel={(event) => {
          event.preventDefault();
          closeMenu();
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
        aria-label="Меню сайта"
        onClose={() => trigger.current?.focus()}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const controls = [
            ...event.currentTarget.querySelectorAll<HTMLElement>(
              "a[href], button:not(:disabled)",
            ),
          ];
          const first = controls[0],
            last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
      >
        <div className="mobile-dialog-content">
          <button
            className="icon-button close-menu"
            aria-label="Закрыть меню"
            onClick={closeMenu}
          >
            <X size={24} />
          </button>
          {menu}
        </div>
      </dialog>
      <div className="page-shell">
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="site-footer">
          <span>Сайт Полины · Правило → пример → практика</span>
          <a href={href("/about/")}>О демонстрационной редакции</a>
          <a href={href("/sources/")}>Источники и статус материалов</a>
        </footer>
      </div>
    </>
  );
}
