import { useEffect, useState } from "react";
import { api } from "./api";
import type { MergeMethod } from "./types";

export const MERGE_METHOD_SETTING = "pullRequestMergeMethod";
export const DEFAULT_MERGE_METHOD: MergeMethod = "merge";
export const MERGE_METHODS: MergeMethod[] = ["merge", "squash", "rebase"];

function isMergeMethod(value: string | undefined): value is MergeMethod {
  return MERGE_METHODS.some((method) => method === value);
}

export function useMergeMethod(): [MergeMethod, (method: MergeMethod) => void] {
  const [method, setMethod] = useState<MergeMethod>(DEFAULT_MERGE_METHOD);

  useEffect(() => {
    let isCurrent = true;
    api.getSettings().then(
      (settings) => {
        const saved = settings[MERGE_METHOD_SETTING];
        if (isCurrent && isMergeMethod(saved)) setMethod(saved);
      },
      () => undefined,
    );
    return () => {
      isCurrent = false;
    };
  }, []);

  function choose(next: MergeMethod) {
    setMethod(next);
    void api.setSetting(MERGE_METHOD_SETTING, next);
  }

  return [method, choose];
}
