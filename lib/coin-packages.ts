import type { CoinPackage } from "@/lib/types";

/** Paket top-up default (backend menerima package_id atau amount). */
export const COIN_PACKAGES: CoinPackage[] = [
  { id: 1, coin: 25, amount: 5000, label: "25 coin" },
  { id: 2, coin: 50, amount: 10000, label: "50 coin" },
  { id: 3, coin: 100, amount: 18000, label: "100 coin" },
  { id: 4, coin: 250, amount: 40000, label: "250 coin" },
];

export const PAYMENT_METHODS = [
  { code: "qris", label: "QRIS" },
  { code: "dana", label: "DANA" },
  { code: "ovo", label: "OVO" },
  { code: "gopay", label: "GoPay" },
  { code: "va_bca", label: "VA BCA" },
] as const;
