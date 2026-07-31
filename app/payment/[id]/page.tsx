"use client";

import { IconChevronLeft, IconCopy, IconCheck } from "@tabler/icons-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { MobileShell } from "@/components/MobileShell";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";
import { PAYMENT_METHODS } from "@/lib/coin-packages";
import {
  clearPaymentSession,
  loadPaymentSession,
  resolvePaymentCode,
  resolveQrImageSrc,
  savePaymentSession,
  type PaymentCheckoutSession,
} from "@/lib/payment-session";
import type { CoinCancelPayload, PaymentPayload } from "@/lib/types";

export default function PaymentCheckoutPage() {
  const params = useParams<{ id: string }>();
  const paymentId = Number(params.id);
  const router = useRouter();
  const { token, ready, user, setUser } = useAuth();
  const [session, setSession] = useState<PaymentCheckoutSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!Number.isFinite(paymentId)) {
      setError("ID pembayaran tidak valid.");
      return;
    }
    const stored = loadPaymentSession(paymentId);
    if (stored) setSession(stored);
    else setError("Sesi pembayaran tidak ditemukan. Buat transaksi baru dari halaman Akun.");
  }, [paymentId]);

  useEffect(() => {
    if (ready && !token) {
      router.replace(loginUrl(`/payment/${paymentId}`));
    }
  }, [ready, token, router, paymentId]);

  const qrSrc = useMemo(
    () => (session ? resolveQrImageSrc(session.payment) : null),
    [session],
  );
  const payCode = useMemo(
    () => (session ? resolvePaymentCode(session.payment) : null),
    [session],
  );
  const methodLabel =
    session?.methodLabel ||
    PAYMENT_METHODS.find((m) => m.code === session?.method)?.label ||
    session?.method ||
    "Pembayaran";

  const copyCode = async () => {
    if (!payCode) return;
    try {
      await navigator.clipboard.writeText(payCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Gagal menyalin kode.");
    }
  };

  const syncPayment = useCallback(async () => {
    if (!token || !session) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<PaymentPayload>(
        `/payment/${session.payment.payment_id}/update`,
        { method: "POST", token },
      );
      const nextPayment = { ...session.payment, ...res.data };
      const nextSession: PaymentCheckoutSession = {
        ...session,
        payment: nextPayment,
      };
      setSession(nextSession);
      savePaymentSession(nextSession);

      if (res.data.status === "success") {
        setMessage("Pembayaran berhasil. Coin sudah masuk ke akun.");
        if (user && typeof res.data.coin_balance === "number") {
          setUser({ ...user, coin: res.data.coin_balance });
        }
        clearPaymentSession(session.payment.payment_id);
        window.setTimeout(() => router.replace("/profile"), 1200);
      } else {
        setMessage(`Status: ${res.data.status}`);
      }
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal cek status pembayaran.");
    } finally {
      setLoading(false);
    }
  }, [token, session, user, setUser, router]);

  const sessionStatus = session?.payment.status;
  const sessionPaymentId = session?.payment.payment_id;

  // Auto-poll status while pending
  useEffect(() => {
    if (!token || !sessionPaymentId || sessionStatus === "success") return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const res = await apiRequest<PaymentPayload>(`/payment/${sessionPaymentId}/update`, {
            method: "POST",
            token,
          });
          setSession((prev) => {
            if (!prev) return prev;
            const next: PaymentCheckoutSession = {
              ...prev,
              payment: { ...prev.payment, ...res.data },
            };
            savePaymentSession(next);
            return next;
          });
          if (res.data.status === "success") {
            setMessage("Pembayaran berhasil. Coin sudah masuk ke akun.");
            if (user && typeof res.data.coin_balance === "number") {
              setUser({ ...user, coin: res.data.coin_balance });
            }
            clearPaymentSession(sessionPaymentId);
            window.setTimeout(() => router.replace("/profile"), 1200);
          }
        } catch {
          /* silent poll */
        }
      })();
    }, 12_000);
    return () => window.clearInterval(timer);
  }, [token, sessionPaymentId, sessionStatus, user, setUser, router]);

  const cancelPayment = async () => {
    if (!token || !session) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest<CoinCancelPayload>(`/coin/${session.transactionId}/cancel`, {
        method: "POST",
        token,
      });
      clearPaymentSession(session.payment.payment_id);
      setMessage("Transaksi dibatalkan.");
      window.setTimeout(() => router.replace("/profile"), 800);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal membatalkan transaksi.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileShell>
      <div className="page-scroll flex min-h-0 flex-1 flex-col px-4 pb-10 pt-12">
        <div className="mb-6 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/profile")}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white/8"
          >
            <IconChevronLeft size={20} stroke={2} />
          </button>
          <div>
            <p className="font-display text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
              Pembayaran
            </p>
            <h1 className="font-display text-xl leading-tight">{methodLabel}</h1>
          </div>
        </div>

        {!session && error && (
          <div className="rounded-2xl bg-rose-500/10 px-4 py-3 text-sm text-rose-300">{error}</div>
        )}

        {session && (
          <div className="fade-up space-y-4">
            <section className="rounded-[1.5rem] bg-gradient-to-br from-[#2a1620] via-[#16121a] to-[#0f0c12] p-5">
              <p className="text-xs uppercase tracking-[0.16em] text-white/45">Total bayar</p>
              <p className="mt-2 font-display text-3xl text-[var(--accent-soft)]">
                Rp {session.amount.toLocaleString("id-ID")}
              </p>
              <p className="mt-2 text-sm text-white/55">
                {session.coin} coin · Trx #{session.transactionId}
              </p>
              <p className="mt-1 text-xs capitalize text-white/40">
                Status: {session.payment.status}
              </p>
            </section>

            <section className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
              <p className="mb-4 text-center text-sm text-white/60">
                Scan QR QRIS di bawah, atau salin kode bayar
              </p>

              <div className="mx-auto flex h-[280px] w-[280px] items-center justify-center overflow-hidden rounded-2xl bg-white p-3">
                {qrSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={qrSrc}
                    alt="QRIS pembayaran"
                    width={256}
                    height={256}
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <div className="px-4 text-center text-sm text-[#1a0b10]/70">
                    QR belum tersedia dari gateway.
                    {session.payment.payment_url ? " Gunakan tombol buka pembayaran." : ""}
                  </div>
                )}
              </div>

              {payCode && (
                <div className="mt-5 rounded-xl bg-black/25 px-4 py-3">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">
                    Kode bayar
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <p className="min-w-0 flex-1 break-all font-mono text-sm font-semibold tracking-wide text-white">
                      {payCode}
                    </p>
                    <button
                      type="button"
                      onClick={() => void copyCode()}
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
                      aria-label="Salin kode"
                    >
                      {copied ? (
                        <IconCheck size={18} className="text-emerald-300" />
                      ) : (
                        <IconCopy size={18} />
                      )}
                    </button>
                  </div>
                </div>
              )}

              {session.payment.expired_at && (
                <p className="mt-3 text-center text-xs text-white/40">
                  Berlaku hingga{" "}
                  {new Date(session.payment.expired_at).toLocaleString("id-ID")}
                </p>
              )}
            </section>

            {error && (
              <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
            )}
            {message && (
              <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                {message}
              </p>
            )}

            <div className="space-y-2">
              <button
                type="button"
                className="btn-primary"
                disabled={loading}
                onClick={() => void syncPayment()}
              >
                {loading ? "Memeriksa..." : "Cek status pembayaran"}
              </button>

              {session.payment.payment_url && !qrSrc && (
                <a
                  href={session.payment.payment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-12 w-full items-center justify-center rounded-full bg-white/10 text-sm font-semibold"
                >
                  Buka halaman pembayaran
                </a>
              )}

              {session.payment.status === "pending" && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void cancelPayment()}
                  className="flex h-12 w-full items-center justify-center rounded-full border border-rose-400/30 text-sm font-semibold text-rose-200"
                >
                  Batalkan transaksi
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </MobileShell>
  );
}
