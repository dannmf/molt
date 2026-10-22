import type { CacheRisk } from "../types";

export interface RiskGroup {
  label: string;
  description: string;
  marker: "circle" | "square" | "triangle";
  colorClass: string;
}

const GROUPS: Record<CacheRisk, RiskGroup> = {
  safe: {
    label: "Seguro",
    description: "A ferramenta recria sozinha quando precisar.",
    marker: "circle",
    colorClass: "text-safe",
  },
  rebuildable: {
    label: "Recriável",
    description: "Volta no próximo build ou install, que fica mais lento uma vez.",
    marker: "square",
    colorClass: "text-recreate",
  },
  caution: {
    label: "Atenção",
    description: "Contém algo que não volta sozinho. Leia antes de limpar.",
    marker: "triangle",
    colorClass: "text-risk",
  },
};

/** Ordem de exibição dos grupos de risco na tabela de Caches. */
export const RISK_ORDER: CacheRisk[] = ["safe", "rebuildable", "caution"];

export function riskGroup(risk: CacheRisk): RiskGroup {
  return GROUPS[risk];
}
