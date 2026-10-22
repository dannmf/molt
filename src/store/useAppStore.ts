import { create } from "zustand";

import type { ProjectKind } from "../types";
import { loadExcludedPaths, saveExcludedPaths } from "../lib/exclusions";
import { loadLastScanAt, saveLastScanAt } from "../lib/lastScan";
import type { ProjectFilters, ProjectSortKey, SortDirection } from "../lib/projects";
import { EMPTY_FILTERS } from "../lib/projects";
import { loadRoots, saveRoots } from "../lib/roots";
import type { Theme } from "../lib/theme";
import { resolveInitialTheme, THEME_STORAGE_KEY, toggleTheme as flipTheme } from "../lib/theme";

export type AppView = "onboarding" | "projects" | "caches" | "history";

export const DEFAULT_ROOTS = ["~/Developer", "~/Projects", "~/Documents"];

function initialTheme(): Theme {
  if (typeof window === "undefined") {
    return "light";
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  const prefersDark = window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
  return resolveInitialTheme(stored, prefersDark);
}

interface AppState {
  view: AppView;
  roots: string[];
  hasScanned: boolean;
  sortKey: ProjectSortKey;
  sortDirection: SortDirection;
  filters: ProjectFilters;
  selectedIds: Set<string>;
  theme: Theme;
  excludedPaths: string[];
  lastScanAt: number | null;

  setView: (view: AppView) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  addRoot: (root: string) => void;
  removeRoot: (root: string) => void;
  toggleRoot: (root: string) => void;
  excludePath: (path: string) => void;
  includePath: (path: string) => void;
  markScanned: () => void;
  setSort: (key: ProjectSortKey) => void;
  toggleKindFilter: (kind: ProjectKind) => void;
  setMinIdleDays: (days: number | null) => void;
  setOnlyWithArtifacts: (value: boolean) => void;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  clearSelection: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: "onboarding",
  roots: loadRoots() ?? [...DEFAULT_ROOTS],
  hasScanned: false,
  sortKey: "reclaimableBytes",
  sortDirection: "desc",
  filters: EMPTY_FILTERS,
  selectedIds: new Set(),
  theme: initialTheme(),
  excludedPaths: loadExcludedPaths(),
  lastScanAt: loadLastScanAt(),

  setView: (view) => set({ view }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((state) => ({ theme: flipTheme(state.theme) })),

  addRoot: (root) =>
    set((state) => {
      if (state.roots.includes(root)) {
        return state;
      }
      const roots = [...state.roots, root];
      saveRoots(roots);
      return { roots };
    }),

  removeRoot: (root) =>
    set((state) => {
      const roots = state.roots.filter((r) => r !== root);
      saveRoots(roots);
      return { roots };
    }),

  toggleRoot: (root) =>
    set((state) => {
      const roots = state.roots.includes(root)
        ? state.roots.filter((r) => r !== root)
        : [...state.roots, root];
      saveRoots(roots);
      return { roots };
    }),

  excludePath: (path) =>
    set((state) => {
      if (state.excludedPaths.includes(path)) {
        return state;
      }
      const excludedPaths = [...state.excludedPaths, path];
      saveExcludedPaths(excludedPaths);
      return { excludedPaths };
    }),

  includePath: (path) =>
    set((state) => {
      const excludedPaths = state.excludedPaths.filter((excluded) => excluded !== path);
      saveExcludedPaths(excludedPaths);
      return { excludedPaths };
    }),

  markScanned: () => {
    const lastScanAt = Math.floor(Date.now() / 1000);
    saveLastScanAt(lastScanAt);
    set({ hasScanned: true, view: "projects", lastScanAt });
  },

  setSort: (key) =>
    set((state) => ({
      sortKey: key,
      sortDirection: state.sortKey === key && state.sortDirection === "desc" ? "asc" : "desc",
    })),

  toggleKindFilter: (kind) =>
    set((state) => {
      const kinds = state.filters.kinds.includes(kind)
        ? state.filters.kinds.filter((k) => k !== kind)
        : [...state.filters.kinds, kind];
      return { filters: { ...state.filters, kinds } };
    }),

  setMinIdleDays: (days) => set((state) => ({ filters: { ...state.filters, minIdleDays: days } })),

  setOnlyWithArtifacts: (value) =>
    set((state) => ({ filters: { ...state.filters, onlyWithArtifacts: value } })),

  toggleSelected: (id) =>
    set((state) => {
      const next = new Set(state.selectedIds);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return { selectedIds: next };
    }),

  setSelected: (ids) => set({ selectedIds: new Set(ids) }),

  clearSelection: () => set({ selectedIds: new Set() }),
}));
