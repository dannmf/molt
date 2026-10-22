import type { ProjectKind } from "../types";

const LABELS: Record<ProjectKind, string> = {
  node: "node",
  rust: "rust",
  python: "python",
  flutter: "flutter",
  reactNative: "react native",
  expo: "expo",
  swift: "swift",
  android: "android",
  go: "go",
  java: "java",
  unknown: "outro",
};

/** Nome de exibição de um `ProjectKind`, em minúsculas, para texto mono (stack não usa badge). */
export function kindLabel(kind: ProjectKind): string {
  return LABELS[kind];
}
