"use client";

import { type ReactNode } from "react";

export function MobileShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-backdrop relative h-dvh w-full overflow-hidden text-white">
      <div className="relative mx-auto flex h-full w-full max-w-lg flex-col md:max-w-4xl">
        {children}
      </div>
    </div>
  );
}
