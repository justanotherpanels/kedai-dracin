"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { BottomNav } from "@/components/BottomNav";
import { DramaEngageActions } from "@/components/DramaEngageActions";
import { MobileShell } from "@/components/MobileShell";
import { VerticalPlayer } from "@/components/VerticalPlayer";
import { useInfiniteDramas } from "@/hooks/useInfiniteDramas";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";
import type { Drama, LikePayload, PlayPayload } from "@/lib/types";

export default function DramaAutoPlayPage() {
  return (
    <MobileShell>
      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1 overflow-hidden bg-black pb-[var(--bottom-nav-h)]">
          <DramaFeed />
        </div>
        <BottomNav />
      </div>
    </MobileShell>
  );
}

type EngageMap = Record<number, { liked: boolean; saved: boolean; likesCount: number }>;

function DramaFeed() {
  const { token, user, setUser, ready } = useAuth();
  const router = useRouter();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<number, HTMLElement>>(new Map());
  const { items, loading, hasMore, error, loadingMore, loadMore } = useInfiniteDramas({
    token,
    ready,
  });
  const [activeIndex, setActiveIndex] = useState(0);
  const [playCache, setPlayCache] = useState<Record<number, PlayPayload>>({});
  const [playErrors, setPlayErrors] = useState<Record<number, string>>({});
  const [loadingIds, setLoadingIds] = useState<Record<number, boolean>>({});
  const [engage, setEngage] = useState<EngageMap>({});
  const [engageBusy, setEngageBusy] = useState<Record<number, boolean>>({});
  const playCacheRef = useRef(playCache);
  const loadingIdsRef = useRef(loadingIds);

  useEffect(() => {
    playCacheRef.current = playCache;
  }, [playCache]);

  useEffect(() => {
    loadingIdsRef.current = loadingIds;
  }, [loadingIds]);

  useEffect(() => {
    setEngage((prev) => {
      const next = { ...prev };
      for (const drama of items) {
        if (!next[drama.id]) {
          next[drama.id] = {
            liked: Boolean(drama.is_liked),
            saved: Boolean(drama.is_saved),
            likesCount: drama.likes_count ?? 0,
          };
        }
      }
      return next;
    });
  }, [items]);

  useEffect(() => {
    if (activeIndex >= items.length - 3 && hasMore) {
      void loadMore();
    }
  }, [activeIndex, items.length, hasMore, loadMore]);

  const loadEpisode = useCallback(
    async (drama: Drama) => {
      if (!ready) return;
      if (playCacheRef.current[drama.id] || loadingIdsRef.current[drama.id]) return;

      loadingIdsRef.current = { ...loadingIdsRef.current, [drama.id]: true };
      setLoadingIds((prev) => ({ ...prev, [drama.id]: true }));
      setPlayErrors((prev) => {
        const next = { ...prev };
        delete next[drama.id];
        return next;
      });

      try {
        const res = await apiRequest<PlayPayload>(`/play/drama/${drama.id}/episode/1`, {
          token,
          body: { resolution: "auto" },
        });
        playCacheRef.current = { ...playCacheRef.current, [drama.id]: res.data };
        setPlayCache((prev) => ({ ...prev, [drama.id]: res.data }));
        if (user && typeof res.data.coin_balance === "number") {
          setUser({ ...user, coin: res.data.coin_balance });
        }
      } catch (err) {
        const message =
          err instanceof ApiRequestError
            ? err.code === "login_required" || ((err.status === 401 || err.status === 403) && !token)
              ? err.message || "Masuk untuk menonton drama ini."
              : err.message
            : "Gagal memutar drama.";
        setPlayErrors((prev) => ({ ...prev, [drama.id]: message }));
      } finally {
        loadingIdsRef.current = { ...loadingIdsRef.current, [drama.id]: false };
        setLoadingIds((prev) => ({ ...prev, [drama.id]: false }));
      }
    },
    [ready, token, user, setUser],
  );

  useEffect(() => {
    const nearby = [activeIndex - 1, activeIndex, activeIndex + 1];
    for (const i of nearby) {
      const drama = items[i];
      if (drama) void loadEpisode(drama);
    }
  }, [activeIndex, items, loadEpisode]);

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let best: { index: number; ratio: number } | null = null;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isFinite(index)) continue;
          if (!best || entry.intersectionRatio > best.ratio) {
            best = { index, ratio: entry.intersectionRatio };
          }
        }
        if (best && best.ratio >= 0.55) {
          setActiveIndex(best.index);
        }
      },
      { root, threshold: [0.55, 0.75, 0.9] },
    );

    const slides = root.querySelectorAll<HTMLElement>("[data-index]");
    slides.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [items.length]);

  const toggleLike = async (dramaId: number) => {
    if (engageBusy[dramaId]) return;
    if (!token) {
      router.push(loginUrl("/drama"));
      return;
    }
    const current = engage[dramaId] ?? { liked: false, saved: false, likesCount: 0 };
    setEngageBusy((prev) => ({ ...prev, [dramaId]: true }));
    try {
      if (current.liked) {
        const res = await apiRequest<LikePayload>(`/like-drama/${dramaId}`, {
          method: "DELETE",
          token,
        });
        setEngage((prev) => ({
          ...prev,
          [dramaId]: { ...current, liked: false, likesCount: res.data.likes_count },
        }));
      } else {
        const res = await apiRequest<LikePayload>("/like-drama", {
          token,
          body: { id_drama: dramaId },
        });
        setEngage((prev) => ({
          ...prev,
          [dramaId]: { ...current, liked: true, likesCount: res.data.likes_count },
        }));
      }
    } catch {
      /* ignore UI toast for now */
    } finally {
      setEngageBusy((prev) => ({ ...prev, [dramaId]: false }));
    }
  };

  const toggleSave = async (dramaId: number) => {
    if (engageBusy[dramaId]) return;
    if (!token) {
      router.push(loginUrl("/drama"));
      return;
    }
    const current = engage[dramaId] ?? { liked: false, saved: false, likesCount: 0 };
    setEngageBusy((prev) => ({ ...prev, [dramaId]: true }));
    try {
      if (current.saved) {
        await apiRequest(`/saved-drama/${dramaId}`, { method: "DELETE", token });
        setEngage((prev) => ({
          ...prev,
          [dramaId]: { ...current, saved: false },
        }));
      } else {
        await apiRequest("/saved-drama", { token, body: { id_drama: dramaId } });
        setEngage((prev) => ({
          ...prev,
          [dramaId]: { ...current, saved: true },
        }));
      }
    } catch {
      /* ignore */
    } finally {
      setEngageBusy((prev) => ({ ...prev, [dramaId]: false }));
    }
  };

  if (loading && items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
      </div>
    );
  }

  if (error && items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-rose-300">
        {error}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/50">
        Belum ada drama untuk diputar.
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className="drama-feed-scroll h-full w-full snap-y snap-mandatory overflow-y-auto overscroll-y-contain"
    >
      {items.map((drama, index) => {
        const play = playCache[drama.id];
        const playError = playErrors[drama.id];
        const isLoading = loadingIds[drama.id];
        const active = index === activeIndex;
        const nearby = Math.abs(index - activeIndex) <= 1;
        const state = engage[drama.id] ?? {
          liked: Boolean(drama.is_liked),
          saved: Boolean(drama.is_saved),
          likesCount: drama.likes_count ?? 0,
        };

        return (
          <section
            key={drama.id}
            data-index={index}
            ref={(node) => {
              if (node) slideRefs.current.set(index, node);
              else slideRefs.current.delete(index);
            }}
            className="relative h-full w-full shrink-0 snap-start snap-always"
          >
            {nearby && play?.stream_url ? (
              <VerticalPlayer
                src={play.stream_url}
                title={drama.title}
                episodeLabel={play.episode_name || "Episode 1 · Auto Play"}
                active={active}
                allowSwipeNav={false}
                hasPrev={index > 0}
                hasNext={index < items.length - 1 || hasMore}
                onPrev={() => {
                  const prev = slideRefs.current.get(index - 1);
                  prev?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                onNext={() => {
                  const next = slideRefs.current.get(index + 1);
                  if (next) next.scrollIntoView({ behavior: "smooth", block: "start" });
                  else if (hasMore) void loadMore();
                }}
                onBack={() => router.replace(`/drama/${drama.id}`)}
                sideActions={
                  <DramaEngageActions
                    liked={state.liked}
                    saved={state.saved}
                    likesCount={state.likesCount}
                    busy={engageBusy[drama.id]}
                    onToggleLike={() => void toggleLike(drama.id)}
                    onToggleSave={() => void toggleSave(drama.id)}
                  />
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 bg-black px-8 text-center">
                {isLoading && (
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
                )}
                {playError && (
                  <>
                    <p className="text-sm text-rose-300">{playError}</p>
                    {!token && (
                      <button
                        type="button"
                        onClick={() => router.push(loginUrl("/drama"))}
                        className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#1a0b10]"
                      >
                        Masuk
                      </button>
                    )}
                  </>
                )}
                {!isLoading && !playError && (
                  <p className="text-sm text-white/50">{drama.title}</p>
                )}
              </div>
            )}

            <div className="pointer-events-none absolute bottom-24 left-3 z-40">
              <Link
                href={`/drama/${drama.id}`}
                className="pointer-events-auto rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-medium backdrop-blur"
              >
                Semua episode · {index + 1}/{items.length}
                {hasMore ? "+" : ""}
              </Link>
            </div>
          </section>
        );
      })}

      {loadingMore && (
        <div className="pointer-events-none absolute top-4 right-4 z-40">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-[var(--accent)]" />
        </div>
      )}
    </div>
  );
}
