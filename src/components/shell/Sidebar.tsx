import type { AppView } from "../../store/useAppStore";
import { useAppStore } from "../../store/useAppStore";
import { BoxIcon, ScanIcon, TrashIcon } from "../icons/Icons";

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

  return (
    <aside className="flex w-48 shrink-0 flex-col gap-1 border-r border-black/10 bg-white/60 px-3 py-4 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-900/40">
      <p className="px-2 pb-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">Molt</p>

      {NAV_ITEMS.map(({ view: itemView, label, icon: Icon }) => (
        <button
          key={itemView}
          type="button"
          disabled={!hasScanned}
          onClick={() => setView(itemView)}
          className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            view === itemView
              ? "bg-blue-600 text-white"
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
            ? "bg-blue-600 text-white"
            : "text-neutral-600 hover:bg-black/5 dark:text-neutral-400 dark:hover:bg-white/5"
        }`}
      >
        <ScanIcon className="h-4 w-4" />
        Varredura
      </button>
    </aside>
  );
}
