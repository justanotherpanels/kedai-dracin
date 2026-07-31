"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { PaymentPayload } from "@/lib/types";
import { resolveQrPayload } from "@/lib/payment-session";

type Props = {
  payment: PaymentPayload;
  /** Prefer encoding payment_url when gateway only returns URL (docs shape). */
  allowPaymentUrl?: boolean;
};

/**
 * Renders gateway QR image if provided, otherwise generates QR from
 * qr_content / QRIS string / payment_url.
 */
export function PaymentQr({ payment, allowPaymentUrl = true }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      setBusy(true);
      setFailed(false);
      setSrc(null);

      const resolved = resolveQrPayload(payment, { allowPaymentUrl });
      if (!resolved) {
        if (!cancelled) {
          setBusy(false);
          setFailed(true);
        }
        return;
      }

      if (resolved.kind === "image") {
        if (!cancelled) {
          setSrc(resolved.value);
          setBusy(false);
        }
        return;
      }

      try {
        const dataUrl = await QRCode.toDataURL(resolved.value, {
          width: 512,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#1a0b10", light: "#ffffff" },
        });
        if (!cancelled) {
          setSrc(dataUrl);
          setBusy(false);
        }
      } catch {
        if (!cancelled) {
          setFailed(true);
          setBusy(false);
        }
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [payment, allowPaymentUrl]);

  if (busy) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-[#1a0b10]/20 border-t-[var(--accent)]" />
      </div>
    );
  }

  if (failed || !src) {
    return (
      <div className="px-4 text-center text-sm text-[#1a0b10]/70">
        QR belum bisa dibuat.
        {payment.payment_url ? " Gunakan tombol buka pembayaran." : ""}
      </div>
    );
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="QR pembayaran" width={256} height={256} className="h-full w-full object-contain" />;
}
