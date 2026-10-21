import type { DockerContainerInfo } from "../../types";

export function RunningContainerCard({ container }: { container: DockerContainerInfo }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-black/10 bg-white p-4 dark:border-white/10 dark:bg-neutral-900">
      <p className="truncate font-medium text-neutral-900 dark:text-neutral-100" title={container.name}>
        {container.name}
      </p>
      <p className="truncate text-xs text-neutral-500 dark:text-neutral-500" title={container.image}>
        {container.image}
      </p>
      <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">{container.status}</p>
    </div>
  );
}
