import { useEffect, useState } from "react";
import { api } from "./api";
import type { GitTarget } from "./gitApi";
import { targetKey } from "./useGit";

const NO_FILES: string[] = [];

export function useProjectFiles(target: GitTarget | undefined): string[] {
  const [files, setFiles] = useState<string[]>(NO_FILES);
  const key = target ? targetKey(target) : null;

  useEffect(() => {
    setFiles(NO_FILES);
    if (!target) return;
    let isCurrent = true;
    api.listProjectFiles(target).then(
      (listed) => isCurrent && setFiles(listed),
      () => isCurrent && setFiles(NO_FILES),
    );
    return () => {
      isCurrent = false;
    };
  }, [key]);

  return files;
}
