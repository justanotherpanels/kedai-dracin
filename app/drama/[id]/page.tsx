"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { IconChevronLeft } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { MobileShell } from "@/components/MobileShell";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";
import type { Episode, EpisodeListPayload, LikePayload, Drama } from "@/lib/types";

function isPremiumEpisode(ep: Episode) {
  return ep.is_locked || ep.coin_cost > 0 || ep.type?.toUpperCase() === "VIP" || ep.episode > 20;
}

export default function DramaDetailPage() {
  return (
    <MobileShell>
      <DramaDetailContent />
    </MobileShell>
  );
}

function DramaDetailContent() {
  const params = useParams<{ id: string }>();
  const idParam = params.id;
  const { token, user, setUser, ready } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<EpisodeListPayload | null>(null);
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dramaId = data?.drama.id ?? (Number.isFinite(Number(idParam)) ? Number(idParam) : null);

  const load = useCallback(async () => {
    if (!ready || !idParam) return;
    setLoading(true);
    setError(null);
    try {
      // Prefer website drama detail; fallback ke play episode list
      let payload: EpisodeListPayload | null = null;
      try {
        const res = await apiRequest<EpisodeListPayload | (Drama & { episodes: Episode[] })>(
          `/drama/${idParam}`,
          { token },
        );
        const raw = res.data as EpisodeListPayload | (Drama & { episodes: Episode[] });
        if ("drama" in raw && raw.drama) {
          payload = raw as EpisodeListPayload;
        } else {
          const flat = raw as Drama & { episodes: Episode[] };
          payload = {
            drama: flat,
            episodes: flat.episodes ?? [],
          };
        }
      } catch {
        const res = await apiRequest<EpisodeListPayload>(`/play/drama/${idParam}/episode`, {
          token,
        });
        payload = res.data;
      }
      setData(payload);
      setSaved(Boolean(payload.drama.is_saved));
      setLiked(Boolean(payload.drama.is_liked));
      setLikesCount(payload.drama.likes_count ?? 0);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal memuat drama.");
    } finally {
      setLoading(false);
    }
  }, [token, ready, idParam]);

  useEffect(() => {
    void load();
  }, [load]);

  const requireLogin = (next: string) => {
    router.push(loginUrl(next));
  };

  const toggleSave = async () => {
    if (!dramaId || busy) return;
    if (!token) {
      requireLogin(`/drama/${idParam}`);
      return;
    }
    setBusy(true);
    try {
      if (saved) {
        await apiRequest(`/saved-drama/${dramaId}`, { method: "DELETE", token });
        setSaved(false);
      } else {
        await apiRequest("/saved-drama", { token, body: { id_drama: dramaId } });
        setSaved(true);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  };

  const toggleLike = async () => {
    if (!dramaId || busy) return;
    if (!token) {
      requireLogin(`/drama/${idParam}`);
      return;
    }
    setBusy(true);
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
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal like drama.");
    } finally {
      setBusy(false);
    }
  };

  const playEpisode = async (ep: Episode) => {
    if (busy || !dramaId) return;

    if (isPremiumEpisode(ep) && !token) {
      requireLogin(`/watch/${dramaId}/${ep.episode}`);
      return;
    }

    if (ep.is_locked && token && (user?.coin ?? 0) < ep.coin_cost) {
      setError(`Coin tidak cukup. Butuh ${ep.coin_cost} coin.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await apiRequest<{ coin_balance?: number }>(
        `/play/drama/${dramaId}/episode/${ep.episode}`,
        { token, body: { resolution: "auto" } },
      );
      if (user && typeof res.data.coin_balance === "number") {
        setUser({ ...user, coin: res.data.coin_balance });
      }
      router.push(`/watch/${dramaId}/${ep.episode}`);
    } catch (err) {
      if (err instanceof ApiRequestError && (err.status === 401 || err.status === 403)) {
        if (!token) {
          requireLogin(`/watch/${dramaId}/${ep.episode}`);
          return;
        }
      }
      setError(err instanceof ApiRequestError ? err.message : "Gagal membuka episode.");
    } finally {
      setBusy(false);
    }
  };

  const firstFree = data?.episodes.find((e) => !isPremiumEpisode(e)) ?? data?.episodes[0];

  return (
    <div className="page-scroll flex min-h-0 flex-1 flex-col pb-[var(--bottom-nav-h)] md:pb-0">
      <div className="relative aspect-[4/5] w-full shrink-0">
        {data?.drama.banner_url ? (
          <Image
            src={data.drama.banner_url}
            alt={data.drama.title}
            fill
            priority
            sizes="430px"
            className="object-cover"
          />
        ) : (
          <div className="h-full w-full bg-[#1a1218]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-[var(--surface)]/40 to-black/30" />

        <div className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-4 pt-12">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined" && window.history.length > 1) {
                router.back();
              } else {
                router.replace("/home");
              }
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-black/40 backdrop-blur"
          >
            <IconChevronLeft size={20} stroke={2} />
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void toggleLike()}
              disabled={busy}
              className={`rounded-full px-3 py-2 text-xs font-semibold backdrop-blur ${
                liked ? "bg-[var(--accent)] text-[#1a0b10]" : "bg-black/40 text-white"
              }`}
            >
              {liked ? "Disukai" : "Suka"} · {likesCount}
            </button>
            <button
              type="button"
              onClick={() => void toggleSave()}
              disabled={busy}
              className={`rounded-full px-4 py-2 text-xs font-semibold backdrop-blur ${
                saved ? "bg-[var(--accent)] text-[#1a0b10]" : "bg-black/40 text-white"
              }`}
            >
              {saved ? "Tersimpan" : "Simpan"}
            </button>
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 space-y-2 p-5">
          <p className="text-xs uppercase tracking-[0.2em] text-[var(--accent)]">Drama</p>
          <h1 className="font-[family-name:var(--font-display)] text-[1.85rem] leading-tight">
            {data?.drama.title ?? "Memuat..."}
          </h1>
          <p className="text-sm text-white/60">
            {data?.drama.total_episodes ?? "—"} episode
            {likesCount ? ` · ${likesCount} suka` : ""}
          </p>
        </div>
      </div>

      <div className="px-4 pb-8 pt-2">
        {data?.drama.description && (
          <p className="mb-5 text-sm leading-relaxed text-white/55">{data.drama.description}</p>
        )}

        {error && (
          <div className="mb-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
        )}

        {firstFree && (
          <button
            type="button"
            disabled={busy || loading}
            onClick={() => void playEpisode(firstFree)}
            className="btn-primary mb-6"
          >
            Putar {firstFree.name}
          </button>
        )}

        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-lg">Daftar episode</h2>
          {token ? (
            <Link href="/profile" className="text-xs text-[var(--accent-soft)]">
              {user?.coin ?? 0} coin
            </Link>
          ) : (
            <Link href={loginUrl(`/drama/${idParam}`)} className="text-xs text-[var(--accent-soft)]">
              Login untuk VIP
            </Link>
          )}
        </div>

        {loading || !ready ? (
          <div className="flex justify-center py-12">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {data?.episodes.map((ep) => (
              <button
                key={ep.episode}
                type="button"
                disabled={busy}
                onClick={() => void playEpisode(ep)}
                className={`relative rounded-xl px-2 py-3 text-center transition ${
                  isPremiumEpisode(ep)
                    ? "bg-white/[0.04] text-white/55"
                    : "bg-white/[0.07] text-white hover:bg-[var(--accent)]/20"
                }`}
              >
                <span className="block text-sm font-semibold">{ep.episode}</span>
                {isPremiumEpisode(ep) && (
                  <span className="mt-1 block text-[10px] text-[var(--accent-soft)]">
                    {ep.coin_cost || 5}c
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
