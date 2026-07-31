"use client";

import Link from "next/link";
import { useAuth } from "@/components/AuthProvider";
import { DramaPoster } from "@/components/DramaPoster";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";
import type { Drama } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

type Tab = "saved" | "liked";

export default function SavedPage() {
  const { token, ready } = useAuth();
  const [tab, setTab] = useState<Tab>("saved");
  const [items, setItems] = useState<Drama[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!ready) return;
    if (!token) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const path = tab === "liked" ? "/like-drama" : "/saved-drama";
      const res = await apiRequest<Drama[] | { drama: Drama }[]>(path, { token });
      const raw = res.data ?? [];
      const normalized = raw.map((item) => ("drama" in item ? item.drama : item));
      setItems(normalized.filter(Boolean));
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal memuat koleksi.");
    } finally {
      setLoading(false);
    }
  }, [token, ready, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  if (ready && !token) {
    return (
      <div className="page-scroll min-h-0 flex-1 px-4 pt-12">
        <header className="mb-5">
          <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
            Koleksi
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl">Tersimpan</h1>
        </header>
        <div className="rounded-[1.4rem] border border-dashed border-white/10 px-6 py-16 text-center">
          <p className="font-[family-name:var(--font-display)] text-lg">Masuk untuk menyimpan</p>
          <p className="mt-2 text-sm text-white/45">Simpan & like drama setelah login.</p>
          <Link href={loginUrl("/saved")} className="btn-primary mt-6 inline-flex max-w-xs">
            Masuk
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page-scroll min-h-0 flex-1 px-4 pt-12">
      <header className="mb-5">
        <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
          Koleksi
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl">
          {tab === "liked" ? "Disukai" : "Tersimpan"}
        </h1>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-white/[0.03] p-1">
        <button
          type="button"
          onClick={() => setTab("saved")}
          className={`rounded-xl py-2.5 text-sm font-semibold ${
            tab === "saved" ? "bg-[var(--accent)] text-[#1a0b10]" : "text-white/55"
          }`}
        >
          Tersimpan
        </button>
        <button
          type="button"
          onClick={() => setTab("liked")}
          className={`rounded-xl py-2.5 text-sm font-semibold ${
            tab === "liked" ? "bg-[var(--accent)] text-[#1a0b10]" : "text-white/55"
          }`}
        >
          Disukai
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      {loading || !ready ? (
        <div className="flex justify-center py-20">
          <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-[1.4rem] border border-dashed border-white/10 px-6 py-16 text-center">
          <p className="font-[family-name:var(--font-display)] text-lg">Belum ada drama</p>
          <p className="mt-2 text-sm text-white/45">
            {tab === "liked"
              ? "Like drama dari halaman detail."
              : "Simpan drama favorit dari halaman detail."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 pb-6 md:grid-cols-4">
          {items.map((drama) => (
            <DramaPoster key={drama.id} drama={drama} showLikes={tab === "liked"} />
          ))}
        </div>
      )}
    </div>
  );
}
