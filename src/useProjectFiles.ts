import { useEffect, useState } from "react";
import { api } from "./api";

const NO_FILES: string[] = [];

export function useProjectFiles(projectId: string | undefined): string[] {
  const [files, setFiles] = useState<string[]>(NO_FILES);

  useEffect(() => {
    setFiles(NO_FILES);
    if (!projectId) return;
    let isCurrent = true;
    api.listProjectFiles(projectId).then(
      (listed) => isCurrent && setFiles(listed),
      () => isCurrent && setFiles(NO_FILES),
    );
    return () => {
      isCurrent = false;
    };
  }, [projectId]);

  return files;
}
