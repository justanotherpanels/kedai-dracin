"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { MobileShell } from "@/components/MobileShell";
import { ApiRequestError } from "@/lib/api";
import { safeNextPath } from "@/lib/auth-redirect";

function LoginForm() {
  const { login, token, ready } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (ready && token) router.replace(next);
  }, [ready, token, router, next]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email.trim(), password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Login gagal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-scroll flex flex-1 flex-col px-6 pb-10 pt-16">
      <div className="fade-up mb-10">
        <BrandLogo priority className="mb-5" />
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
        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">Password</span>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        {error && (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
        )}

        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs text-white/50 hover:text-[var(--accent-soft)]">
            Lupa password?
          </Link>
        </div>

        <button type="submit" className="btn-primary mt-2" disabled={loading}>
          {loading ? "Masuk..." : "Masuk"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-white/45">
        <Link href="/home" className="font-semibold text-white/70">
          Lanjut tanpa login
        </Link>
      </p>

      <p className="mt-auto pt-8 text-center text-sm text-white/45">
        Belum punya akun?{" "}
        <Link
          href={`/register?next=${encodeURIComponent(next)}`}
          className="font-semibold text-[var(--accent-soft)]"
        >
          Daftar
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <MobileShell>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </MobileShell>
  );
}
