import type { PaymentPayload } from "@/lib/types";

export type PaymentCheckoutSession = {
  payment: PaymentPayload;
  transactionId: number;
  coin: number;
  amount: number;
  method: string;
  methodLabel: string;
  createdAt: number;
};

const keyFor = (paymentId: number | string) => `kd_payment_${paymentId}`;

export function savePaymentSession(session: PaymentCheckoutSession) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(keyFor(session.payment.payment_id), JSON.stringify(session));
  } catch {
    /* ignore quota */
  }
}

export function loadPaymentSession(paymentId: number | string): PaymentCheckoutSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(keyFor(paymentId));
    if (!raw) return null;
    return JSON.parse(raw) as PaymentCheckoutSession;
  } catch {
    return null;
  }
}

export function clearPaymentSession(paymentId: number | string) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(keyFor(paymentId));
  } catch {
    /* ignore */
  }
}

/** Resolve QR image URL from various PG response shapes. */
export function resolveQrImageSrc(payment: PaymentPayload): string | null {
  if (payment.qr_image) {
    if (payment.qr_image.startsWith("data:")) return payment.qr_image;
    if (/^[A-Za-z0-9+/=]+$/.test(payment.qr_image.slice(0, 80))) {
      return `data:image/png;base64,${payment.qr_image}`;
    }
    return payment.qr_image;
  }
  if (payment.qr_url) return payment.qr_url;

  const content = payment.qr_content?.trim();
  if (content) {
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(content)}`;
  }

  // Some gateways put a QR image URL in payment_url
  const url = payment.payment_url?.trim();
  if (url && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url)) return url;

  return null;
}

/** Kode bayar / VA / reference untuk ditampilkan & disalin. */
export function resolvePaymentCode(payment: PaymentPayload): string | null {
  return (
    payment.payment_code?.trim() ||
    payment.va_number?.trim() ||
    payment.reference?.trim() ||
    null
  );
}
