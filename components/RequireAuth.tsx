"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/components/AuthProvider";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { ready, token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (ready && !token) router.replace("/login");
  }, [ready, token, router]);

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
      </div>
    );
  }

  if (!token) return null;
  return <>{children}</>;
}
