export function LoadRecovery({ message }: { message: string }) {
  return (
    <div role="alert">
      <p>{message}</p>
      <p>
        Если материалы не загрузились, проверьте соединение и перезагрузите
        страницу. Сохранённые работы останутся в этом браузере.
      </p>
      <button
        className="button secondary"
        onClick={() => window.location.reload()}
      >
        Перезагрузить страницу
      </button>
    </div>
  );
}
