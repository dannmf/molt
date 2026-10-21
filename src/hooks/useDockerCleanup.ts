import { useMutation } from "@tanstack/react-query";

import { cleanDockerResource } from "../api/client";

export function useDockerCleanup() {
  return useMutation({
    mutationFn: (id: string) => cleanDockerResource(id),
  });
}
