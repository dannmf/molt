import type { ProjectKind } from "../types";

export interface KindBadge {
  label: string;
  short: string;
  className: string;
}

const BADGES: Record<ProjectKind, KindBadge> = {
  node: { label: "Node", short: "JS", className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  rust: { label: "Rust", short: "RS", className: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  python: { label: "Python", short: "PY", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  flutter: { label: "Flutter", short: "FL", className: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  reactNative: { label: "React Native", short: "RN", className: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  expo: { label: "Expo", short: "EX", className: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
  swift: { label: "Swift", short: "SW", className: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  android: { label: "Android", short: "AN", className: "bg-green-500/15 text-green-700 dark:text-green-300" },
  go: { label: "Go", short: "GO", className: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  java: { label: "Java", short: "JV", className: "bg-red-500/15 text-red-700 dark:text-red-300" },
  unknown: { label: "Desconhecido", short: "?", className: "bg-gray-500/15 text-gray-700 dark:text-gray-300" },
};

export function kindBadge(kind: ProjectKind): KindBadge {
  return BADGES[kind];
}
