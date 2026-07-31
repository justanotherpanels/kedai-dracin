"use client";

import { IconChevronLeft } from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import { isDoodSource } from "@/lib/dood-detect";
import "video.js/dist/video-js.css";

type VerticalPlayerProps = {
  src: string;
  title: string;
  episodeLabel: string;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onBack?: () => void;
  /** Pause when slide not in view (feed mode) */
  active?: boolean;
  /** Disable internal swipe; parent scroll-snap handles navigation */
  allowSwipeNav?: boolean;
  /** Like / save actions (right rail) */
  sideActions?: ReactNode;
};

type ResolveResponse = {
  ok: boolean;
  error?: string;
  src?: string;
  type?: string;
  poster?: string | null;
};

type ResolvedPlayable = {
  playSrc: string;
  type: string;
  poster?: string | null;
};

function inferMediaType(playSrc: string, resolvedType?: string): string {
  if (resolvedType) return resolvedType;
  if (playSrc.includes(".m3u8")) return "application/x-mpegURL";
  if (playSrc.startsWith("/api/dood/stream")) return "video/mp4";
  return "video/mp4";
}

/**
 * Same concept as doodplayer.md loadStream:
 * Dood URL → /api/dood/resolve → proxied /api/dood/stream (no official embed = no watermark).
 */
async function resolvePlayableSrc(raw: string): Promise<ResolvedPlayable> {
  if (raw.startsWith("/api/dood/stream")) {
    return { playSrc: raw, type: "video/mp4" };
  }

  if (raw.includes(".m3u8")) {
    return { playSrc: raw, type: "application/x-mpegURL" };
  }

  if (isDoodSource(raw)) {
    const endpoint = `/api/dood/resolve?url=${encodeURIComponent(raw)}`;
    const res = await fetch(endpoint, { cache: "no-store", credentials: "same-origin" });
    const data = (await res.json()) as ResolveResponse;
    if (!data.ok || !data.src) {
      throw new Error(data.error || "Gagal resolve");
    }
    return {
      playSrc: data.src,
      type: inferMediaType(data.src, data.type || "video/mp4"),
      poster: data.poster,
    };
  }

  return { playSrc: raw, type: inferMediaType(raw) };
}

export function VerticalPlayer({
  src,
  title,
  episodeLabel,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onBack,
  active = true,
  allowSwipeNav = true,
  sideActions,
}: VerticalPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<Player | null>(null);
  const [showUi, setShowUi] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const hideTimer = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const onNextRef = useRef(onNext);
  const hasNextRef = useRef(hasNext);
  const advancingRef = useRef(false);
  const activeRef = useRef(active);
  const playingRef = useRef(false);

  useEffect(() => {
    onNextRef.current = onNext;
    hasNextRef.current = hasNext;
  }, [onNext, hasNext]);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  useEffect(() => {
    advancingRef.current = false;
  }, [src]);

  const bumpUi = () => {
    setShowUi(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (playingRef.current) setShowUi(false);
    }, 2500);
  };

  useEffect(() => {
    bumpUi();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    playingRef.current = false;

    const disposePlayer = () => {
      const player = playerRef.current;
      playerRef.current = null;
      if (player && !player.isDisposed()) {
        try {
          player.dispose();
        } catch {
          /* ignore */
        }
      }
      if (mountRef.current) mountRef.current.innerHTML = "";
    };

    const fitPlayer = (player: Player) => {
      const box = playerBoxRef.current;
      if (!box) return;
      const w = box.clientWidth || 360;
      const h = box.clientHeight || 640;
      player.dimensions(w, h);
      player.trigger("resize");
    };

    const tryAutoPlay = async (player: Player) => {
      if (cancelled || !activeRef.current) return;
      try {
        await Promise.resolve(player.play());
        if (!cancelled) {
          playingRef.current = true;
          bumpUi();
        }
      } catch {
        if (cancelled) return;
        try {
          player.muted(true);
          await Promise.resolve(player.play());
          if (!cancelled) {
            playingRef.current = true;
            bumpUi();
          }
        } catch {
          /* autoplay blocked — same as doodplayer.md */
          if (!cancelled) {
            playingRef.current = false;
            setShowUi(true);
          }
        }
      }
    };

    /** Same pattern as doodplayer.md ensurePlayer() */
    const ensurePlayer = (): Player | null => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        return playerRef.current;
      }

      const mount = mountRef.current;
      if (!mount) return null;

      mount.innerHTML = "";
      const videoEl = document.createElement("video");
      videoEl.className = "video-js vjs-big-play-centered vjs-fill";
      videoEl.setAttribute("playsinline", "true");
      videoEl.setAttribute("preload", "auto");
      mount.appendChild(videoEl);

      const player = videojs(videoEl, {
        controls: true,
        fluid: false,
        fill: true,
        preload: "auto",
        playsinline: true,
        autoplay: false,
        bigPlayButton: true,
        controlBar: {
          pictureInPictureToggle: false,
        },
        html5: {
          vhs: { overrideNative: true },
          nativeAudioTracks: false,
          nativeVideoTracks: false,
        },
      });

      player.addClass("vjs-vertical-player");

      player.on("waiting", () => {
        if (!cancelled) setLoading(true);
      });
      player.on("canplay", () => {
        if (!cancelled) setLoading(false);
      });
      player.on("playing", () => {
        if (cancelled) return;
        setLoading(false);
        playingRef.current = true;
        bumpUi();
      });
      player.on("pause", () => {
        if (cancelled || player.ended()) return;
        playingRef.current = false;
        setShowUi(true);
      });
      player.on("error", () => {
        if (!cancelled) {
          setLoading(false);
          setError("Video gagal diputar.");
        }
      });
      player.on("ended", () => {
        if (cancelled || advancingRef.current) return;
        if (hasNextRef.current) {
          advancingRef.current = true;
          setLoading(true);
          onNextRef.current?.();
          return;
        }
        playingRef.current = false;
        setShowUi(true);
      });

      playerRef.current = player;
      return player;
    };

    /** Same concept as doodplayer.md loadStream() — no official embed */
    const loadStream = async () => {
      try {
        const resolved = await resolvePlayableSrc(src);
        if (cancelled) return;

        const player = ensurePlayer();
        if (!player) {
          setError("Player tidak siap.");
          setLoading(false);
          return;
        }

        fitPlayer(player);
        player.poster(resolved.poster || "");
        player.src({ src: resolved.playSrc, type: resolved.type || "video/mp4" });
        await new Promise<void>((resolveReady) => {
          player.ready(() => resolveReady());
        });
        if (cancelled) return;
        fitPlayer(player);
        requestAnimationFrame(() => fitPlayer(player));
        setLoading(false);
        await tryAutoPlay(player);
      } catch (err) {
        if (cancelled) return;
        disposePlayer();
        setLoading(false);
        setError(err instanceof Error ? err.message : "Gagal resolve");
      }
    };

    void loadStream();

    const onResize = () => {
      const player = playerRef.current;
      if (player && !player.isDisposed()) fitPlayer(player);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      disposePlayer();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, reloadToken]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;
    if (!active) {
      player.pause();
      playingRef.current = false;
      return;
    }
    Promise.resolve(player.play()).catch(() => {
      playingRef.current = false;
      setShowUi(true);
    });
  }, [active]);

  return (
    <div
      ref={playerBoxRef}
      className="relative h-full w-full bg-black"
      style={{ touchAction: allowSwipeNav ? "none" : "pan-y" }}
      onClick={bumpUi}
      onTouchStart={
        allowSwipeNav
          ? (e) => {
              touchStartY.current = e.touches[0]?.clientY ?? null;
            }
          : undefined
      }
      onTouchEnd={
        allowSwipeNav
          ? (e) => {
              const start = touchStartY.current;
              const end = e.changedTouches[0]?.clientY;
              touchStartY.current = null;
              if (start == null || end == null) return;
              const delta = start - end;
              if (Math.abs(delta) < 56) return;
              if (delta > 0 && hasNext) onNext?.();
              if (delta < 0 && hasPrev) onPrev?.();
            }
          : undefined
      }
      onWheel={
        allowSwipeNav
          ? (e) => {
              if (Math.abs(e.deltaY) < 40) return;
              if (e.deltaY > 0 && hasNext) onNext?.();
              if (e.deltaY < 0 && hasPrev) onPrev?.();
            }
          : undefined
      }
    >
      <div className="player-stage absolute inset-0">
        <div ref={mountRef} className="absolute inset-0 h-full w-full" />
      </div>

      <div
        className={`pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-black/55 via-transparent to-transparent transition-opacity duration-300 ${
          showUi ? "opacity-100" : "opacity-0"
        }`}
      />

      <div
        className={`absolute inset-x-0 top-0 z-30 px-4 pt-[max(1rem,env(safe-area-inset-top))] transition-opacity duration-300 ${
          showUi ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="flex items-center gap-3 pt-2">
          {onBack && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onBack();
              }}
              className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/35 backdrop-blur"
            >
              <IconChevronLeft size={20} stroke={2} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-base leading-tight">{title}</p>
            <p className="text-xs text-white/65">{episodeLabel}</p>
          </div>
        </div>
      </div>

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[var(--accent)]" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/70 px-8 text-center">
          <p className="text-sm text-rose-300">{error}</p>
          <button
            type="button"
            className="pointer-events-auto rounded-full bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[#1a0b10]"
            onClick={(e) => {
              e.stopPropagation();
              setReloadToken((n) => n + 1);
            }}
          >
            Coba lagi
          </button>
        </div>
      )}

      {sideActions && (
        <div className="absolute right-3 bottom-36 z-40 flex flex-col items-center gap-3">
          {sideActions}
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-14 z-30 px-4 transition-opacity duration-300 ${
          showUi ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={(e) => {
              e.stopPropagation();
              onPrev?.();
            }}
            className="pointer-events-auto rounded-full bg-white/10 px-4 py-2 text-xs font-medium disabled:opacity-30"
          >
            Sebelumnya
          </button>
          <p className="text-[11px] text-white/50">Geser untuk ganti episode</p>
          <button
            type="button"
            disabled={!hasNext}
            onClick={(e) => {
              e.stopPropagation();
              onNext?.();
            }}
            className="pointer-events-auto rounded-full bg-white/10 px-4 py-2 text-xs font-medium disabled:opacity-30"
          >
            Berikutnya
          </button>
        </div>
      </div>
    </div>
  );
}
