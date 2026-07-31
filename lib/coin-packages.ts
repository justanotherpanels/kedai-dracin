import type { CoinPackage } from "@/lib/types";

/** Paket top-up default (backend menerima package_id atau amount). */
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
};

export const PAYMENT_METHODS: PaymentMethod[] = [
  { code: "qris", label: "QRIS", kind: "qris" },
  { code: "dana", label: "DANA", kind: "ewallet" },
  { code: "ovo", label: "OVO", kind: "ewallet" },
  { code: "gopay", label: "GoPay", kind: "ewallet" },
  { code: "va_bca", label: "VA BCA", kind: "va" },
  { code: "va_bni", label: "VA BNI", kind: "va" },
  { code: "va_bri", label: "VA BRI", kind: "va" },
  { code: "va_mandiri", label: "VA Mandiri", kind: "va" },
];

export function getPaymentMethod(code: string | null | undefined): PaymentMethod | undefined {
  if (!code) return undefined;
  return PAYMENT_METHODS.find((m) => m.code === code);
}

export function getPaymentMethodKind(code: string | null | undefined): PaymentMethodKind {
  const known = getPaymentMethod(code);
  if (known) return known.kind;
  const c = (code || "").toLowerCase();
  if (c.startsWith("va_") || c.includes("virtual") || c === "va") return "va";
  if (c === "qris" || c.includes("qr")) return "qris";
  return "ewallet";
}
