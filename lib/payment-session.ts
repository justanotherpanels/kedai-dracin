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
 * Handles flat fields and nested `payment` / `data` / `qr` / `va` / `qris` objects.
 */
export function normalizePaymentPayload(
  raw: unknown,
  fallback: Partial<PaymentPayload> = {},
): PaymentPayload {
  const root = asRecord(raw) ?? {};
  const nestedPayment = asRecord(root.payment);
  const nestedData = asRecord(root.data);
  const nestedQr =
    asRecord(root.qr) ??
    asRecord(root.qris) ??
    asRecord(nestedPayment?.qr) ??
    asRecord(nestedPayment?.qris) ??
    asRecord(nestedData?.qr) ??
    asRecord(nestedData?.qris);
  const nestedVa =
    asRecord(root.va) ??
    asRecord(root.virtual_account) ??
    asRecord(nestedPayment?.va) ??
    asRecord(nestedPayment?.virtual_account) ??
    asRecord(nestedData?.va) ??
    asRecord(nestedData?.virtual_account);
  const nestedGateway =
    asRecord(root.gateway) ??
    asRecord(root.pg) ??
    asRecord(root.gateway_response) ??
    asRecord(nestedPayment?.gateway) ??
    asRecord(nestedData?.gateway);

  const layers: LooseRecord[] = [root];
  if (nestedPayment) layers.push(nestedPayment);
  if (nestedData) layers.push(nestedData);
  if (nestedGateway) layers.push(nestedGateway);

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
    get("qr_image", "qrImage", "qr_image_url", "qr_img"),
    nestedQr?.image,
    nestedQr?.qr_image,
    nestedQr?.img,
    fallback.qr_image,
  );
  const qrUrl = pickString(
    get("qr_url", "qrUrl", "qr_link", "qrcode_url"),
    nestedQr?.url,
    nestedQr?.qr_url,
    nestedQr?.link,
    fallback.qr_url,
  );
  // `qris` may be EMV string or nested object with string/content
  const qrisRaw = get("qris", "qr", "qrcode");
  const qrisAsRecord = asRecord(qrisRaw);
  const qrContent = pickString(
    get(
      "qr_content",
      "qr_string",
      "qr_code",
      "qrString",
      "qrContent",
      "qr_data",
      "qrData",
      "qris_string",
      "qr_value",
    ),
    typeof qrisRaw === "string" ? qrisRaw : null,
    qrisAsRecord?.content,
    qrisAsRecord?.string,
    qrisAsRecord?.code,
    qrisAsRecord?.data,
    qrisAsRecord?.qr_string,
    nestedQr?.content,
    nestedQr?.string,
    nestedQr?.code,
    nestedQr?.data,
    nestedQr?.qr_string,
    fallback.qr_content,
  );
  const vaNumber = pickString(
    get("va_number", "vaNumber", "virtual_account", "virtual_account_number", "account_number"),
    typeof get("va") === "string" || typeof get("va") === "number" ? get("va") : null,
    nestedVa?.number,
    nestedVa?.va_number,
    nestedVa?.account,
    nestedVa?.account_number,
    fallback.va_number,
  );
  const paymentCode = pickString(
    get("payment_code", "pay_code", "payCode", "kode_bayar", "bill_code", "pay_number"),
    nestedVa?.payment_code,
    fallback.payment_code,
  );

  // Prefer explicit payment URL keys; avoid generic `url` stealing QR asset URLs
  const paymentUrl = pickString(
    get(
      "payment_url",
      "paymentUrl",
      "checkout_url",
      "checkoutUrl",
      "pay_url",
      "invoice_url",
      "checkout_link",
    ),
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
    method: pickString(get("method", "payment_method", "channel", "payment_method_code"), fallback.method),
    payment_type: pickString(
      get("payment_type", "paymentType", "type_payment"),
      fallback.payment_type,
    ),
    qr_url: qrUrl,
    qr_image: qrImage,
    qr_content: qrContent,
    qr_string: pickString(get("qr_string"), fallback.qr_string) ?? qrContent,
    payment_code: paymentCode,
    va_number: vaNumber,
    gateway_reference: pickString(
      get("gateway_reference", "gateway_ref", "pg_reference", "tripay_reference"),
      fallback.gateway_reference,
    ),
    expired_at: pickString(
      get("expired_at", "expiredAt", "expires_at", "expiry", "expired_time"),
      nestedVa?.expired_at,
      fallback.expired_at,
    ),
    transaction_id: pickNumber(
      get("transaction_id", "reference_id", "coin_transaction_id"),
      fallback.transaction_id,
    ),
  };
}

function isLikelyImageUrl(value: string): boolean {
  return /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(value) || value.startsWith("data:image/");
}

function isLikelyHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function isLikelyQrisEmv(value: string): boolean {
  // EMVCo QRIS payloads typically start with "000201"
  return /^000201/.test(value.trim());
}

function isUsableQrText(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  // Placeholder sandbox Tripay — jangan di-encode jadi QR
  if (/^sandbox mode$/i.test(v)) return false;
  return isLikelyQrisEmv(v) || v.length >= 20;
}

export type QrPayload =
  | { kind: "image"; value: string }
  | { kind: "text"; value: string };

/**
 * Pilih sumber QR sesuai DOKUMENTASI §4.2:
 * payment_url | qr_string/qr_content (EMV) | qr_url/qr_image
 */
export function resolveQrPayload(
  payment: PaymentPayload,
  options: { allowPaymentUrl?: boolean } = {},
): QrPayload | null {
  const allowPaymentUrl = options.allowPaymentUrl !== false;

  const asImageUrl = (raw: string | null | undefined): QrPayload | null => {
    const value = raw?.trim();
    if (!value) return null;
    if (value.startsWith("data:image/")) return { kind: "image", value };
    if (isLikelyHttpUrl(value) || isLikelyImageUrl(value)) return { kind: "image", value };
    // raw base64 tanpa prefix
    if (/^[A-Za-z0-9+/=]+$/.test(value.slice(0, 80)) && !value.startsWith("http") && value.length > 64) {
      return { kind: "image", value: `data:image/png;base64,${value}` };
    }
    return null;
  };

  // 1) Gambar dari gateway (Tripay qr_url / qr_image)
  const fromImage =
    asImageUrl(payment.qr_image) ||
    asImageUrl(payment.qr_url);
  if (fromImage) return fromImage;

  // 2) EMV string (qr_string / qr_content)
  const emv =
    [payment.qr_string, payment.qr_content]
      .map((v) => v?.trim())
      .find((v) => v && isUsableQrText(v)) ?? null;
  if (emv) return { kind: "text", value: emv };

  // 3) payment_url — generate QR dari URL checkout
  const payUrl = payment.payment_url?.trim();
  if (payUrl) {
    if (isLikelyImageUrl(payUrl) || (isLikelyHttpUrl(payUrl) && /\.(png|jpe?g|webp|gif)(\?|$)/i.test(payUrl))) {
      return { kind: "image", value: payUrl };
    }
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
