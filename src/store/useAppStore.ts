import { create } from "zustand";

import type { ProjectKind } from "../types";
import type { ProjectFilters, ProjectSortKey, SortDirection } from "../lib/projects";
import { EMPTY_FILTERS } from "../lib/projects";
import type { Theme } from "../lib/theme";
import { resolveInitialTheme, THEME_STORAGE_KEY, toggleTheme as flipTheme } from "../lib/theme";

export type AppView = "onboarding" | "projects" | "caches" | "docker";

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

  setView: (view: AppView) => void;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  addRoot: (root: string) => void;
  removeRoot: (root: string) => void;
  toggleRoot: (root: string) => void;
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
  roots: [...DEFAULT_ROOTS],
  hasScanned: false,
  sortKey: "reclaimableBytes",
  sortDirection: "desc",
  filters: EMPTY_FILTERS,
  selectedIds: new Set(),
  theme: initialTheme(),

  setView: (view) => set({ view }),
  setTheme: (theme) => set({ theme }),
  toggleTheme: () => set((state) => ({ theme: flipTheme(state.theme) })),

  addRoot: (root) =>
    set((state) => (state.roots.includes(root) ? state : { roots: [...state.roots, root] })),

  removeRoot: (root) => set((state) => ({ roots: state.roots.filter((r) => r !== root) })),

  toggleRoot: (root) =>
    set((state) =>
      state.roots.includes(root)
        ? { roots: state.roots.filter((r) => r !== root) }
        : { roots: [...state.roots, root] },
    ),

  markScanned: () => set({ hasScanned: true, view: "projects" }),

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
