"use client";

import { useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { PAYMENT_METHODS } from "@/lib/coin-packages";
import { apiRequest, ApiRequestError } from "@/lib/api";
import type {
  CoinCancelPayload,
  CoinPackage,
  CoinPurchasePayload,
  PaymentPayload,
} from "@/lib/types";

type Props = {
  packages?: CoinPackage[];
  onChanged: () => void;
};

function normalizePackage(pkg: CoinPackage): CoinPackage & { label: string; amount: number } {
  const amount = pkg.price ?? pkg.amount ?? 0;
  const label = pkg.label ?? pkg.name ?? `${pkg.coin} coin`;
  return { ...pkg, label, amount };
}

export function BuyCoinPanel({ packages = [], onChanged }: Props) {
  const { token, user, setUser } = useAuth();
  const list = useMemo(
    () => (packages.length ? packages : []).map(normalizePackage),
    [packages],
  );
  const [open, setOpen] = useState(false);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0].code);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<CoinPurchasePayload | null>(null);
  const [paymentId, setPaymentId] = useState<number | null>(null);

  const selected =
    list.find((p) => p.id === (packageId ?? list[0]?.id)) ?? list[0] ?? null;

  const buy = async () => {
    if (!token || !selected) return;
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest<CoinPurchasePayload>("/coin", {
        token,
        body: {
          package_id: selected.id,
          method,
        },
      });
      setPending(res.data);
      if (res.data.payment_url) {
        window.open(res.data.payment_url, "_blank", "noopener,noreferrer");
      }

      try {
        const pay = await apiRequest<PaymentPayload>("/payment", {
          token,
          body: {
            type: "coin",
            reference_id: res.data.transaction_id,
            method,
          },
        });
        setPaymentId(pay.data.payment_id);
        if (pay.data.payment_url && !res.data.payment_url) {
          window.open(pay.data.payment_url, "_blank", "noopener,noreferrer");
        }
      } catch {
        /* optional */
      }

      setMessage("Invoice dibuat. Selesaikan pembayaran di tab baru.");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal membuat invoice coin.");
    } finally {
      setLoading(false);
    }
  };

  const cancelPending = async () => {
    if (!token || !pending) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<CoinCancelPayload>(`/coin/${pending.transaction_id}/cancel`, {
        method: "POST",
        token,
      });
      setMessage(`Transaksi ${res.data.transaction_id} dibatalkan.`);
      setPending(null);
      setPaymentId(null);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal membatalkan transaksi.");
    } finally {
      setLoading(false);
    }
  };

  const syncPayment = async () => {
    if (!token || !paymentId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<PaymentPayload>(`/payment/${paymentId}/update`, {
        method: "POST",
        token,
      });
      if (res.data.status === "success") {
        setMessage("Pembayaran berhasil. Coin akan segera masuk.");
        setPending(null);
        setPaymentId(null);
        if (user && typeof res.data.coin_balance === "number") {
          setUser({ ...user, coin: res.data.coin_balance });
        }
        onChanged();
      } else {
        setMessage(`Status pembayaran: ${res.data.status}`);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal sinkron status pembayaran.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3.5 text-left"
      >
        <span className="font-[family-name:var(--font-display)] text-base">Beli coin</span>
        <span className="text-xs text-white/40">{open ? "Tutup" : "Top up"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3 rounded-2xl border border-white/8 p-4">
          {list.length === 0 ? (
            <p className="text-sm text-white/45">Paket coin belum tersedia.</p>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {list.map((pkg) => (
                <button
                  key={pkg.id}
                  type="button"
                  onClick={() => setPackageId(pkg.id)}
                  className={`rounded-xl px-3 py-3 text-left transition ${
                    (packageId ?? list[0]?.id) === pkg.id
                      ? "bg-[var(--accent)]/20 ring-1 ring-[var(--accent)]"
                      : "bg-white/[0.04]"
                  }`}
                >
                  <p className="text-sm font-semibold">{pkg.label}</p>
                  <p className="mt-1 text-[11px] text-white/45">
                    Rp {pkg.amount.toLocaleString("id-ID")}
                  </p>
                </button>
              ))}
            </div>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">Metode bayar</span>
            <select className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m.code} value={m.code} className="bg-[#16121a]">
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="text-sm text-rose-300">{error}</p>}
          {message && <p className="text-sm text-emerald-300">{message}</p>}

          <button
            type="button"
            className="btn-primary"
            disabled={loading || !selected}
            onClick={() => void buy()}
          >
            {loading ? "Memproses..." : `Beli ${selected?.label ?? "coin"}`}
          </button>

          {pending && (
            <div className="space-y-2 rounded-xl bg-white/[0.04] p-3">
              <p className="text-xs text-white/50">
                Transaksi #{pending.transaction_id} · {pending.status}
                {pending.reference ? ` · ${pending.reference}` : ""}
              </p>
              <div className="flex gap-2">
                {pending.payment_url && (
                  <a
                    href={pending.payment_url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 rounded-full bg-white/10 py-2.5 text-center text-xs font-semibold"
                  >
                    Buka pembayaran
                  </a>
                )}
                {paymentId && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void syncPayment()}
                    className="flex-1 rounded-full bg-white/10 py-2.5 text-xs font-semibold"
                  >
                    Cek status
                  </button>
                )}
                {pending.status === "pending" && (
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => void cancelPending()}
                    className="flex-1 rounded-full border border-rose-400/30 py-2.5 text-xs font-semibold text-rose-200"
                  >
                    Batalkan
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
