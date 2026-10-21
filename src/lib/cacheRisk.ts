import type { CacheRisk } from "../types";

export interface RiskBadge {
  label: string;
  className: string;
}

const BADGES: Record<CacheRisk, RiskBadge> = {
  safe: { label: "Seguro", className: "bg-green-500/15 text-green-700 dark:text-green-300" },
  rebuildable: { label: "Recriável", className: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  caution: { label: "Atenção", className: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
};

export function riskBadge(risk: CacheRisk): RiskBadge {
  return BADGES[risk];
}
