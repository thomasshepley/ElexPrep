import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

export interface LoadResult<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  /** Local update after a mutation, without a refetch. */
  setData: React.Dispatch<React.SetStateAction<T | undefined>>;
}

/**
 * Loads data for a component and keeps the latest result: a response from a superseded request
 * (deps changed, e.g. navigating between jobs quickly) is dropped instead of overwriting fresher
 * data, and a failure lands in `error` instead of leaving the component blank.
 */
export function useLoad<T>(fetcher: () => Promise<T>, deps: DependencyList): LoadResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await fetcherRef.current();
      if (id === requestId.current) setData(result);
    } catch (e) {
      if (id === requestId.current) setError((e as Error).message || 'Something went wrong');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      requestId.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}
