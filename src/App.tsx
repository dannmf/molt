import { CachesView } from "./components/caches/CachesView";
import { DockerView } from "./components/docker/DockerView";
import { OnboardingView } from "./components/onboarding/OnboardingView";
import { ProjectsView } from "./components/projects/ProjectsView";
import { Sidebar } from "./components/shell/Sidebar";
import { useThemeSync } from "./hooks/useThemeSync";
import { useAppStore } from "./store/useAppStore";

export default function App() {
  const view = useAppStore((state) => state.view);
  useThemeSync();

  return (
    <div className="flex h-screen w-screen bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {view === "onboarding" && <OnboardingView />}
        {view === "projects" && <ProjectsView />}
        {view === "caches" && <CachesView />}
        {view === "docker" && <DockerView />}
      </main>
    </div>
  );
}
