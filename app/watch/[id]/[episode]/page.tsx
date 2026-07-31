"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { DramaEngageActions } from "@/components/DramaEngageActions";
import { MobileShell } from "@/components/MobileShell";
import { VerticalPlayer } from "@/components/VerticalPlayer";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";
import type { Drama, Episode, EpisodeListPayload, LikePayload, PlayPayload } from "@/lib/types";

function isPremiumEpisode(ep: Pick<Episode, "episode" | "is_locked" | "coin_cost" | "type">) {
  return ep.is_locked || ep.coin_cost > 0 || ep.type?.toUpperCase() === "VIP" || ep.episode > 20;
}

export default function WatchPage() {
  return (
    <MobileShell>
      <WatchContent />
    </MobileShell>
  );
}

function WatchContent() {
  const params = useParams<{ id: string; episode: string }>();
  const dramaId = Number(params.id);
  const initialEpisode = Number(params.episode);
  const { token, user, setUser, ready } = useAuth();
  const router = useRouter();

  const scrollerRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Map<number, HTMLElement>>(new Map());
  const urlSyncLock = useRef(false);
  const currentEpisodeRef = useRef(initialEpisode);

  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [dramaMeta, setDramaMeta] = useState<Drama | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [currentEpisode, setCurrentEpisode] = useState(initialEpisode);

  const [playCache, setPlayCache] = useState<Record<number, PlayPayload>>({});
  const [playErrors, setPlayErrors] = useState<Record<number, string>>({});
  const [loadingEps, setLoadingEps] = useState<Record<number, boolean>>({});
  const playCacheRef = useRef(playCache);
  const loadingEpsRef = useRef(loadingEps);

  const [liked, setLiked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [engageBusy, setEngageBusy] = useState(false);

  useEffect(() => {
    playCacheRef.current = playCache;
  }, [playCache]);

  useEffect(() => {
    loadingEpsRef.current = loadingEps;
  }, [loadingEps]);

  useEffect(() => {
    currentEpisodeRef.current = currentEpisode;
  }, [currentEpisode]);

  const leaveWatch = useCallback(() => {
    // replace: jangan push agar history tidak muter watch ↔ detail
    router.replace(`/drama/${dramaId}`);
  }, [router, dramaId]);

  // Load episode list once
  useEffect(() => {
    if (!ready || !dramaId) return;
    let cancelled = false;
    setListLoading(true);
    setListError(null);

    void (async () => {
      try {
        const res = await apiRequest<EpisodeListPayload>(`/play/drama/${dramaId}/episode`, {
          token,
        });
        if (cancelled) return;
        setEpisodes(res.data.episodes);
        setDramaMeta(res.data.drama);
        setLiked(Boolean(res.data.drama.is_liked));
        setSaved(Boolean(res.data.drama.is_saved));
        setLikesCount(res.data.drama.likes_count ?? 0);

        const startIdx = res.data.episodes.findIndex((e) => e.episode === initialEpisode);
        setActiveIndex(startIdx >= 0 ? startIdx : 0);
      } catch (err) {
        if (!cancelled) {
          setListError(err instanceof ApiRequestError ? err.message : "Gagal memuat episode.");
        }
      } finally {
        if (!cancelled) setListLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dramaId, token, ready]);

  // Scroll to initial episode when list ready
  useEffect(() => {
    if (!episodes.length || listLoading) return;
    const idx = episodes.findIndex((e) => e.episode === initialEpisode);
    if (idx < 0) return;
    setActiveIndex(idx);
    setCurrentEpisode(initialEpisode);
    currentEpisodeRef.current = initialEpisode;
    requestAnimationFrame(() => {
      const node = slideRefs.current.get(idx);
      node?.scrollIntoView({ behavior: "auto", block: "start" });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes.length, listLoading]);

  const loadEpisodePlay = useCallback(
    async (ep: Episode) => {
      if (!ready || !dramaId) return;
      if (playCacheRef.current[ep.episode] || loadingEpsRef.current[ep.episode]) return;

      if (isPremiumEpisode(ep) && !token) {
        setPlayErrors((prev) => ({
          ...prev,
          [ep.episode]: "Episode VIP — masuk untuk menonton.",
        }));
        return;
      }

      loadingEpsRef.current = { ...loadingEpsRef.current, [ep.episode]: true };
      setLoadingEps((prev) => ({ ...prev, [ep.episode]: true }));
      setPlayErrors((prev) => {
        const next = { ...prev };
        delete next[ep.episode];
        return next;
      });

      try {
        const res = await apiRequest<PlayPayload>(
          `/play/drama/${dramaId}/episode/${ep.episode}`,
          { token, body: { resolution: "auto" } },
        );
        playCacheRef.current = { ...playCacheRef.current, [ep.episode]: res.data };
        setPlayCache((prev) => ({ ...prev, [ep.episode]: res.data }));
        if (user && typeof res.data.coin_balance === "number") {
          setUser({ ...user, coin: res.data.coin_balance });
        }
      } catch (err) {
        if (err instanceof ApiRequestError) {
          if (err.code === "login_required" || ((err.status === 401 || err.status === 403) && !token)) {
            setPlayErrors((prev) => ({
              ...prev,
              [ep.episode]: err.message || "Episode VIP — masuk untuk menonton.",
            }));
          } else {
            setPlayErrors((prev) => ({
              ...prev,
              [ep.episode]: err.message || "Gagal memutar episode.",
            }));
          }
        } else {
          setPlayErrors((prev) => ({
            ...prev,
            [ep.episode]: "Gagal memutar episode.",
          }));
        }
      } finally {
        loadingEpsRef.current = { ...loadingEpsRef.current, [ep.episode]: false };
        setLoadingEps((prev) => ({ ...prev, [ep.episode]: false }));
      }
    },
    [ready, dramaId, token, user, setUser],
  );

  // Prefetch nearby episodes
  useEffect(() => {
    if (!episodes.length) return;
    for (const i of [activeIndex - 1, activeIndex, activeIndex + 1]) {
      const ep = episodes[i];
      if (ep) void loadEpisodePlay(ep);
    }
  }, [activeIndex, episodes, loadEpisodePlay]);

  // Intersection observer for active slide
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !episodes.length) return;

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
          const ep = episodes[best.index];
          // Sync URL tanpa Next router — hindari history menumpuk per episode
          if (ep && ep.episode !== currentEpisodeRef.current && !urlSyncLock.current) {
            urlSyncLock.current = true;
            currentEpisodeRef.current = ep.episode;
            setCurrentEpisode(ep.episode);
            window.history.replaceState(null, "", `/watch/${dramaId}/${ep.episode}`);
            window.setTimeout(() => {
              urlSyncLock.current = false;
            }, 200);
          }
        }
      },
      { root, threshold: [0.55, 0.75, 0.9] },
    );

    const slides = root.querySelectorAll<HTMLElement>("[data-index]");
    slides.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [episodes, dramaId]);

  const scrollToIndex = (idx: number) => {
    const node = slideRefs.current.get(idx);
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const toggleLike = async () => {
    if (!dramaId || engageBusy) return;
    if (!token) {
      router.push(loginUrl(`/watch/${dramaId}/${currentEpisode}`));
      return;
    }
    setEngageBusy(true);
    try {
      if (liked) {
        const res = await apiRequest<LikePayload>(`/like-drama/${dramaId}`, {
          method: "DELETE",
          token,
        });
        setLiked(false);
        setLikesCount(res.data.likes_count);
      } else {
        const res = await apiRequest<LikePayload>("/like-drama", {
          token,
          body: { id_drama: dramaId },
        });
        setLiked(true);
        setLikesCount(res.data.likes_count);
      }
    } catch {
      /* ignore */
    } finally {
      setEngageBusy(false);
    }
  };

  const toggleSave = async () => {
    if (!dramaId || engageBusy) return;
    if (!token) {
      router.push(loginUrl(`/watch/${dramaId}/${currentEpisode}`));
      return;
    }
    setEngageBusy(true);
    try {
      if (saved) {
        await apiRequest(`/saved-drama/${dramaId}`, { method: "DELETE", token });
        setSaved(false);
      } else {
        await apiRequest("/saved-drama", { token, body: { id_drama: dramaId } });
        setSaved(true);
      }
    } catch {
      /* ignore */
    } finally {
      setEngageBusy(false);
    }
  };

  if (listLoading && !episodes.length) {
    return (
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
      </div>
    );
  }

  if (listError && !episodes.length) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 bg-black px-8 text-center">
        <p className="text-sm text-rose-300">{listError}</p>
        <button
          type="button"
          onClick={leaveWatch}
          className="rounded-full bg-white/10 px-5 py-2.5 text-sm"
        >
          Kembali ke daftar
        </button>
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className="drama-feed-scroll relative min-h-0 flex-1 snap-y snap-mandatory overflow-y-auto overscroll-y-contain bg-black"
    >
      {episodes.map((ep, index) => {
        const play = playCache[ep.episode];
        const playError = playErrors[ep.episode];
        const isLoading = loadingEps[ep.episode];
        const active = index === activeIndex;
        const nearby = Math.abs(index - activeIndex) <= 1;
        const needsAuth = isPremiumEpisode(ep) && !token;

        return (
          <section
            key={ep.episode}
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
                title={dramaMeta?.title || play.drama || ""}
                episodeLabel={play.episode_name || ep.name || `Episode ${ep.episode}`}
                active={active}
                allowSwipeNav={false}
                hasPrev={index > 0}
                hasNext={index < episodes.length - 1}
                onPrev={() => scrollToIndex(index - 1)}
                onNext={() => {
                  if (index < episodes.length - 1) scrollToIndex(index + 1);
                }}
                onBack={leaveWatch}
                sideActions={
                  <DramaEngageActions
                    liked={liked}
                    saved={saved}
                    likesCount={likesCount}
                    busy={engageBusy}
                    onToggleLike={() => void toggleLike()}
                    onToggleSave={() => void toggleSave()}
                  />
                }
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-4 bg-black px-8 text-center">
                {isLoading && (
                  <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
                )}
                {(playError || needsAuth) && (
                  <>
                    <p className="text-sm text-rose-300">
                      {playError || "Episode VIP — masuk untuk menonton."}
                    </p>
                    {needsAuth && (
                      <button
                        type="button"
                        onClick={() =>
                          router.push(loginUrl(`/watch/${dramaId}/${ep.episode}`))
                        }
                        className="rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#1a0b10]"
                      >
                        Masuk untuk VIP
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={leaveWatch}
                      className="rounded-full bg-white/10 px-5 py-2.5 text-sm"
                    >
                      Kembali ke daftar
                    </button>
                  </>
                )}
                {!isLoading && !playError && !needsAuth && (
                  <p className="text-sm text-white/50">{ep.name || `Episode ${ep.episode}`}</p>
                )}
              </div>
            )}

            <div className="pointer-events-none absolute bottom-24 left-3 z-40">
              <p className="rounded-full bg-black/45 px-3 py-1.5 text-[11px] font-medium text-white/80 backdrop-blur">
                Ep {ep.episode} · {index + 1}/{episodes.length}
              </p>
            </div>
          </section>
        );
      })}
    </div>
  );
}
