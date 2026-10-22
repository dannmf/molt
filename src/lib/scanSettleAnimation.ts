/** Anima a transição final da tela de varredura (porcentagem, contador e lista
 * de raízes) de forma suave e com duração mínima garantida, independente de
 * quantos eventos `scan://progress` chegaram de fato. Isso evita que uma
 * varredura real rápida (poucas pastas, scanner termina em menos de 100ms —
 * o intervalo de emissão do backend) pule direto de 0% para o resultado
 * final sem nenhuma animação visível.
 *
 * `t` é a fração de tempo decorrido (0..1) dentro da duração do "settle";
 * o chamador (useScan) é quem dirige um loop de requestAnimationFrame e
 * calcula `t`, mantendo esta função pura e testável.
 */

import type { RootScanState } from "./scanRootProgress";

export interface SettleFrame {
  states: RootScanState[];
  progressPct: number;
  projectsFound: number;
  done: boolean;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function computeSettleFrame(
  roots: string[],
  startCounts: number[],
  finalCounts: number[],
  t: number,
): SettleFrame {
  const clampedT = Math.min(1, Math.max(0, t));

  if (roots.length === 0) {
    return { states: [], progressPct: Math.round(clampedT * 100), projectsFound: 0, done: clampedT >= 1 };
  }

  // O índice da raiz ativa avança de forma linear no tempo (uma raiz de cada
  // vez, em ritmo constante); só o preenchimento do contador dentro da raiz
  // ativa usa easing, para um efeito de "desacelera ao chegar no total".
  const rawIndex = clampedT * roots.length;
  const activeIndex = Math.min(roots.length - 1, Math.floor(rawIndex));
  const withinRoot = easeOutCubic(Math.min(1, rawIndex - activeIndex));

  const states: RootScanState[] = roots.map((root, index) => {
    const finalValue = finalCounts[index] ?? 0;
    if (index < activeIndex) {
      return { root, status: "done", projects: finalValue };
    }
    if (index === activeIndex) {
      const startValue = startCounts[index] ?? 0;
      const projects = clampedT >= 1 ? finalValue : Math.round(startValue + (finalValue - startValue) * withinRoot);
      return { root, status: clampedT >= 1 ? "done" : "scanning", projects };
    }
    return { root, status: "waiting", projects: 0 };
  });

  return {
    states,
    progressPct: clampedT >= 1 ? 100 : Math.round(easeOutCubic(clampedT) * 100),
    projectsFound: states.reduce((sum, state) => sum + state.projects, 0),
    done: clampedT >= 1,
  };
}
