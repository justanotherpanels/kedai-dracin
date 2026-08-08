"use client";

import { useEffect, useRef, useState } from "react";
import { IconSearch, IconX } from "@tabler/icons-react";
import { useAuth } from "@/components/AuthProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { DramaPoster } from "@/components/DramaPoster";
import { HeroSlider } from "@/components/HeroSlider";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { useInfiniteDramas } from "@/hooks/useInfiniteDramas";
import type { Drama, DramaProvider, SliderItem } from "@/lib/types";

export default function HomePage() {
  const { token, ready } = useAuth();
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchAnchorRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const stickyInputRef = useRef<HTMLInputElement>(null);
  const [sliders, setSliders] = useState<SliderItem[]>([]);
  const [trending, setTrending] = useState<Drama[]>([]);
  const [mostLiked, setMostLiked] = useState<Drama[]>([]);
  const [providers, setProviders] = useState<DramaProvider[]>([]);
  const [providerId, setProviderId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const { items, loading, loadingMore, hasMore, error, sentinelRef } = useInfiniteDramas({
    token,
    ready,
    search: query,
    providerId,
    source: "dashboard",
    rootRef: scrollRef,
  });

  useEffect(() => {
    const t = window.setTimeout(() => setQuery(search.trim()), 350);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;

    const onScroll = () => {
      const anchor = searchAnchorRef.current;
      const threshold = anchor ? anchor.offsetTop + anchor.offsetHeight * 0.35 : 72;
      const next = root.scrollTop > threshold;
      setScrolled(next);
      if (!next) setSearchOpen(false);
    };

    onScroll();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => root.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (scrolled && searchOpen) {
      stickyInputRef.current?.focus();
    }
  }, [scrolled, searchOpen]);

  useEffect(() => {
    if (!ready || query) return;
    let cancelled = false;
    void (async () => {
      try {
        const [sliderRes, trendRes, likedRes, providerRes] = await Promise.all([
          apiRequest<SliderItem[]>("/dashboard/slider", { token }).catch(() => ({ data: null })),
          apiRequest<Drama[]>("/play/trending", { token, query: { limit: 10 } }).catch(() => ({ data: null })),
          apiRequest<Drama[]>("/drama/most-liked", { token, query: { limit: 10 } }).catch(() => ({ data: null })),
          apiRequest<DramaProvider[]>("/provider", { token, query: { limit: 30 } }).catch(() => ({ data: null })),
        ]);
        if (cancelled) return;
        setSliders((sliderRes.data ?? []).filter((item) => item?.drama));
        setTrending(trendRes.data ?? []);
        setMostLiked(likedRes.data ?? []);
        setProviders(providerRes.data ?? []);
        setSectionError(null);
      } catch (err) {
        if (!cancelled) {
          setSectionError(err instanceof ApiRequestError ? err.message : "Gagal memuat beranda.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, ready, query]);

  const showSticky = scrolled;
  const showStickyField = searchOpen || Boolean(search);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {showSticky && (
        <div className="pointer-events-none absolute inset-x-0 top-0 z-40 px-4 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div
            className={`pointer-events-auto ml-auto flex items-center transition-all duration-300 ease-out ${
              showStickyField ? "w-full" : "w-11"
            }`}
          >
            {showStickyField ? (
              <div className="relative w-full animate-[fade-up_0.25s_ease]">
                <input
                  ref={stickyInputRef}
                  className="field pr-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari drama..."
                  aria-label="Cari drama"
                />
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSearchOpen(false);
                    stickyInputRef.current?.blur();
                  }}
                  className="absolute top-1/2 right-2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-white/50 hover:bg-white/8 hover:text-white/80"
                  aria-label="Tutup pencarian"
                >
                  <IconX size={16} stroke={2} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-[#0c0a0f]/88 text-white/85 shadow-[0_8px_24px_rgba(0,0,0,0.35)] backdrop-blur-xl transition hover:border-white/20 hover:text-white active:scale-95"
                aria-label="Buka pencarian"
              >
                <IconSearch size={20} stroke={1.8} />
              </button>
            )}
          </div>
        </div>
      )}

      <div
        ref={scrollRef}
        className="page-scroll min-h-0 flex-1 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]"
      >
        <header className="mb-4">
          <BrandLogo priority />
        </header>

        <div ref={searchAnchorRef} className="mb-4">
          <input
            ref={inlineInputRef}
            className="field"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari drama..."
            aria-label="Cari drama"
          />
        </div>

        {!query && providers.length > 0 && (
          <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setProviderId(null)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                providerId == null ? "bg-[var(--accent)] text-[#1a0b10]" : "bg-white/8 text-white/65"
              }`}
            >
              Semua
            </button>
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setProviderId(p.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                  providerId === p.id ? "bg-[var(--accent)] text-[#1a0b10]" : "bg-white/8 text-white/65"
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {(error || sectionError) && (
          <div className="mb-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">
            {error || sectionError}
          </div>
        )}

        {loading || !ready ? (
          <div className="flex justify-center py-20">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
          </div>
        ) : (
          <div className="space-y-7 pb-6">
            {!query && !providerId && <HeroSlider items={sliders} />}

            {!query && !providerId && trending.length > 0 && (
              <section>
                <h2 className="mb-3 font-display text-lg">Trending</h2>
                <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {trending.map((drama) => (
                    <DramaPoster key={`t-${drama.id}`} drama={drama} compact showLikes />
                  ))}
                </div>
              </section>
            )}

            {!query && !providerId && mostLiked.length > 0 && (
              <section>
                <h2 className="mb-3 font-display text-lg">Paling disukai</h2>
                <div className="flex gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {mostLiked.map((drama) => (
                    <DramaPoster key={`l-${drama.id}`} drama={drama} compact showLikes />
                  ))}
                </div>
              </section>
            )}

            <section>
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-display text-lg">
                  {query ? "Hasil pencarian" : "Drama populer"}
                </h2>
                <span className="text-xs text-white/40">{items.length} judul</span>
              </div>

              {items.length === 0 ? (
                <p className="py-10 text-center text-sm text-white/45">Drama tidak ditemukan.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  {items.map((drama) => (
                    <DramaPoster key={drama.id} drama={drama} showLikes />
                  ))}
                </div>
              )}

              <div ref={sentinelRef} className="h-8 w-full" />
              {loadingMore && (
                <div className="flex justify-center py-4">
                  <div className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
                </div>
              )}
              {!hasMore && items.length > 0 && (
                <p className="py-4 text-center text-xs text-white/35">Semua drama sudah ditampilkan</p>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
