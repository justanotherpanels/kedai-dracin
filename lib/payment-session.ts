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

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as LooseRecord;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function pickNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) {
      return Number(value);
    }
  }
  return undefined;
}

/**
 * Normalize various PG / API response shapes into PaymentPayload.
 * Handles flat fields and nested `payment` / `data` / `qr` / `va` objects.
 */
export function normalizePaymentPayload(
  raw: unknown,
  fallback: Partial<PaymentPayload> = {},
): PaymentPayload {
  const root = asRecord(raw) ?? {};
  const nestedPayment = asRecord(root.payment);
  const nestedData = asRecord(root.data);
  const nestedQr = asRecord(root.qr) ?? asRecord(nestedPayment?.qr) ?? asRecord(nestedData?.qr);
  const nestedVa =
    asRecord(root.va) ??
    asRecord(root.virtual_account) ??
    asRecord(nestedPayment?.va) ??
    asRecord(nestedPayment?.virtual_account) ??
    asRecord(nestedData?.va) ??
    asRecord(nestedData?.virtual_account);

  const layers: LooseRecord[] = [root];
  if (nestedPayment) layers.push(nestedPayment);
  if (nestedData) layers.push(nestedData);

  const get = (...keys: string[]): unknown => {
    for (const layer of layers) {
      for (const key of keys) {
        if (layer[key] !== undefined && layer[key] !== null && layer[key] !== "") {
          return layer[key];
        }
      }
    }
    return undefined;
  };

  const paymentId =
    pickNumber(get("payment_id", "id", "paymentId"), fallback.payment_id) ?? 0;

  const qrImage = pickString(
    get("qr_image", "qrImage", "qr_image_url"),
    nestedQr?.image,
    nestedQr?.qr_image,
    fallback.qr_image,
  );
  const qrUrl = pickString(
    get("qr_url", "qrUrl", "qr_link"),
    nestedQr?.url,
    nestedQr?.qr_url,
    fallback.qr_url,
  );
  // `qris` may be EMV string or nested object with string/content
  const qrisRaw = get("qris", "qr");
  const qrisAsRecord = asRecord(qrisRaw);
  const qrContent = pickString(
    get("qr_content", "qr_string", "qr_code", "qrString", "qrContent", "qr_data", "qrData"),
    typeof qrisRaw === "string" ? qrisRaw : null,
    qrisAsRecord?.content,
    qrisAsRecord?.string,
    qrisAsRecord?.code,
    qrisAsRecord?.data,
    nestedQr?.content,
    nestedQr?.string,
    nestedQr?.code,
    nestedQr?.data,
    fallback.qr_content,
  );
  const vaNumber = pickString(
    get("va_number", "vaNumber", "virtual_account", "virtual_account_number", "va"),
    nestedVa?.number,
    nestedVa?.va_number,
    nestedVa?.account,
    fallback.va_number,
  );
  const paymentCode = pickString(
    get("payment_code", "pay_code", "payCode", "kode_bayar", "bill_code"),
    nestedVa?.payment_code,
    fallback.payment_code,
  );

  // Prefer explicit payment URL keys; avoid generic `url` stealing QR asset URLs
  const paymentUrl = pickString(
    get("payment_url", "paymentUrl", "checkout_url", "checkoutUrl", "pay_url"),
    fallback.payment_url,
  );

  return {
    payment_id: paymentId,
    status: pickString(get("status"), fallback.status) ?? "pending",
    payment_url: paymentUrl,
    reference: pickString(get("reference", "merchant_ref", "ref"), fallback.reference) ?? undefined,
    paid_at: pickString(get("paid_at", "paidAt"), fallback.paid_at),
    coin_balance: pickNumber(get("coin_balance", "coinBalance"), fallback.coin_balance),
    amount: pickNumber(get("amount", "price", "total"), fallback.amount),
    coin: pickNumber(get("coin", "coins"), fallback.coin),
    method: pickString(get("method", "payment_method", "channel"), fallback.method),
    qr_url: qrUrl,
    qr_image: qrImage,
    qr_content: qrContent,
    payment_code: paymentCode,
    va_number: vaNumber,
    expired_at: pickString(
      get("expired_at", "expiredAt", "expires_at", "expiry"),
      nestedVa?.expired_at,
      fallback.expired_at,
    ),
    transaction_id: pickNumber(get("transaction_id", "reference_id", "coin_transaction_id"), fallback.transaction_id),
  };
}

function isLikelyImageUrl(value: string): boolean {
  return /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(value) || value.startsWith("data:image/");
}

function isLikelyQrisEmv(value: string): boolean {
  // EMVCo QRIS payloads typically start with "000201"
  return /^000201/.test(value.trim());
}

export type QrPayload =
  | { kind: "image"; value: string }
  | { kind: "text"; value: string };

/**
 * Pick best QR source from payment payload.
 * Docs only guarantee payment_url — we generate QR from that when needed.
 */
export function resolveQrPayload(
  payment: PaymentPayload,
  options: { allowPaymentUrl?: boolean } = {},
): QrPayload | null {
  const allowPaymentUrl = options.allowPaymentUrl !== false;

  if (payment.qr_image?.trim()) {
    const img = payment.qr_image.trim();
    if (img.startsWith("data:")) return { kind: "image", value: img };
    if (/^[A-Za-z0-9+/=]+$/.test(img.slice(0, 80)) && !img.startsWith("http")) {
      return { kind: "image", value: `data:image/png;base64,${img}` };
    }
    if (isLikelyImageUrl(img) || /^https?:\/\//i.test(img)) {
      return { kind: "image", value: img };
    }
    // raw base64-ish without prefix already handled; otherwise treat as text to encode
    return { kind: "text", value: img };
  }

  if (payment.qr_url?.trim()) {
    const url = payment.qr_url.trim();
    if (isLikelyImageUrl(url)) return { kind: "image", value: url };
    return { kind: "text", value: url };
  }

  if (payment.qr_content?.trim()) {
    return { kind: "text", value: payment.qr_content.trim() };
  }

  const payUrl = payment.payment_url?.trim();
  if (payUrl) {
    if (isLikelyImageUrl(payUrl)) return { kind: "image", value: payUrl };
    if (isLikelyQrisEmv(payUrl) || allowPaymentUrl) {
      return { kind: "text", value: payUrl };
    }
  }

  return null;
}

/** Resolve QR image URL from various PG response shapes (legacy helper). */
export function resolveQrImageSrc(payment: PaymentPayload): string | null {
  const payload = resolveQrPayload(payment, { allowPaymentUrl: true });
  if (!payload) return null;
  if (payload.kind === "image") return payload.value;
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(payload.value)}`;
}

/** Nomor VA / kode bayar (prioritas VA). */
export function resolveVaNumber(payment: PaymentPayload): string | null {
  return payment.va_number?.trim() || payment.payment_code?.trim() || null;
}

/** Kode bayar / VA / reference untuk ditampilkan & disalin. */
export function resolvePaymentCode(payment: PaymentPayload): string | null {
  return (
    payment.va_number?.trim() ||
    payment.payment_code?.trim() ||
    payment.reference?.trim() ||
    null
  );
}
