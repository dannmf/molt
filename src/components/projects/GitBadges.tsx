import type { GitInfo } from "../../types";
import { AlertIcon } from "../icons/Icons";
import { Pill } from "../shared/Pill";

const ALERT_CLASS = "bg-orange-500/15 text-orange-700 dark:text-orange-300";

/** Badges de alerta de git: "sujo" e "N não enviados". Nada aparece se o projeto estiver limpo. */
export function GitBadges({ git }: { git: GitInfo | null }) {
  if (!git) {
    return null;
  }

  const badges: string[] = [];
  if (git.dirty) {
    badges.push("sujo");
  }
  if (git.unpushedCommits > 0) {
    badges.push(git.unpushedCommits === 1 ? "1 não enviado" : `${git.unpushedCommits} não enviados`);
  }

  if (badges.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {badges.map((label) => (
        <Pill key={label} className={ALERT_CLASS}>
          <AlertIcon className="h-3 w-3" />
          {label}
        </Pill>
      ))}
    </div>
  );
}
