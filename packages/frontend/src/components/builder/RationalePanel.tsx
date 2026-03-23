interface RationalePanelProps {
  rationale: string[];
  tradeoffs: string[];
  nextSteps: string[];
}

export function RationalePanel({ rationale, tradeoffs, nextSteps }: RationalePanelProps) {
  return (
    <div className="space-y-6">
      {/* Rationale */}
      {rationale.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Обоснование
          </h3>
          <div className="space-y-2">
            {rationale.map((text, i) => (
              <p key={i} className="text-sm leading-relaxed">
                {text}
              </p>
            ))}
          </div>
        </section>
      )}

      {/* Tradeoffs */}
      {tradeoffs.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Компромиссы
          </h3>
          <ul className="space-y-1">
            {tradeoffs.map((text, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className="mt-1 text-yellow-500">&#9888;</span>
                {text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Next steps */}
      {nextSteps.length > 0 && (
        <section>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Следующие шаги
          </h3>
          <ol className="list-decimal space-y-1 pl-5">
            {nextSteps.map((text, i) => (
              <li key={i} className="text-sm">
                {text}
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
