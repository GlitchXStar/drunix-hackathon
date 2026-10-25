"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Lightweight hook for calling async API functions with loading/error state.
 * Usage:
 *   const { data, loading, error, refetch } = useApi(() => api.listDocuments());
 *
 * Pass `null` as the fetcher to skip the initial call.
 */
export function useApi<T>(fetcher: (() => Promise<T>) | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(fetcher !== null);
  const [error, setError] = useState<string | null>(null);

  // Keep latest fetcher in ref to avoid re-triggering effects when callers pass inline closures
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Track active fetch to cancel state updates if unmounted or if refetched
  const activeFetchIdRef = useRef(0);

  const run = useCallback(async () => {
    const fn = fetcherRef.current;
    if (!fn) {
      setLoading(false);
      return;
    }
    const fetchId = ++activeFetchIdRef.current;
    setLoading(true);
    setError(null);

    try {
      const result = await fn();
      if (activeFetchIdRef.current === fetchId) {
        setData(result);
        setError(null);
      }
    } catch (err: any) {
      if (activeFetchIdRef.current === fetchId) {
        setError(err?.message || "Request failed");
      }
    } finally {
      if (activeFetchIdRef.current === fetchId) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    run();
    return () => {
      // Invalidate in-flight request on unmount or deps change
      activeFetchIdRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, ...deps]);

  return { data, loading, error, refetch: run, setData };
}

/**
 * Hook for calling a mutation (POST/PATCH/DELETE) with loading/error state.
 * Usage:
 *   const { execute, loading, error } = useMutation(api.uploadDocument);
 */
export function useMutation<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<TResult | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const execute = useCallback(
    async (...args: TArgs) => {
      setLoading(true);
      setError(null);
      try {
        const result = await fnRef.current(...args);
        if (isMountedRef.current) {
          setData(result);
        }
        return result;
      } catch (err: any) {
        if (isMountedRef.current) {
          setError(err?.message || "Request failed");
        }
        throw err;
      } finally {
        if (isMountedRef.current) {
          setLoading(false);
        }
      }
    },
    [],
  );

  return { execute, loading, error, data };
}

