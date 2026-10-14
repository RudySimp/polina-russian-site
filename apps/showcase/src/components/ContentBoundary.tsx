import { Component, type ReactNode } from "react";
export class ContentBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <section className="empty-state" role="alert">
          <h1>Материалы не загрузились</h1>
          <p>
            Проверьте соединение и повторите загрузку. Сохранённые работы
            остаются в браузере.
          </p>
          <button className="button" onClick={() => window.location.reload()}>
            Повторить загрузку
          </button>
          <a href="./">Вернуться к разделу</a>
        </section>
      );
    return this.props.children;
  }
}
