import { riskBadge } from "../../lib/cacheRisk";
import type { CacheRisk } from "../../types";
import { Pill } from "../shared/Pill";

export function RiskPill({ risk }: { risk: CacheRisk }) {
  const badge = riskBadge(risk);
  return <Pill className={badge.className}>{badge.label}</Pill>;
}
