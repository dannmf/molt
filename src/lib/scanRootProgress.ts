/** Deriva o status de cada pasta raiz (aguardando/varrendo/concluído) a partir do
 * `currentPath` do evento de progresso. O scanner varre as raízes uma de cada vez,
 * em ordem (ver scanner/mod.rs), então o índice da raiz cujo prefixo bate com
 * `currentPath` é sempre a raiz ativa — e a contagem de projetos de cada raiz já
 * concluída fica congelada no último `projectsFound` visto enquanto ela ainda
 * era a ativa (não no primeiro valor já pertencente à próxima raiz).
 */

export type RootScanStatus = "waiting" | "scanning" | "done";

export interface RootScanState {
  root: string;
  status: RootScanStatus;
  projects: number;
}

export interface ScanRootTracker {
  roots: string[];
  activeIndex: number;
  /** Valor acumulado de `projectsFound` no momento em que a varredura deixou cada raiz para trás. */
  boundaries: number[];
  /** Último `projectsFound` visto enquanto `activeIndex` era a raiz corrente. */
  lastSeenAtActive: number;
}

export function createScanRootTracker(roots: string[]): ScanRootTracker {
  return { roots, activeIndex: -1, boundaries: roots.map(() => 0), lastSeenAtActive: 0 };
}

function pathBelongsToRoot(path: string, root: string): boolean {
  if (!path) return false;
  const normalizedRoot = root.endsWith("/") ? root.slice(0, -1) : root;
  return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`);
}

/** Avança o tracker com um novo evento de progresso. Retorna um novo tracker
 * (não muta o recebido) — se `currentPath` não bater com nenhuma raiz conhecida,
 * ou se bater com uma raiz anterior à ativa (oscilação do paralelismo interno do
 * scanner), devolve o tracker inalterado. */
export function advanceScanRootTracker(tracker: ScanRootTracker, currentPath: string, projectsFound: number): ScanRootTracker {
  const matchedIndex = tracker.roots.findIndex((root) => pathBelongsToRoot(currentPath, root));
  if (matchedIndex === -1 || matchedIndex < tracker.activeIndex) {
    return tracker;
  }

  if (matchedIndex === tracker.activeIndex) {
    return { ...tracker, lastSeenAtActive: projectsFound };
  }

  const boundaries = [...tracker.boundaries];
  if (tracker.activeIndex >= 0) {
    boundaries[tracker.activeIndex] = tracker.lastSeenAtActive;
  }
  // raízes puladas sem nenhum evento próprio (ex.: pasta vazia): não encontraram
  // nada de novo, então herdam o mesmo total da raiz anterior.
  for (let i = tracker.activeIndex + 1; i < matchedIndex; i++) {
    boundaries[i] = tracker.lastSeenAtActive;
  }

  return { ...tracker, activeIndex: matchedIndex, boundaries, lastSeenAtActive: projectsFound };
}

/** Projeta o tracker + a contagem acumulada atual no estado visível de cada raiz. */
export function projectRootStates(tracker: ScanRootTracker, projectsFound: number, isScanning: boolean): RootScanState[] {
  return tracker.roots.map((root, index) => {
    const previousBoundary = index === 0 ? 0 : (tracker.boundaries[index - 1] ?? 0);

    if (index < tracker.activeIndex) {
      return { root, status: "done", projects: (tracker.boundaries[index] ?? 0) - previousBoundary };
    }
    if (index === tracker.activeIndex) {
      return { root, status: isScanning ? "scanning" : "done", projects: projectsFound - previousBoundary };
    }
    return { root, status: "waiting", projects: 0 };
  });
}
