import { forwardRef, useEffect, useRef, type InputHTMLAttributes, type ReactNode } from "react";

/**
 * Checkbox do Molt.
 * É um <input type="checkbox"> nativo com appearance-none: teclado, <label>,
 * formulários e leitores de tela continuam funcionando. O único JS é para o
 * estado misto, que só existe como propriedade do DOM.
 *
 * Em células de tabela, sem rótulo, aumente a área de clique:
 *   <Checkbox aria-label="Selecionar molt" className="-m-2 p-2" />
 */
type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  /** Estado misto, ex.: "selecionar todos" com seleção parcial. */
  indeterminate?: boolean;
  label?: ReactNode;
};

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { indeterminate = false, label, className = "", disabled, ...props },
  ref,
) {
  const inner = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (inner.current) inner.current.indeterminate = indeterminate;
  }, [indeterminate]);

  function setRef(el: HTMLInputElement | null) {
    inner.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) ref.current = el;
  }

  return (
    <label
      className={`group inline-flex items-center gap-2 select-none ${
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      } ${className}`}
    >
      <span className="relative grid size-3.5 shrink-0 place-items-center">
        <input
          ref={setRef}
          type="checkbox"
          disabled={disabled}
          className="peer absolute inset-0 m-0 cursor-[inherit] appearance-none rounded-[3px] border-[1.5px] border-ink-3 bg-surface transition-colors duration-100 group-hover:enabled:border-ink-2 checked:border-ink checked:bg-ink indeterminate:border-ink indeterminate:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shed"
          {...props}
        />
        {indeterminate ? (
          <svg viewBox="0 0 12 12" aria-hidden="true" className="pointer-events-none relative size-2.5 text-canvas">
            <path d="M3 6h6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
        ) : (
          <svg
            viewBox="0 0 12 12"
            aria-hidden="true"
            className="pointer-events-none relative size-2.5 text-canvas opacity-0 peer-checked:opacity-100"
          >
            <path
              d="M2.5 6.25 5 8.75l4.5-5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
      {label != null && <span className="text-[13px] text-ink-2 group-hover:text-ink">{label}</span>}
    </label>
  );
});
