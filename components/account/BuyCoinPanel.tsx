"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { PAYMENT_METHODS } from "@/lib/coin-packages";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { savePaymentSession } from "@/lib/payment-session";
import type { CoinPackage, CoinPurchasePayload, PaymentPayload } from "@/lib/types";

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
  const { token } = useAuth();
  const router = useRouter();
  const list = useMemo(
    () => (packages.length ? packages : []).map(normalizePackage),
    [packages],
  );
  const [open, setOpen] = useState(false);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [method, setMethod] = useState<string>(PAYMENT_METHODS[0].code);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selected =
    list.find((p) => p.id === (packageId ?? list[0]?.id)) ?? list[0] ?? null;

  const buy = async () => {
    if (!token || !selected) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<CoinPurchasePayload>("/coin", {
        token,
        body: {
          package_id: selected.id,
          method,
        },
      });

      let payment: PaymentPayload | null = null;
      try {
        const pay = await apiRequest<PaymentPayload>("/payment", {
          token,
          body: {
            type: "coin",
            reference_id: res.data.transaction_id,
            method,
          },
        });
        payment = pay.data;
      } catch {
        /* some backends embed payment fields in /coin */
      }

      const merged: PaymentPayload = {
        payment_id: payment?.payment_id ?? res.data.transaction_id,
        status: payment?.status ?? res.data.status ?? "pending",
        payment_url: payment?.payment_url ?? res.data.payment_url ?? null,
        reference: payment?.reference ?? res.data.reference,
        amount: payment?.amount ?? res.data.amount,
        coin: payment?.coin ?? res.data.coin,
        method: payment?.method ?? method,
        qr_url: payment?.qr_url ?? res.data.qr_url ?? null,
        qr_image: payment?.qr_image ?? res.data.qr_image ?? null,
        qr_content: payment?.qr_content ?? res.data.qr_content ?? null,
        payment_code: payment?.payment_code ?? res.data.payment_code ?? null,
        va_number: payment?.va_number ?? res.data.va_number ?? null,
        expired_at: payment?.expired_at ?? res.data.expired_at ?? null,
        transaction_id: res.data.transaction_id,
      };

      const methodLabel =
        PAYMENT_METHODS.find((m) => m.code === method)?.label ?? method;

      savePaymentSession({
        payment: merged,
        transactionId: res.data.transaction_id,
        coin: res.data.coin,
        amount: res.data.amount,
        method,
        methodLabel,
        createdAt: Date.now(),
      });

      onChanged();
      router.push(`/payment/${merged.payment_id}`);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal membuat invoice coin.");
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
        <span className="font-display text-base">Beli coin</span>
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

          <button
            type="button"
            className="btn-primary"
            disabled={loading || !selected}
            onClick={() => void buy()}
          >
            {loading ? "Memproses..." : `Bayar ${selected?.label ?? "coin"}`}
          </button>
        </div>
      )}
    </section>
  );
}
