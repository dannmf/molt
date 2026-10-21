import type { AppView } from "../../store/useAppStore";
import { useAppStore } from "../../store/useAppStore";
import { BoxIcon, MoonIcon, ScanIcon, SunIcon, TrashIcon } from "../icons/Icons";

interface NavItem {
  view: AppView;
  label: string;
  icon: typeof BoxIcon;
}

const NAV_ITEMS: NavItem[] = [
  { view: "projects", label: "Projetos", icon: BoxIcon },
  { view: "caches", label: "Caches", icon: TrashIcon },
];

export function Sidebar() {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  const hasScanned = useAppStore((state) => state.hasScanned);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);

  return (
    <aside className="flex w-48 shrink-0 flex-col gap-1 border-r border-black/10 bg-white/60 px-3 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/40">
      <div className="flex items-center justify-between px-2 pb-3">
        <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">Molt</p>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
          className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-white/5 dark:hover:text-neutral-200"
        >
          {theme === "dark" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
        </button>
      </div>

      {NAV_ITEMS.map(({ view: itemView, label, icon: Icon }) => (
        <button
          key={itemView}
          type="button"
          disabled={!hasScanned}
          onClick={() => setView(itemView)}
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            view === itemView
              ? "bg-amber-600 text-white"
              : "text-neutral-600 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5"
          }`}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}

      <button
        type="button"
        onClick={() => setView("onboarding")}
        className={`mt-auto flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
          view === "onboarding"
            ? "bg-amber-600 text-white"
            : "text-neutral-600 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5"
        }`}
      >
        <ScanIcon className="h-4 w-4" />
        Varredura
      </button>
    </aside>
  );
}
