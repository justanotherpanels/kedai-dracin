"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { MobileShell } from "@/components/MobileShell";
import { apiRequest, ApiRequestError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);
    try {
      const res = await apiRequest<null>("/auth/forgot-password", {
        body: { email: email.trim() },
      });
      setMessage(res.message ?? "Link reset password telah dikirim ke email.");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal mengirim link reset.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <MobileShell>
      <div className="page-scroll flex flex-1 flex-col px-6 pb-10 pt-16">
        <div className="fade-up mb-8">
          <BrandLogo priority className="mb-5" />
          <h1 className="mt-3 font-[family-name:var(--font-display)] text-[2.2rem] leading-[1.05]">
            Lupa password
          </h1>
          <p className="mt-3 text-sm text-white/55">
            Masukkan email akun. Kami kirim link untuk reset password.
          </p>
        </div>

        <form onSubmit={onSubmit} className="fade-up space-y-3" style={{ animationDelay: "80ms" }}>
          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">Email</span>
            <input
              className="field"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@contoh.com"
            />
          </label>

          {error && (
            <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
          )}
          {message && (
            <p className="rounded-xl bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{message}</p>
          )}

          <button type="submit" className="btn-primary mt-2" disabled={loading}>
            {loading ? "Mengirim..." : "Kirim link reset"}
          </button>
        </form>

        <p className="mt-auto pt-8 text-center text-sm text-white/45">
          <Link href="/login" className="font-semibold text-[var(--accent-soft)]">
            Kembali ke masuk
          </Link>
        </p>
      </div>
    </MobileShell>
  );
}
