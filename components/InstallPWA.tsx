"use client";

import { useEffect, useState } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed", platform: string }>;
};

export function InstallPWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    // Check if running as standalone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (window.matchMedia("(display-mode: standalone)").matches || (window.navigator as any).standalone) {
      setIsStandalone(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Only show if not previously dismissed
      if (localStorage.getItem("pwa_dismissed") !== "true") {
        setIsVisible(true);
      }
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setIsVisible(false);
      setDeferredPrompt(null);
      setIsStandalone(true);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setIsVisible(false);
    }
  };

  const handleDismiss = () => {
    setIsVisible(false);
    localStorage.setItem("pwa_dismissed", "true");
  };

  if (!isVisible || isStandalone) return null;

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[100] w-[92%] max-w-sm fade-up">
      <div className="bg-[#1a1218] border border-white/10 p-4 rounded-2xl shadow-2xl flex flex-col space-y-3 relative">
        <button 
          onClick={handleDismiss} 
          className="absolute top-2 right-3 text-white/50 hover:text-white transition p-1 text-lg leading-none"
          aria-label="Tutup"
        >
          &times;
        </button>
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-[var(--accent)] rounded-xl flex items-center justify-center shrink-0 shadow-lg">
            <span className="font-display font-bold text-[#1a0b10] text-xl">KD</span>
          </div>
          <div>
            <h4 className="font-bold text-white text-base leading-tight">Install Kedai Dracin</h4>
            <p className="text-xs text-white/60 mt-0.5">Akses lebih cepat & tanpa browser frame</p>
          </div>
        </div>
        <button 
          onClick={handleInstallClick}
          className="w-full bg-[var(--accent)] text-[#1a0b10] font-bold py-2.5 rounded-xl transition hover:brightness-110 active:scale-95 text-sm"
        >
          Install App
        </button>
      </div>
    </div>
  );
}
