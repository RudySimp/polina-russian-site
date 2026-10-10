import { useState } from "react";
import type { LessonBlock } from "../content/registry";
import { InteractiveExercise } from "./InteractiveExercise";

function StepByStep({ items }: { items: string[] }) {
  const [visible, setVisible] = useState(0);
  return (
    <div className="step-explanation">
      {visible > 0 && (
        <ol>
          {items.slice(0, visible).map((item, index) => (
            <li key={index}>{item}</li>
          ))}
        </ol>
      )}
      <div className="inline-actions">
        {visible < items.length && (
          <button
            className="button secondary"
            onClick={() => setVisible(visible + 1)}
          >
            Открыть {visible ? "следующий" : "первый"} шаг
          </button>
        )}
        {visible < items.length && (
          <button
            className="text-button"
            onClick={() => setVisible(items.length)}
          >
            Весь разбор
          </button>
        )}
        {visible === items.length && (
          <button className="text-button" onClick={() => setVisible(0)}>
            Скрыть разбор
          </button>
        )}
      </div>
    </div>
  );
}
function Checkpoint({
  block,
}: {
  block: Extract<LessonBlock, { type: "checkpoint" }>;
}) {
  const [selected, setSelected] = useState(0);
  const [checked, setChecked] = useState(false);
  return (
    <div className="checkpoint">
      <h3>{block.title}</h3>
      <p>{block.question}</p>
      <fieldset className="choice-list">
        <legend className="sr-only">Ответ для самопроверки</legend>
        {block.options.map((option, index) => (
          <label key={index}>
            <input
              type="radio"
              name={block.question}
              checked={selected === index + 1}
              onChange={() => {
                setSelected(index + 1);
                setChecked(false);
              }}
            />
            <span>{option}</span>
          </label>
        ))}
      </fieldset>
      <button className="button secondary" onClick={() => setChecked(true)}>
        Проверить себя
      </button>
      {checked && (
        <p
          className={`feedback ${selected === block.answer ? "correct" : "incorrect"}`}
          role="status"
        >
          {selected === block.answer ? "Верно. " : "Посмотрите на объяснение. "}
          {block.explanation}
        </p>
      )}
    </div>
  );
}
export function LessonBlocks({ blocks }: { blocks: LessonBlock[] }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "interactive")
          return <InteractiveExercise key={index} data={block.data} />;
        if (block.type === "checkpoint")
          return <Checkpoint key={index} block={block} />;
        if (block.type === "example")
          return (
            <div className="example-block" key={index}>
              <p className="block-label">РАЗБИРАЕМ ПРИМЕР</p>
              <h3>{block.title}</h3>
              <p className="example-text">{block.text}</p>
              {block.counterexample && <p>Сравните: {block.counterexample}</p>}
              <StepByStep items={block.steps} />
            </div>
          );
        if (block.type === "comparison")
          return (
            <div className="comparison-block" key={index}>
              <h3>{block.title}</h3>
              <div className="comparison-grid">
                {block.items.map((item, n) => (
                  <div key={n}>
                    <p className="example-text">{item.text}</p>
                    <p>{item.explanation}</p>
                  </div>
                ))}
              </div>
            </div>
          );
        if (block.type === "table")
          return (
            <div className="lesson-table" key={index}>
              <h3>{block.title}</h3>
              <div
                className="table-scroll"
                tabIndex={0}
                role="region"
                aria-label={block.title}
              >
                <table>
                  <thead>
                    <tr>
                      {block.headers.map((header, n) => (
                        <th scope="col" key={n}>
                          {header}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, n) => (
                      <tr key={n}>
                        {row.map((cell, m) => (
                          <td key={m}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          );
        if (block.type === "steps")
          return (
            <div className="algorithm-block" key={index}>
              <h3>{block.title}</h3>
              <ol>
                {block.items.map((item, n) => (
                  <li key={n}>{item}</li>
                ))}
              </ol>
            </div>
          );
        return (
          <div key={index} className={`lesson-${block.type}`}>
            {block.title && <h3>{block.title}</h3>}
            <p>{block.text}</p>
          </div>
        );
      })}
    </>
  );
}
