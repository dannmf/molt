import { AlertIcon } from "../icons/Icons";
import { daysSince } from "../../lib/format";
import { useAppStore } from "../../store/useAppStore";

const REMINDER_THRESHOLD_DAYS = 7;

export function ScanReminderBanner() {
  const view = useAppStore((state) => state.view);
  const lastScanAt = useAppStore((state) => state.lastScanAt);
  const setView = useAppStore((state) => state.setView);

  if (view === "onboarding" || lastScanAt === null) {
    return null;
  }

  const days = daysSince(lastScanAt);
  if (days < REMINDER_THRESHOLD_DAYS) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
      <AlertIcon className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1">
        A última varredura foi há {days} dias. Os dados exibidos podem estar desatualizados.
      </span>
      <button
        type="button"
        onClick={() => setView("onboarding")}
        className="flex-shrink-0 rounded-md border border-amber-300 px-2 py-1 font-medium hover:bg-amber-100 dark:border-amber-800 dark:hover:bg-amber-900/40"
      >
        Varrer novamente
      </button>
    </div>
  );
}
