import type { CoinPackage, PaymentChannel } from "@/lib/types";

/** Paket top-up default (hanya dipakai jika API belum mengirim packages). */
export const COIN_PACKAGES: CoinPackage[] = [
  { id: 1, coin: 25, amount: 5000, label: "25 coin" },
  { id: 2, coin: 50, amount: 10000, label: "50 coin" },
  { id: 3, coin: 100, amount: 18000, label: "100 coin" },
  { id: 4, coin: 250, amount: 40000, label: "250 coin" },
];

export type PaymentMethodKind = "qris" | "ewallet" | "va";

export type PaymentMethod = {
  code: string;
  label: string;
  kind: PaymentMethodKind;
  iconUrl?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function normalizeChannelItem(raw: unknown): PaymentChannel | null {
  if (typeof raw === "string" && raw.trim()) {
    return { code: raw.trim(), name: raw.trim() };
  }
  const item = asRecord(raw);
  if (!item) return null;
  const code = String(item.code ?? item.method ?? item.id ?? "").trim();
  if (!code) return null;
  const name = String(item.name ?? item.label ?? item.title ?? code).trim() || code;
  return {
    code,
    name,
    payment_type: (item.payment_type as string | null | undefined) ?? null,
    icon_url: (item.icon_url as string | null | undefined) ?? null,
    fee_customer: (item.fee_customer as number | null | undefined) ?? null,
    fee_merchant: (item.fee_merchant as number | null | undefined) ?? null,
  };
}

/** Ambil daftar channel dari berbagai bentuk respons API (§4.1 / §6.1). */
export function extractPaymentChannels(source: unknown): PaymentChannel[] {
  const root = asRecord(source);
  if (!root) {
    if (Array.isArray(source)) {
      return source.map(normalizeChannelItem).filter((c): c is PaymentChannel => Boolean(c));
    }
    return [];
  }

  const candidates: unknown[] = [
    root.payment_channels,
    root.channels,
    root.payment_methods,
    root.methods,
    asRecord(root.payment)?.channels,
    asRecord(root.data)?.payment_channels,
    asRecord(root.data)?.channels,
  ];

  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (Array.isArray(candidate)) {
      // array kosong = API bilang tidak ada channel aktif — jangan lanjut cari key lain
      return candidate.map(normalizeChannelItem).filter((c): c is PaymentChannel => Boolean(c));
    }
    const nested = asRecord(candidate);
    if (nested && Array.isArray(nested.channels)) {
      return nested.channels
        .map(normalizeChannelItem)
        .filter((c): c is PaymentChannel => Boolean(c));
    }
  }

  return [];
}

/**
 * Gabungkan channel dari GET /coin dan GET /payment/channels.
 * Tidak hardcode — sesuai DOKUMENTASI §6 (channel dari PG saja).
 */
export function resolvePaymentChannels(
  fromCoin?: PaymentChannel[] | null,
  fromChannelsEndpoint?: unknown,
): PaymentChannel[] {
  if (fromCoin?.length) return fromCoin;

  const fromEndpoint = extractPaymentChannels(fromChannelsEndpoint);
  if (fromEndpoint.length) return fromEndpoint;

  return [];
}

/** Map channel API → UI method. `method` saat beli = `code` dari channel. */
export function channelToPaymentMethod(channel: PaymentChannel): PaymentMethod {
  return {
    code: channel.code,
    label: channel.name || channel.code,
    kind: getPaymentMethodKind(channel.code, channel.payment_type),
    iconUrl: channel.icon_url,
  };
}

export function channelsToPaymentMethods(channels: PaymentChannel[] | null | undefined): PaymentMethod[] {
  if (!channels?.length) return [];
  return channels.map(channelToPaymentMethod);
}

export function getPaymentMethod(
  code: string | null | undefined,
  channels?: PaymentChannel[] | null,
): PaymentMethod | undefined {
  if (!code || !channels?.length) return undefined;
  const fromApi = channels.find((c) => c.code === code || c.code.toLowerCase() === code.toLowerCase());
  if (fromApi) return channelToPaymentMethod(fromApi);
  return undefined;
}

export function getPaymentMethodKind(
  code: string | null | undefined,
  paymentType?: string | null,
): PaymentMethodKind {
  const c = (code || "").toLowerCase();
  const t = (paymentType || "").toLowerCase();

  if (
    t === "qris" ||
    t.includes("qris") ||
    c === "qris" ||
    c.includes("qr") ||
    t.includes("qr")
  ) {
    return "qris";
  }
  if (
    t === "virtual_account" ||
    t.includes("virtual_account") ||
    t.includes("virtual") ||
    t === "va" ||
    c.startsWith("va_") ||
    c.endsWith("va") ||
    c.includes("virtual") ||
    c === "va" ||
    t.includes("bank")
  ) {
    return "va";
  }
  return "ewallet";
}
