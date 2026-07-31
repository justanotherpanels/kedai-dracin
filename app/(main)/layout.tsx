"use client";

import { BottomNav } from "@/components/BottomNav";
import { MobileShell } from "@/components/MobileShell";

export default function MainLayout({ children }: { children: React.ReactNode }) {
  return (
    <MobileShell>
      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden pb-[var(--bottom-nav-h)]">
          {children}
        </div>
        <BottomNav />
      </div>
    </MobileShell>
  );
}
