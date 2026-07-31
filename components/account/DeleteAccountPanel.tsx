"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest, ApiRequestError } from "@/lib/api";

export function DeleteAccountPanel() {
  const { token, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    const ok = window.confirm("Hapus akun secara permanen? Tindakan ini tidak bisa dibatalkan.");
    if (!ok) return;
    setLoading(true);
    setError(null);
    try {
      await apiRequest("/account", {
        method: "DELETE",
        token,
        body: password ? { password } : {},
      });
      logout();
      router.replace("/home");
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal menghapus akun.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl bg-rose-500/5 px-4 py-3.5 text-left"
      >
        <span className="font-display text-base text-rose-200">Hapus akun</span>
        <span className="text-xs text-white/40">{open ? "Tutup" : "Buka"}</span>
      </button>

      {open && (
        <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-2xl border border-rose-500/20 p-4">
          <p className="text-sm text-white/50">
            Konfirmasi dengan password akun jika diminta server, lalu akun akan dihapus permanen.
          </p>
          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">Password (opsional)</span>
            <input
              className="field"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password akun"
            />
          </label>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="flex h-12 w-full items-center justify-center rounded-full bg-rose-500/90 text-sm font-bold text-white"
          >
            {loading ? "Menghapus..." : "Hapus akun permanen"}
          </button>
        </form>
      )}
    </section>
  );
}
