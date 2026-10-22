import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

/**
 * Select do Molt — listbox WAI-ARIA sem dependências.
 * Teclado: ↑ ↓ Home End, Enter/Espaço escolhe, Esc fecha, digitar pula para a opção.
 * Clique fora fecha. O popover abre para baixo, alinhado à esquerda do gatilho.
 *
 *   <Select
 *     label="Modificado"
 *     value={age}
 *     onChange={setAge}
 *     options={[
 *       { value: "any", label: "Qualquer data", meta: "15" },
 *       { value: "1y",  label: "Mais de 1 ano", meta: "7" },
 *     ]}
 *   />
 */
export type SelectOption<T extends string = string> = {
  value: T;
  label: string;
  /** Texto à direita, em mono — ex.: quantos projetos casam com a opção. */
  meta?: string;
};

type SelectProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  /** Prefixo discreto dentro do gatilho, ex.: "Modificado". */
  label?: string;
  "aria-label"?: string;
  disabled?: boolean;
  className?: string;
};

/** Fora do componente para não acoplar `Date.now()` ao escopo de render. */
function appendTypeahead(previous: { text: string; at: number }, key: string): { text: string; at: number } {
  const now = Date.now();
  const text = now - previous.at > 600 ? key : previous.text + key;
  return { text, at: now };
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  label,
  disabled,
  className = "",
  "aria-label": ariaLabel,
}: SelectProps<T>) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: "", at: 0 });

  const selectedIndex = Math.max(0, options.findIndex((o) => o.value === value));
  const selected = options[selectedIndex];

  function show() {
    setActive(selectedIndex);
    setOpen(true);
  }
  function hide(returnFocus = true) {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  }
  function commit(index: number) {
    const o = options[index];
    if (o && o.value !== value) onChange(o.value);
    hide();
  }

  useEffect(() => {
    if (!open) return;
    listRef.current?.focus();
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) hide(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // mantém a opção ativa visível em listas longas
  useEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    if (!list || !el) return;
    if (el.offsetTop < list.scrollTop) list.scrollTop = el.offsetTop;
    else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight;
  }, [active, open]);

  function typeahead(key: string) {
    typed.current = appendTypeahead(typed.current, key);
    const i = options.findIndex((o) => o.label.toLowerCase().startsWith(typed.current.text.toLowerCase()));
    if (i >= 0) setActive(i);
  }

  function onButtonKeyDown(e: KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      show();
    }
  }

  function onListKeyDown(e: KeyboardEvent) {
    const last = options.length - 1;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setActive((i) => Math.min(last, i + 1)); break;
      case "ArrowUp":   e.preventDefault(); setActive((i) => Math.max(0, i - 1)); break;
      case "Home":      e.preventDefault(); setActive(0); break;
      case "End":       e.preventDefault(); setActive(last); break;
      case "Enter":
      case " ":         e.preventDefault(); commit(active); break;
      case "Escape":    e.preventDefault(); hide(); break;
      case "Tab":       hide(false); break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) typeahead(e.key);
    }
  }

  return (
    <div ref={rootRef} className={`relative inline-block ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={ariaLabel}
        onClick={() => (open ? hide() : show())}
        onKeyDown={onButtonKeyDown}
        className="inline-flex h-7 items-center gap-2 rounded-sm border border-line-strong bg-surface pr-2 pl-2.5 text-[13px] text-ink transition-colors duration-100 hover:border-ink-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-shed aria-expanded:border-ink-3 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {label && <span className="text-ink-3">{label}</span>}
        <span className="font-medium">{selected?.label}</span>
        <svg
          viewBox="0 0 12 12"
          aria-hidden="true"
          className={`size-3 text-ink-3 transition-transform duration-100 ${open ? "rotate-180" : ""}`}
        >
          <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <ul
          ref={listRef}
          id={`${id}-list`}
          role="listbox"
          tabIndex={-1}
          aria-activedescendant={`${id}-opt-${active}`}
          onKeyDown={onListKeyDown}
          className="absolute top-[calc(100%+4px)] left-0 z-50 max-h-72 min-w-full overflow-auto rounded-md border border-line-strong bg-surface p-1 shadow-pop outline-none"
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li
                key={o.value}
                id={`${id}-opt-${i}`}
                role="option"
                aria-selected={isSelected}
                data-index={i}
                data-active={i === active || undefined}
                onPointerMove={() => setActive(i)}
                onClick={() => commit(i)}
                className="flex h-7 cursor-default items-center gap-2 rounded-xs pr-2.5 pl-2 text-[13px] whitespace-nowrap text-ink-2 data-active:bg-hover data-active:text-ink aria-selected:text-ink"
              >
                <svg viewBox="0 0 12 12" aria-hidden="true" className={`size-3 shrink-0 ${isSelected ? "" : "invisible"}`}>
                  <path d="M2.5 6.25 5 8.75l4.5-5.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="flex-1">{o.label}</span>
                {o.meta && <span className="pl-4 font-mono text-[11px] text-ink-3">{o.meta}</span>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
