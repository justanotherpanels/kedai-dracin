"use client";

import { useState, type FormEvent } from "react";
import { useAuth } from "@/components/AuthProvider";
import { apiRequest, ApiRequestError } from "@/lib/api";
import type { User } from "@/lib/types";

type Props = {
  onUpdated: () => void;
};

export function EditProfileForm({ onUpdated }: Props) {
  const { token, user, setUser } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    if (password && password !== passwordConfirmation) {
      setError("Konfirmasi password tidak cocok.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const body: Record<string, string> = {};
      if (name.trim() && name.trim() !== user?.name) body.name = name.trim();
      if (email.trim() && email.trim() !== user?.email) body.email = email.trim();
      if (password) {
        body.password = password;
        body.password_confirmation = passwordConfirmation;
      }
      if (Object.keys(body).length === 0) {
        setError("Tidak ada perubahan.");
        setLoading(false);
        return;
      }
      const res = await apiRequest<User>("/account", {
        method: "PUT",
        token,
        body,
      });
      setUser(res.data);
      setPassword("");
      setPasswordConfirmation("");
      setMessage(res.message ?? "Akun diperbarui.");
      onUpdated();
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "Gagal memperbarui akun.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl bg-white/[0.03] px-4 py-3.5 text-left"
      >
        <span className="font-display text-base">Edit profil</span>
        <span className="text-xs text-white/40">{open ? "Tutup" : "Ubah"}</span>
      </button>

      {open && (
        <form onSubmit={onSubmit} className="mt-3 space-y-3 rounded-2xl border border-white/8 p-4">
          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">Nama</span>
            <input className="field" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">Email</span>
            <input
              className="field"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs text-white/50">Password baru (opsional)</span>
            <input
              className="field"
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Kosongkan jika tidak diganti"
            />
          </label>
          {password ? (
            <label className="block space-y-1.5">
              <span className="text-xs text-white/50">Konfirmasi password</span>
              <input
                className="field"
                type="password"
                minLength={6}
                required
                value={passwordConfirmation}
                onChange={(e) => setPasswordConfirmation(e.target.value)}
              />
            </label>
          ) : null}
          {error && <p className="text-sm text-rose-300">{error}</p>}
          {message && <p className="text-sm text-emerald-300">{message}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Menyimpan..." : "Simpan perubahan"}
          </button>
        </form>
      )}
    </section>
  );
}
