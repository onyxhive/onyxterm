import { useCallback, useEffect, useState } from "react";
import { api } from "./api";

export type ProjectBranches = Record<string, string | null>;

export function useProjectBranches(projectIds: string[]) {
  const [branches, setBranches] = useState<ProjectBranches>({});

  const refresh = useCallback((projectId: string) => {
    const store = (branch: string | null) => setBranches((current) => ({ ...current, [projectId]: branch }));
    api.projectBranch(projectId).then(store, () => store(null));
  }, []);

  const projectKey = projectIds.join(",");
  useEffect(() => {
    projectIds.forEach(refresh);
  }, [projectKey, refresh]);

  return { branches, refresh };
}
