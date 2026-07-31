"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { channelsToPaymentMethods } from "@/lib/coin-packages";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { normalizePaymentPayload, savePaymentSession } from "@/lib/payment-session";
import type {
  CoinPackage,
  CoinPurchasePayload,
  PaymentChannel,
  PaymentPayload,
} from "@/lib/types";

type Props = {
  packages?: CoinPackage[];
  channels?: PaymentChannel[];
  channelsError?: string | null;
  onChanged: () => void;
};

function normalizePackage(pkg: CoinPackage): CoinPackage & { label: string; amount: number } {
  const amount = pkg.price ?? pkg.amount ?? 0;
  const label = pkg.label ?? pkg.name ?? `${pkg.coin} coin`;
  return { ...pkg, label, amount };
}

export function BuyCoinPanel({
  packages = [],
  channels = [],
  channelsError = null,
  onChanged,
}: Props) {
  const { token } = useAuth();
  const router = useRouter();
  const list = useMemo(
    () => (packages.length ? packages : []).map(normalizePackage),
    [packages],
  );
  // §4.1 / §6.1 — method hanya dari payment_channels API (tidak di-hardcode)
  const methods = useMemo(() => channelsToPaymentMethods(channels), [channels]);
  const [open, setOpen] = useState(false);
  const [packageId, setPackageId] = useState<number | null>(null);
  const [method, setMethod] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!methods.length) {
      setMethod("");
      return;
    }
    setMethod((prev) => (methods.some((m) => m.code === prev) ? prev : methods[0].code));
  }, [methods]);

  const selected =
    list.find((p) => p.id === (packageId ?? list[0]?.id)) ?? list[0] ?? null;
  const selectedMethod = methods.find((m) => m.code === method) ?? methods[0] ?? null;

  const buy = async () => {
    if (!token || !selected || !selectedMethod) return;
    setLoading(true);
    setError(null);
    try {
      // POST /coin — method = payment_channels[].code
      const res = await apiRequest<CoinPurchasePayload>("/coin", {
        token,
        body: {
          package_id: selected.id,
          method: selectedMethod.code,
        },
      });

      // POST /payment — ambil info bayar (QR / VA) §6.2
      const pay = await apiRequest<PaymentPayload>("/payment", {
        token,
        body: {
          type: "coin",
          reference_id: res.data.transaction_id,
          method: selectedMethod.code,
        },
      });

      // /payment primary; /coin sebagai fallback (null di /payment tidak menimpa QR dari /coin)
      const merged = normalizePaymentPayload(pay.data, {
        ...res.data,
        payment_id: pay.data.payment_id,
        transaction_id: res.data.transaction_id,
        amount: res.data.amount,
        coin: res.data.coin,
        method: pay.data.method ?? res.data.method ?? selectedMethod.code,
      });

      if (!merged.payment_id) {
        throw new Error("payment_id tidak diterima dari gateway.");
      }

      savePaymentSession({
        payment: merged,
        transactionId: res.data.transaction_id,
        coin: res.data.coin,
        amount: res.data.amount,
        method: merged.method ?? selectedMethod.code,
        methodLabel: selectedMethod.label,
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

          {methods.length === 0 ? (
            <p className="text-sm text-white/45">
              {channelsError ||
                "Metode pembayaran belum tersedia. Pastikan channel PG aktif (GET /payment/channels)."}
            </p>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs text-white/50">Metode bayar</span>
              <select className="field" value={method} onChange={(e) => setMethod(e.target.value)}>
                {methods.map((m) => (
                  <option key={m.code} value={m.code} className="bg-[#16121a]">
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <button
            type="button"
            className="btn-primary"
            disabled={loading || !selected || !selectedMethod}
            onClick={() => void buy()}
          >
            {loading ? "Memproses..." : `Bayar ${selected?.label ?? "coin"}`}
          </button>
        </div>
      )}
    </section>
  );
}
