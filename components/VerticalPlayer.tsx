"use client";

import { IconChevronLeft, IconHeart, IconHeartFilled, IconBookmark, IconBookmarkFilled, IconShare, IconChevronUp, IconChevronDown, IconX, IconLock } from "@tabler/icons-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import videojs from "video.js";
import type Player from "video.js/dist/types/player";
import { isDoodSource } from "@/lib/dood-detect";
import "video.js/dist/video-js.css";
import type { Drama, Episode } from "@/lib/types";

type VerticalPlayerProps = {
  src: string;
  title: string;
  episodeLabel: string;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  onBack?: () => void;
  active?: boolean;
  allowSwipeNav?: boolean;
  sideActions?: ReactNode;
  
  dramaMeta?: Drama | null;
  currentEp?: Episode | null;
  episodes?: Episode[];
  liked?: boolean;
  saved?: boolean;
  likesCount?: number;
  onToggleLike?: () => void;
  onToggleSave?: () => void;
  onSelectEpisode?: (epIndex: number) => void;
};

function inferMediaType(playSrc: string, resolvedType?: string): string {
  if (resolvedType) return resolvedType;
  const lower = playSrc.toLowerCase();
  if (lower.includes(".mp4") || lower.startsWith("/api/dood/stream")) {
    return "video/mp4";
  }
  return "application/x-mpegURL";
}

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
      const hint = typeof (data as any).hint === "string" ? ` ${(data as any).hint}` : "";
      throw new Error((data.error || "Gagal resolve") + hint);
    }
    return {
      playSrc: data.src,
      type: inferMediaType(data.src, data.type),
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
  dramaMeta,
  currentEp,
  episodes = [],
  liked = false,
  saved = false,
  likesCount = 0,
  onToggleLike,
  onToggleSave,
  onSelectEpisode,
}: VerticalPlayerProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const playerBoxRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<Player | null>(null);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(1);
  const [heartAnim, setHeartAnim] = useState(false);
  const [clickHeartPos, setClickHeartPos] = useState<{x: number, y: number} | null>(null);
  const [expandedDesc, setExpandedDesc] = useState(false);
  
  const touchStartY = useRef<number | null>(null);
  const lastClickTime = useRef<number>(0);
  
  const activeRef = useRef(active);
  const advancingRef = useRef(false);
  const onNextRef = useRef(onNext);
  const hasNextRef = useRef(hasNext);

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

  useEffect(() => {
    if (!src) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setIsPlaying(false);

    const disposePlayer = () => {
      const player = playerRef.current;
      playerRef.current = null;
      if (player && !player.isDisposed()) {
        try { player.dispose(); } catch {}
      }
      if (mountRef.current) mountRef.current.innerHTML = "";
    };

    const tryAutoPlay = async (player: Player) => {
      if (cancelled || !activeRef.current) return;
      try {
        await Promise.resolve(player.play());
      } catch {
        if (cancelled) return;
        try {
          player.muted(true);
          await Promise.resolve(player.play());
        } catch {}
      }
    };

    const ensurePlayer = (): Player | null => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        return playerRef.current;
      }

      const mount = mountRef.current;
      if (!mount) return null;

      mount.innerHTML = "";
      const videoEl = document.createElement("video");
      videoEl.className = "video-js vjs-big-play-centered";
      videoEl.setAttribute("playsinline", "true");
      videoEl.setAttribute("preload", "auto");
      mount.appendChild(videoEl);

      const player = videojs(videoEl, {
        controls: false,
        fill: true,
        preload: "auto",
        playsinline: true,
        autoplay: false,
      });

      player.addClass("vjs-vertical-player");

      player.on("waiting", () => { if (!cancelled) setLoading(true); });
      player.on("canplay", () => { if (!cancelled) setLoading(false); });
      player.on("playing", () => {
        if (cancelled) return;
        setLoading(false);
        setIsPlaying(true);
      });
      player.on("pause", () => {
        if (cancelled || player.ended()) return;
        setIsPlaying(false);
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
        setIsPlaying(false);
      });
      
      player.on("timeupdate", () => {
        if (cancelled) return;
        setCurrentTime(player.currentTime() || 0);
        setDuration(player.duration() || 1);
      });

      playerRef.current = player;
      return player;
    };

    const loadStream = async () => {
      try {
        const resolved = await resolvePlayableSrc(src);
        if (cancelled) return;

        const player = ensurePlayer();
        if (!player) return;

        player.poster(resolved.poster || "");

        if (resolved.type) {
          player.src({ src: resolved.playSrc, type: resolved.type });
        } else {
          player.src({ src: resolved.playSrc });
        }

        await new Promise<void>((resolveReady) => {
          player.ready(() => resolveReady());
        });
        if (cancelled) return;
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

    return () => {
      cancelled = true;
      disposePlayer();
    };
  }, [src, reloadToken]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;
    if (!active) {
      player.pause();
      setIsPlaying(false);
      return;
    }
    Promise.resolve(player.play()).catch(() => {
      setIsPlaying(false);
    });
  }, [active]);

  const togglePlay = (e: React.MouseEvent | React.TouchEvent) => {
    if (drawerOpen) {
      setDrawerOpen(false);
      return;
    }
    
    const now = Date.now();
    const timeDiff = now - lastClickTime.current;
    lastClickTime.current = now;
    
    if (timeDiff > 0 && timeDiff < 400) {
      if (!liked && onToggleLike) {
        onToggleLike();
        setHeartAnim(true);
        setTimeout(() => setHeartAnim(false), 300);
      }
      
      let clientX = 0;
      let clientY = 0;
      if ("touches" in e) {
        clientX = e.touches[0]?.clientX || window.innerWidth/2;
        clientY = e.touches[0]?.clientY || window.innerHeight/2;
      } else {
        clientX = (e as React.MouseEvent).clientX;
        clientY = (e as React.MouseEvent).clientY;
      }
      setClickHeartPos({ x: clientX, y: clientY });
      setTimeout(() => setClickHeartPos(null), 800);
      
      const player = playerRef.current;
      if (player && player.paused()) {
        player.play();
      }
      return;
    }
    
    const player = playerRef.current;
    if (!player) return;
    if (player.paused()) {
      player.play();
    } else {
      player.pause();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    const player = playerRef.current;
    if (player && duration > 0) {
      player.currentTime(pos * duration);
    }
  };

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;


  const handleLikeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!liked) {
      setHeartAnim(true);
      setTimeout(() => setHeartAnim(false), 300);
    }
    onToggleLike?.();
  };

  return (
    <div
      ref={playerBoxRef}
      className="relative w-full h-[100dvh] bg-black overflow-hidden selection:bg-rose-500 selection:text-white text-white font-sans antialiased"
      style={{ touchAction: allowSwipeNav ? "none" : "pan-y" }}
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
      <style dangerouslySetInnerHTML={{__html:`
        .heart-animation {
            animation: pulse-heart 0.3s ease-in-out;
        }
        @keyframes pulse-heart {
            0% { transform: scale(1); }
            50% { transform: scale(1.3); }
            100% { transform: scale(1); }
        }
        .animate-ping-once {
            animation: ping 0.8s cubic-bezier(0, 0, 0.2, 1) forwards;
        }
        .no-scrollbar::-webkit-scrollbar {
            display: none;
        }
        .no-scrollbar {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}} />

      <div className="absolute inset-0 flex items-center justify-center bg-gray-900 transition-transform duration-300" style={{ transform: isPlaying ? 'scale(1)' : 'scale(1.02)' }}>
        <div ref={mountRef} className="w-full h-full" style={{ opacity: isPlaying ? 0.95 : 0.8 }} />
        
        <div className="absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/70 to-transparent pointer-events-none"></div>
        <div className="absolute inset-x-0 bottom-0 h-80 bg-gradient-to-t from-black/90 via-black/40 to-transparent pointer-events-none"></div>
      </div>

      {onBack && (
        <div className="absolute top-0 left-0 right-0 z-30 p-4 pt-[max(1rem,env(safe-area-inset-top))] pointer-events-none">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBack();
            }}
            className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur"
          >
            <IconChevronLeft size={24} stroke={2} className="text-white" />
          </button>
        </div>
      )}

      <div 
        className="absolute inset-0 z-10 flex justify-center items-center cursor-pointer"
        onClick={togglePlay}
        onTouchStart={(e) => {
          const now = Date.now();
          if (now - lastClickTime.current < 400) {
            togglePlay(e);
          }
        }}
      >
        <div className={`w-20 h-20 bg-black/40 rounded-full flex justify-center items-center backdrop-blur-sm transition-transform duration-300 ${isPlaying ? 'scale-50 opacity-0' : 'scale-100 opacity-100'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10 ml-1 text-white/90">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
          </svg>
        </div>
      </div>
      
      {clickHeartPos && (
        <div 
          className="fixed pointer-events-none z-50 animate-ping-once"
          style={{ left: clickHeartPos.x - 32, top: clickHeartPos.y - 32 }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#ef4444" className="w-16 h-16 drop-shadow-2xl opacity-80">
            <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
          </svg>
        </div>
      )}

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-white/40 border-t-rose-500" />
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/70 px-8 text-center">
          <p className="text-sm text-rose-300">{error}</p>
          <button
            type="button"
            className="pointer-events-auto rounded-full bg-rose-500 px-5 py-2.5 text-sm font-semibold text-white"
            onClick={(e) => {
              e.stopPropagation();
              setReloadToken((n) => n + 1);
            }}
          >
            Coba lagi
          </button>
        </div>
      )}

      <div className="absolute right-3 bottom-32 flex flex-col items-center space-y-6 z-20">
        <div className="flex flex-col bg-black/30 backdrop-blur-md rounded-full border border-white/10 overflow-hidden mb-2 pointer-events-auto">
          <button 
            className="p-3 hover:bg-white/20 transition-colors group disabled:opacity-30" 
            disabled={!hasPrev}
            onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
          >
            <IconChevronUp className="w-6 h-6 text-white drop-shadow-lg group-hover:-translate-y-1 transition-transform" />
          </button>
          <div className="w-full h-[1px] bg-white/20"></div>
          <button 
            className="p-3 hover:bg-white/20 transition-colors group disabled:opacity-30"
            disabled={!hasNext}
            onClick={(e) => { e.stopPropagation(); onNext?.(); }}
          >
            <IconChevronDown className="w-6 h-6 text-white drop-shadow-lg group-hover:translate-y-1 transition-transform" />
          </button>
        </div>

        <button onClick={handleLikeClick} className="flex flex-col items-center space-y-1 group pointer-events-auto">
          <div className="p-2 rounded-full group-hover:bg-white/10 transition">
            {liked ? (
              <IconHeartFilled className={`w-9 h-9 drop-shadow-lg text-rose-500 ${heartAnim ? 'heart-animation' : ''}`} />
            ) : (
              <IconHeart className="w-9 h-9 drop-shadow-lg text-white" />
            )}
          </div>
          <span className={`text-sm font-semibold drop-shadow-md ${liked ? 'text-rose-500' : 'text-white'}`}>
            {likesCount >= 1000 ? (likesCount/1000).toFixed(1) + 'K' : likesCount}
          </span>
        </button>

        <button onClick={(e) => { e.stopPropagation(); onToggleSave?.(); }} className="flex flex-col items-center space-y-1 group pointer-events-auto">
          <div className="p-2 rounded-full group-hover:bg-white/10 transition">
            {saved ? (
              <IconBookmarkFilled className="w-9 h-9 drop-shadow-lg text-amber-400" />
            ) : (
              <IconBookmark className="w-9 h-9 drop-shadow-lg text-white" />
            )}
          </div>
          <span className="text-sm font-semibold drop-shadow-md">Simpan</span>
        </button>

        <button onClick={(e) => { e.stopPropagation(); alert("Link disalin!"); }} className="flex flex-col items-center space-y-1 group pointer-events-auto">
          <div className="p-2 rounded-full group-hover:bg-white/10 transition">
            <IconShare className="w-9 h-9 drop-shadow-lg text-white" />
          </div>
          <span className="text-sm font-semibold drop-shadow-md">Share</span>
        </button>
      </div>

      <div className="absolute left-4 right-20 bottom-20 z-20 flex flex-col space-y-2 pointer-events-none">
        {dramaMeta?.provider?.name && (
          <h3 className="text-lg font-bold drop-shadow-md">
            @{dramaMeta.provider.name.replace(/\s+/g, "")}
          </h3>
        )}
      </div>

      <div className="absolute bottom-3 left-3 right-3 z-20 pointer-events-auto">
        <button 
          onClick={(e) => { e.stopPropagation(); setDrawerOpen(true); }} 
          className="w-full bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 rounded-xl p-3 flex justify-between items-center transition-colors"
        >
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-rose-500 flex justify-center items-center text-xs font-bold shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-white">
                  <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-left">
              <p className="text-xs text-white/70 font-medium truncate max-w-[150px]">{dramaMeta?.title || title}</p>
              <p className="text-sm font-bold">
                {currentEp ? `Episode ${currentEp.episode}` : episodeLabel} 
                {dramaMeta?.total_episodes ? <span className="text-white/50 text-xs font-normal"> / {dramaMeta.total_episodes}</span> : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center text-white/70 space-x-1">
            {currentEp?.is_locked || currentEp?.coin_cost ? (
              <span className="text-xs font-medium bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded flex items-center gap-1">
                <IconLock size={12} /> VIP
              </span>
            ) : (
              <span className="text-xs font-medium bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded">Free</span>
            )}
            <IconChevronUp className="w-5 h-5 text-white/70" />
          </div>
        </button>
      </div>

      <div 
        className="absolute bottom-0 left-0 w-full h-1.5 bg-gray-600/50 z-30 pointer-events-auto cursor-pointer group pb-2"
        onClick={handleSeek}
      >
        <div className="absolute top-0 left-0 h-1 bg-white/30 w-full group-hover:h-2 transition-all"></div>
        <div 
          className="absolute top-0 left-0 h-1 bg-white group-hover:h-2 transition-all shadow-[0_0_10px_rgba(255,255,255,0.8)] rounded-r-full"
          style={{ width: `${progressPercent}%` }}
        >
          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity translate-x-1/2"></div>
        </div>
      </div>

      <div 
        className={`absolute inset-x-0 bottom-0 bg-gray-900/95 backdrop-blur-xl h-[65vh] rounded-t-3xl z-40 flex flex-col border-t border-gray-700 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] transition-transform duration-300 ease-in-out ${drawerOpen ? 'translate-y-0' : 'translate-y-full'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 flex justify-between items-center border-b border-gray-700/50">
          <div>
            <h2 className="font-bold text-lg">Semua Episode {episodes.length > 0 ? `(${episodes.length})` : ''}</h2>
            <p className="text-xs text-gray-400">Pilih episode untuk ditonton</p>
          </div>
          <button 
            onClick={() => setDrawerOpen(false)} 
            className="p-2 bg-gray-800 rounded-full hover:bg-gray-700 transition"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 no-scrollbar">
          <div className="grid grid-cols-5 gap-3 pb-8">
            {episodes.map((ep, idx) => {
              const isCurrent = currentEp?.episode === ep.episode;
              const isLocked = ep.is_locked || ep.coin_cost > 0;
              
              let baseClasses = "relative w-full aspect-square rounded-lg flex justify-center items-center font-semibold text-sm transition-all ";
              if (isCurrent) {
                baseClasses += "bg-rose-500 text-white shadow-lg shadow-rose-500/40 ring-2 ring-rose-400";
              } else if (isLocked) {
                baseClasses += "bg-gray-800/60 text-gray-500 cursor-pointer hover:bg-gray-700";
              } else {
                baseClasses += "bg-gray-800 text-gray-200 hover:bg-gray-700 cursor-pointer";
              }

              return (
                <button 
                  key={ep.episode}
                  onClick={() => {
                    setDrawerOpen(false);
                    onSelectEpisode?.(idx);
                  }}
                  className={baseClasses}
                >
                  {ep.episode}
                  {isLocked && <IconLock className="w-3 h-3 absolute top-1 right-1 opacity-50" />}
                </button>
              );
            })}
            {episodes.length === 0 && (
              <div className="col-span-5 text-center text-sm text-gray-500 py-4">
                Daftar episode tidak tersedia
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
