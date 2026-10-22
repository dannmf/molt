import { useQuery } from "@tanstack/react-query";

import moltMarkDark from "../../assets/brand/molt-mark-dark.svg";
import moltMarkLight from "../../assets/brand/molt-mark-light.svg";
import { CACHES_QUERY_KEY } from "../../hooks/useCachesQuery";
import { CLEANUP_HISTORY_QUERY_KEY } from "../../hooks/useCleanupHistoryQuery";
import { useProjectsQuery } from "../../hooks/useProjectsQuery";
import { formatRelativeDate } from "../../lib/format";
import type { AppView } from "../../store/useAppStore";
import { useAppStore } from "../../store/useAppStore";
import type { CacheEntry, CleanupHistoryEntry } from "../../types";
import { BoxIcon, FolderIcon, HistoryIcon, MoonIcon, SunIcon, TrashIcon } from "../icons/Icons";

interface NavItem {
  view: AppView;
  label: string;
  icon: typeof BoxIcon;
  /** Histórico não depende de uma varredura ter rodado nesta sessão: lê direto do log em disco. */
  requiresScan?: boolean;
  count?: number;
}

export function Sidebar() {
  const view = useAppStore((state) => state.view);
  const setView = useAppStore((state) => state.setView);
  const hasScanned = useAppStore((state) => state.hasScanned);
  const theme = useAppStore((state) => state.theme);
  const toggleTheme = useAppStore((state) => state.toggleTheme);
  const roots = useAppStore((state) => state.roots);
  const lastScanAt = useAppStore((state) => state.lastScanAt);

  const { data: projects } = useProjectsQuery();
  // `enabled: false` aqui também: só lemos o que já estiver em cache, sem disparar
  // a varredura de caches (du/docker) ou a leitura do histórico antes de hora.
  const { data: caches } = useQuery<CacheEntry[]>({ queryKey: CACHES_QUERY_KEY, queryFn: () => Promise.resolve([]), enabled: false });
  const { data: history } = useQuery<CleanupHistoryEntry[]>({
    queryKey: CLEANUP_HISTORY_QUERY_KEY,
    queryFn: () => Promise.resolve([]),
    enabled: false,
  });

  const navItems: NavItem[] = [
    { view: "projects", label: "Projetos", icon: BoxIcon, requiresScan: true, count: projects?.length },
    { view: "caches", label: "Caches", icon: TrashIcon, requiresScan: true, count: caches?.length },
    { view: "history", label: "Histórico", icon: HistoryIcon, requiresScan: false, count: history?.length },
  ];

  return (
    <aside className="flex w-52 shrink-0 flex-col gap-5 border-r border-line bg-panel px-2.5 pt-3.5 pb-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <img src={theme === "dark" ? moltMarkDark : moltMarkLight} alt="" className="size-[18px]" />
          <p className="text-sm font-semibold text-ink">Molt</p>
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === "dark" ? "Mudar para tema claro" : "Mudar para tema escuro"}
          className="grid size-7 place-items-center rounded-sm text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink"
        >
          {theme === "dark" ? <SunIcon className="size-3.5" /> : <MoonIcon className="size-3.5" />}
        </button>
      </div>

      <nav className="flex flex-col gap-0.5">
        {navItems.map(({ view: itemView, label, icon: Icon, requiresScan, count }) => {
          const disabled = requiresScan !== false && !hasScanned;
          const active = view === itemView;
          return (
            <button
              key={itemView}
              type="button"
              disabled={disabled}
              onClick={() => setView(itemView)}
              className={`flex h-[30px] items-center gap-2 rounded-sm px-2.5 text-[13px] transition-colors duration-100 disabled:cursor-default disabled:text-ink-3 ${
                active ? "bg-hover font-semibold text-ink" : "text-ink-2 enabled:hover:bg-hover enabled:hover:text-ink"
              }`}
            >
              <Icon className="size-3.5 shrink-0" />
              <span className="flex-1 text-left">{label}</span>
              {count !== undefined && <span className="font-mono text-[11px] text-ink-3">{count}</span>}
            </button>
          );
        })}
      </nav>

      <button
        type="button"
        onClick={() => setView("onboarding")}
        className={`mt-auto flex items-center gap-2 border-t border-line px-2.5 pt-3 text-left transition-colors duration-100 ${
          view === "onboarding" ? "text-ink" : "text-ink-2 hover:text-ink"
        }`}
      >
        <FolderIcon className="size-3.5 shrink-0 text-ink-3" />
        <span className="flex flex-col">
          <span className="text-[12.5px] font-medium">Pastas da varredura</span>
          <span className="font-mono text-[11px] text-ink-3">
            {roots.length} {roots.length === 1 ? "pasta" : "pastas"} ·{" "}
            {lastScanAt !== null ? `varrido ${formatRelativeDate(lastScanAt)}` : "nunca varrido"}
          </span>
        </span>
      </button>
    </aside>
  );
}
