import { useCallback, useEffect, useRef, useState } from "react";

export interface Loaded<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
  refresh: () => void;
}

interface LoadState<T> {
  data: T | null;
  error: string | null;
  isLoading: boolean;
}

export function useLoaded<T>(key: string | null, load: () => Promise<T>): Loaded<T> {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, isLoading: false });
  const [generation, setGeneration] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    if (key === null) {
      setState({ data: null, error: null, isLoading: false });
      return;
    }
    let isCurrent = true;
    setState((current) => ({ ...current, isLoading: true }));
    loadRef.current().then(
      (data) => isCurrent && setState({ data, error: null, isLoading: false }),
      (error) => isCurrent && setState((current) => ({ ...current, error: String(error), isLoading: false })),
    );
    return () => {
      isCurrent = false;
    };
  }, [key, generation]);

  const refresh = useCallback(() => setGeneration((current) => current + 1), []);
  return { ...state, refresh };
}
