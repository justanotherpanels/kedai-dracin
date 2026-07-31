"use client";

import { IconChevronLeft, IconCopy, IconCheck } from "@tabler/icons-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/components/AuthProvider";
import { MobileShell } from "@/components/MobileShell";
import { PaymentQr } from "@/components/PaymentQr";
import { apiRequest, ApiRequestError } from "@/lib/api";
import { loginUrl } from "@/lib/auth-redirect";
import { getPaymentMethodKind } from "@/lib/coin-packages";
import {
  clearPaymentSession,
  loadPaymentSession,
  normalizePaymentPayload,
  resolvePaymentCode,
  resolveQrPayload,
  resolveVaNumber,
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

  const methodKind = useMemo(
    () =>
      getPaymentMethodKind(
        session?.method ?? session?.payment.method,
        session?.payment.payment_type,
      ),
    [session],
  );
  const isVa = methodKind === "va";

  const hasQrSource = useMemo(
    () => (session && !isVa ? Boolean(resolveQrPayload(session.payment, { allowPaymentUrl: true })) : false),
    [session, isVa],
  );
  const vaNumber = useMemo(
    () => (session && isVa ? resolveVaNumber(session.payment) : null),
    [session, isVa],
  );
  const payCode = useMemo(
    () => (session ? (isVa ? resolveVaNumber(session.payment) : resolvePaymentCode(session.payment)) : null),
    [session, isVa],
  );
  const methodLabel = session?.methodLabel || session?.method || "Pembayaran";

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

  const applyPaymentUpdate = useCallback(
    (prev: PaymentCheckoutSession, data: PaymentPayload): PaymentCheckoutSession => {
      const nextPayment = normalizePaymentPayload(data, prev.payment);
      return { ...prev, payment: nextPayment };
    },
    [],
  );

  const refreshPaymentInfo = useCallback(async () => {
    if (!token || !session) return false;
    setLoading(true);
    setError(null);
    try {
      const pay = await apiRequest<PaymentPayload>("/payment", {
        token,
        body: {
          type: "coin",
          reference_id: session.transactionId,
          method: session.method,
        },
      });
      const nextSession = applyPaymentUpdate(session, pay.data);
      setSession(nextSession);
      savePaymentSession(nextSession);
      const hasQr = Boolean(resolveQrPayload(nextSession.payment, { allowPaymentUrl: true }));
      const hasVa = Boolean(resolveVaNumber(nextSession.payment));
      if (!hasQr && !hasVa && !nextSession.payment.payment_url) {
        setError(
          "Info bayar belum lengkap dari gateway (belum ada payment_url / QR / VA). Coba muat ulang.",
        );
        return false;
      }
      setMessage(null);
      return true;
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal memuat info pembayaran.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [token, session, applyPaymentUpdate]);

  // Jika sesi belum punya QR/VA, muat ulang dari POST /payment
  useEffect(() => {
    if (!token || !session) return;
    const hasQr = Boolean(resolveQrPayload(session.payment, { allowPaymentUrl: true }));
    const hasVa = Boolean(resolveVaNumber(session.payment));
    if (hasQr || hasVa || session.payment.payment_url) return;
    void refreshPaymentInfo();
    // hanya sekali saat sesi pertama kali terbaca tanpa QR
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, session?.payment.payment_id]);

  const syncPayment = useCallback(async () => {
    if (!token || !session) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<PaymentPayload>(
        `/payment/${session.payment.payment_id}/update`,
        { method: "POST", token },
      );
      const nextSession = applyPaymentUpdate(session, res.data);
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
  }, [token, session, user, setUser, router, applyPaymentUpdate]);

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
            const next = applyPaymentUpdate(prev, res.data);
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
  }, [token, sessionPaymentId, sessionStatus, user, setUser, router, applyPaymentUpdate]);

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
              {isVa ? (
                <>
                  <p className="mb-4 text-center text-sm text-white/60">
                    Transfer ke Virtual Account di bawah ini
                  </p>
                  {vaNumber || payCode ? (
                    <div className="rounded-xl bg-black/25 px-4 py-5">
                      <p className="text-center text-[11px] uppercase tracking-[0.14em] text-white/40">
                        Nomor Virtual Account
                      </p>
                      <div className="mt-3 flex items-center gap-2">
                        <p className="min-w-0 flex-1 break-all text-center font-mono text-xl font-semibold tracking-wide text-white">
                          {vaNumber || payCode}
                        </p>
                        <button
                          type="button"
                          onClick={() => void copyCode()}
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"
                          aria-label="Salin nomor VA"
                        >
                          {copied ? (
                            <IconCheck size={18} className="text-emerald-300" />
                          ) : (
                            <IconCopy size={18} />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-black/25 px-4 py-6 text-center text-sm text-white/55">
                      Nomor VA belum dikirim gateway.
                      {session.payment.reference ? (
                        <p className="mt-2 text-xs text-white/40">Ref: {session.payment.reference}</p>
                      ) : null}
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => void refreshPaymentInfo()}
                        className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-white/10 text-sm font-semibold text-white"
                      >
                        {loading ? "Memuat..." : "Muat ulang nomor VA"}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="mb-4 text-center text-sm text-white/60">
                    {methodKind === "qris"
                      ? "Scan QR QRIS di bawah untuk membayar"
                      : `Bayar via ${methodLabel} — scan QR atau buka halaman bayar`}
                  </p>

                  <div className="mx-auto flex h-[280px] w-[280px] items-center justify-center overflow-hidden rounded-2xl bg-white p-3">
                    {hasQrSource ? (
                      <PaymentQr payment={session.payment} allowPaymentUrl />
                    ) : (
                      <div className="px-4 text-center text-sm text-[#1a0b10]/70">
                        QR belum dikirim gateway.
                        {session.payment.reference ? (
                          <>
                            <br />
                            Ref: {session.payment.reference}
                          </>
                        ) : null}
                      </div>
                    )}
                  </div>

                  {!hasQrSource && (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() => void refreshPaymentInfo()}
                      className="mt-4 flex h-11 w-full items-center justify-center rounded-full bg-white/10 text-sm font-semibold"
                    >
                      {loading ? "Memuat..." : "Muat ulang QR"}
                    </button>
                  )}

                  {payCode && !hasQrSource && (
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
                </>
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

              {session.payment.payment_url && (
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
