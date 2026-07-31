"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { apiRequest, ApiRequestError } from "@/lib/api";
import type { Drama } from "@/lib/types";
import { usePageLimit } from "@/hooks/usePageLimit";

type Options = {
  token: string | null;
  ready?: boolean;
  search?: string;
  providerId?: number | null;
  sort?: "latest" | "likes" | "title";
  /** dashboard | drama | most-liked */
  source?: "dashboard" | "drama" | "most-liked";
  enabled?: boolean;
  rootRef?: RefObject<Element | null>;
};

export function useInfiniteDramas({
  token,
  ready = true,
  search = "",
  providerId = null,
  sort = "latest",
  source = "dashboard",
  enabled = true,
  rootRef,
}: Options) {
  const limit = usePageLimit();
  const [items, setItems] = useState<Drama[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const fetchingRef = useRef(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const endpoint =
    source === "most-liked"
      ? "/drama/most-liked"
      : source === "drama"
        ? "/drama"
        : "/dashboard/drama";

  const reset = useCallback(() => {
    setItems([]);
    setPage(1);
    setHasMore(true);
    setError(null);
    setReloadKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!enabled || !ready) return;

    let cancelled = false;
    fetchingRef.current = true;
    setLoading(true);
    setError(null);

    void (async () => {
      try {
        const res = await apiRequest<Drama[]>(endpoint, {
          token,
          query: {
            page: 1,
            limit,
            search: search || undefined,
            provider_id: providerId ?? undefined,
            sort: source === "drama" ? sort : undefined,
          },
        });
        if (cancelled) return;
        const data = res.data ?? [];
        setItems(data);
        setPage(1);
        const last = res.meta?.last_page ?? 1;
        setHasMore(1 < last && data.length > 0);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof ApiRequestError ? err.message : "Gagal memuat drama.");
        setItems([]);
        setHasMore(false);
      } finally {
        if (!cancelled) {
          setLoading(false);
          fetchingRef.current = false;
        }
      }
    })();

    return () => {
      cancelled = true;
      fetchingRef.current = false;
    };
  }, [token, ready, search, providerId, sort, source, endpoint, limit, enabled, reloadKey]);

  const loadMore = useCallback(async () => {
    if (!ready || !hasMore || loading || loadingMore || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await apiRequest<Drama[]>(endpoint, {
        token,
        query: {
          page: nextPage,
          limit,
          search: search || undefined,
          provider_id: providerId ?? undefined,
          sort: source === "drama" ? sort : undefined,
        },
      });
      const data = res.data ?? [];
      setItems((prev) => {
        const seen = new Set(prev.map((d) => d.id));
        return [...prev, ...data.filter((d) => !seen.has(d.id))];
      });
      setPage(nextPage);
      const last = res.meta?.last_page ?? nextPage;
      setHasMore(nextPage < last && data.length > 0);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal memuat halaman berikutnya.");
    } finally {
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [
    token,
    ready,
    hasMore,
    loading,
    loadingMore,
    page,
    limit,
    search,
    providerId,
    sort,
    source,
    endpoint,
  ]);

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore();
      },
      { root: rootRef?.current ?? null, rootMargin: "320px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loadMore, items.length, rootRef]);

  return {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    sentinelRef,
    reset,
    limit,
    loadMore,
  };
}
