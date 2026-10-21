import { CachesView } from "./components/caches/CachesView";
import { HistoryView } from "./components/history/HistoryView";
import { OnboardingView } from "./components/onboarding/OnboardingView";
import { ProjectsView } from "./components/projects/ProjectsView";
import { ScanReminderBanner } from "./components/shared/ScanReminderBanner";
import { Sidebar } from "./components/shell/Sidebar";
import { useThemeSync } from "./hooks/useThemeSync";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const view = useAppStore((state) => state.view);
  useThemeSync();

  return (
    <div className="flex h-screen w-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <ScanReminderBanner />
        <main className="flex-1 overflow-hidden">
          {view === "onboarding" && <OnboardingView />}
          {view === "projects" && <ProjectsView />}
          {view === "caches" && <CachesView />}
          {view === "history" && <HistoryView />}
        </main>
      </div>
    </div>
  );
}
