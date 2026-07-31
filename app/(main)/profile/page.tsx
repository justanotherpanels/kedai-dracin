"use client";

import { BuyCoinPanel } from "@/components/account/BuyCoinPanel";
import { DeleteAccountPanel } from "@/components/account/DeleteAccountPanel";
import { EditProfileForm } from "@/components/account/EditProfileForm";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";
import type { CoinCancelPayload, CoinPayload } from "@/lib/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

export default function ProfilePage() {
  const { user, token, logout, setUser, ready } = useAuth();
  const router = useRouter();
  const [coinData, setCoinData] = useState<CoinPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<CoinPayload>("/coin", { token });
      setCoinData(res.data);
      if (user && res.data?.coin !== undefined) {
        setUser({ ...user, coin: res.data.coin });
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal memuat akun.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, setUser]);

  useEffect(() => {
    void load();
  }, [load]);

  const onLogout = () => {
    logout();
    router.replace("/home");
  };

  const cancelTransaction = async (transactionId: number) => {
    if (!token) return;
    setCancelingId(transactionId);
    setError(null);
    try {
      await apiRequest<CoinCancelPayload>(`/coin/${transactionId}/cancel`, {
        method: "POST",
        token,
      });
      await load();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal membatalkan transaksi.");
    } finally {
      setCancelingId(null);
    }
  };

  if (ready && !token) {
    return (
      <div className="page-scroll min-h-0 flex-1 px-4 pt-12">
        <header className="mb-6">
          <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
            Akun
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl">Guest</h1>
          <p className="mt-1 text-sm text-white/50">Masuk untuk coin, VIP, dan pengaturan akun.</p>
        </header>
        <Link href={loginUrl("/profile")} className="btn-primary">
          Masuk / Daftar
        </Link>
      </div>
    );
  }

  return (
    <div className="page-scroll min-h-0 flex-1 px-4 pt-12">
      <header className="mb-6">
        <p className="font-[family-name:var(--font-display)] text-[11px] uppercase tracking-[0.24em] text-[var(--accent)]">
          Akun
        </p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl">{user?.name}</h1>
        <p className="mt-1 text-sm text-white/50">{user?.email}</p>
      </header>

      <section className="fade-up mb-5 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[#2a1620] via-[#16121a] to-[#0f0c12] p-5">
        <p className="text-xs uppercase tracking-[0.18em] text-white/45">Saldo coin</p>
        <p className="mt-2 font-[family-name:var(--font-display)] text-4xl text-[var(--accent-soft)]">
          {coinData?.coin ?? user?.coin ?? 0}
        </p>
      </section>

      {error && (
        <div className="mb-4 rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
      )}

      <BuyCoinPanel packages={coinData?.packages} onChanged={() => void load()} />
      <EditProfileForm onUpdated={() => void load()} />

      <section className="mb-6">
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-lg">Riwayat coin</h2>
        {loading ? (
          <div className="flex justify-center py-10">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
          </div>
        ) : !coinData?.history?.length ? (
          <p className="rounded-2xl border border-white/8 px-4 py-8 text-center text-sm text-white/45">
            Belum ada transaksi.
          </p>
        ) : (
          <ul className="space-y-2">
            {coinData.history.slice(0, 12).map((item) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.03] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium capitalize">{item.type}</p>
                  <p className="text-[11px] text-white/40">
                    {new Date(item.created_at).toLocaleString("id-ID")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-[var(--accent-soft)]">
                    {item.amount > 0 ? `+${item.amount}` : item.amount}
                  </p>
                  <p className="text-[11px] text-white/40">{item.status}</p>
                  {item.status === "pending" && (
                    <button
                      type="button"
                      disabled={cancelingId === item.id}
                      onClick={() => void cancelTransaction(item.id)}
                      className="mt-1 text-[11px] text-rose-300"
                    >
                      {cancelingId === item.id ? "..." : "Batalkan"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeleteAccountPanel />

      <button
        type="button"
        onClick={onLogout}
        className="mb-8 w-full rounded-full border border-white/12 py-3 text-sm font-semibold text-white/75 transition hover:bg-white/5"
      >
        Keluar
      </button>
    </div>
  );
}
