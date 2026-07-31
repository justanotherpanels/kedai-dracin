"use client";

import Hls from "hls.js";
import { IconChevronLeft, IconPlayerPlayFilled, IconVolume, IconVolumeOff } from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { isDoodSource } from "@/lib/dood-detect";

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

async function resolvePlayableSrc(raw: string): Promise<{
  playSrc: string;
  poster?: string | null;
}> {
  if (raw.includes(".m3u8") || raw.startsWith("/api/dood/stream")) {
    return { playSrc: raw };
  }

  if (isDoodSource(raw)) {
    const endpoint = `/api/dood/resolve?url=${encodeURIComponent(raw)}`;
    const res = await fetch(endpoint, { cache: "no-store" });
    const data = (await res.json()) as ResolveResponse;
    if (!data.ok || !data.src) {
      throw new Error(data.error || "Gagal resolve Doodstream");
    }
    return { playSrc: data.src, poster: data.poster };
  }

  return { playSrc: raw };
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(true);
  const [muted, setMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showUi, setShowUi] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poster, setPoster] = useState<string | undefined>();
  const hideTimer = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const onNextRef = useRef(onNext);
  const hasNextRef = useRef(hasNext);
  const advancingRef = useRef(false);
  const mutedRef = useRef(muted);

  useEffect(() => {
    onNextRef.current = onNext;
    hasNextRef.current = hasNext;
  }, [onNext, hasNext]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    advancingRef.current = false;
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    let hls: Hls | null = null;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setProgress(0);
    setPoster(undefined);
    setPlaying(true);

    const tryAutoPlay = async () => {
      if (cancelled) return;
      try {
        video.muted = mutedRef.current;
        await video.play();
        if (!cancelled) setPlaying(true);
      } catch {
        if (cancelled) return;
        try {
          video.muted = true;
          setMuted(true);
          mutedRef.current = true;
          await video.play();
          if (!cancelled) setPlaying(true);
        } catch {
          if (!cancelled) {
            setPlaying(false);
            setShowUi(true);
          }
        }
      }
    };

    const onCanPlay = () => {
      if (!cancelled) setLoading(false);
    };
    const onWaiting = () => {
      if (!cancelled) setLoading(true);
    };
    const onPlaying = () => {
      if (cancelled) return;
      setLoading(false);
      setPlaying(true);
    };
    const onPause = () => {
      if (!cancelled && !video.ended) setPlaying(false);
    };
    const onTime = () => {
      if (cancelled) return;
      setProgress(video.currentTime);
      setDuration(video.duration || 0);
    };
    const onErr = () => {
      if (!cancelled) setError("Video gagal diputar.");
    };
    const onEnded = () => {
      if (cancelled || advancingRef.current) return;
      if (hasNextRef.current) {
        advancingRef.current = true;
        setLoading(true);
        onNextRef.current?.();
        return;
      }
      setPlaying(false);
      setShowUi(true);
    };

    video.addEventListener("canplay", onCanPlay);
    video.addEventListener("waiting", onWaiting);
    video.addEventListener("playing", onPlaying);
    video.addEventListener("pause", onPause);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("error", onErr);
    video.addEventListener("ended", onEnded);

    const attach = async () => {
      try {
        const { playSrc, poster: nextPoster } = await resolvePlayableSrc(src);
        if (cancelled) return;

        if (nextPoster) {
          setPoster(nextPoster);
          video.poster = nextPoster;
        }

        if (playSrc.includes(".m3u8")) {
          if (Hls.isSupported()) {
            hls = new Hls({ enableWorker: true, lowLatencyMode: true });
            hls.loadSource(playSrc);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              if (cancelled) return;
              void tryAutoPlay();
            });
            hls.on(Hls.Events.ERROR, (_, data) => {
              if (cancelled) return;
              if (data.fatal) setError("Stream tidak tersedia.");
            });
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = playSrc;
            void tryAutoPlay();
          } else {
            setError("Browser tidak mendukung HLS.");
          }
        } else {
          video.src = playSrc;
          void tryAutoPlay();
        }
      } catch (err) {
        if (cancelled) return;
        setLoading(false);
        setError(err instanceof Error ? err.message : "Gagal memuat video.");
      }
    };

    void attach();

    return () => {
      cancelled = true;
      video.removeEventListener("canplay", onCanPlay);
      video.removeEventListener("waiting", onWaiting);
      video.removeEventListener("playing", onPlaying);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("error", onErr);
      video.removeEventListener("ended", onEnded);
      try {
        hls?.destroy();
      } catch {
        /* ignore */
      }
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
      } catch {
        /* ignore */
      }
    };
  }, [src]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!active) {
      video.pause();
      setPlaying(false);
      return;
    }
    void video.play().catch(() => setPlaying(false));
  }, [active]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
  }, [muted]);

  const bumpUi = () => {
    setShowUi(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (playing) setShowUi(false);
    }, 2500);
  };

  useEffect(() => {
    bumpUi();
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, playing]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
    } else {
      video.pause();
    }
    bumpUi();
  };

  const seek = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = value;
    setProgress(value);
  };

  const format = (sec: number) => {
    if (!Number.isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60)
      .toString()
      .padStart(2, "0");
    return `${m}:${s}`;
  };

  return (
    <div
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
      <video
        ref={videoRef}
        className="h-full w-full object-contain"
        playsInline
        autoPlay={active}
        preload="auto"
        poster={poster}
        onDoubleClick={togglePlay}
      />

      <button
        type="button"
        aria-label={playing ? "Pause" : "Play"}
        className="absolute inset-0 z-10"
        style={{ touchAction: allowSwipeNav ? "none" : "pan-y" }}
        onClick={(e) => {
          e.stopPropagation();
          togglePlay();
        }}
      />

      <div
        className={`pointer-events-none absolute inset-0 z-20 bg-gradient-to-b from-black/55 via-transparent to-black/70 transition-opacity duration-300 ${
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
            <p className="truncate font-[family-name:var(--font-display)] text-base leading-tight">{title}</p>
            <p className="text-xs text-white/65">{episodeLabel}</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMuted((m) => !m);
              bumpUi();
            }}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/35 backdrop-blur"
          >
            {muted ? <IconVolumeOff size={20} stroke={1.8} /> : <IconVolume size={20} stroke={1.8} />}
          </button>
        </div>
      </div>

      {!playing && showUi && !loading && !error && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-black/45 backdrop-blur">
            <IconPlayerPlayFilled size={32} className="ml-0.5 text-white" />
          </div>
        </div>
      )}

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/20 border-t-[var(--accent)]" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 px-8 text-center">
          <p className="text-sm text-white/80">{error}</p>
        </div>
      )}

      {sideActions && (
        <div className="absolute right-3 bottom-36 z-40 flex flex-col items-center gap-3">
          {sideActions}
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 z-30 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] transition-opacity duration-300 ${
          showUi ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
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

        <div className="pointer-events-auto" onClick={(e) => e.stopPropagation()}>
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={progress}
            onChange={(e) => seek(Number(e.target.value))}
            className="player-seek w-full"
          />
          <div className="mt-1 flex justify-between text-[11px] text-white/55">
            <span>{format(progress)}</span>
            <span>{format(duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
