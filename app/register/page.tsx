"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { BrandLogo } from "@/components/BrandLogo";
import { MobileShell } from "@/components/MobileShell";
import { ApiRequestError } from "@/lib/api";
import { loginUrl, safeNextPath } from "@/lib/auth-redirect";

function RegisterForm() {
  const { register, token, ready } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeNextPath(searchParams.get("next"));
  const [name, setName] = useState("");
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
      await register(name.trim(), email.trim(), password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Registrasi gagal.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page-scroll flex flex-1 flex-col px-6 pb-10 pt-16">
      <div className="fade-up mb-8">
        <BrandLogo priority className="mb-5" />
      </div>

      <form onSubmit={onSubmit} className="fade-up space-y-3" style={{ animationDelay: "80ms" }}>
        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">Nama</span>
          <input
            className="field"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nama kamu"
          />
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs text-white/50">Email</span>
          <input
            className="field"
            type="email"
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
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimal 6 karakter"
          />
        </label>

        {error && (
          <p className="rounded-xl bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
        )}

        <button type="submit" className="btn-primary mt-2" disabled={loading}>
          {loading ? "Mendaftar..." : "Daftar"}
        </button>
      </form>

      <p className="mt-auto pt-8 text-center text-sm text-white/45">
        Sudah punya akun?{" "}
        <Link href={loginUrl(next)} className="font-semibold text-[var(--accent-soft)]">
          Masuk
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <MobileShell>
      <Suspense
        fallback={
          <div className="flex flex-1 items-center justify-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
          </div>
        }
      >
        <RegisterForm />
      </Suspense>
    </MobileShell>
  );
}
