"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { MobileShell } from "@/components/MobileShell";

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/home");
  }, [router]);

  return (
    <MobileShell>
      <div className="flex flex-1 items-center justify-center">
        <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-[var(--accent)]" />
      </div>
    </MobileShell>
  );
}
