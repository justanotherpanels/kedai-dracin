"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { SliderItem } from "@/lib/types";

export function HeroSlider({ items }: { items: SliderItem[] }) {
  const slides = useMemo(
    () => items.filter((item): item is SliderItem & { drama: NonNullable<SliderItem["drama"]> } => Boolean(item.drama)),
    [items],
  );
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 4200);
    return () => window.clearInterval(timer);
  }, [slides.length]);

  if (!slides.length) return null;

  const safeIndex = index % slides.length;
  const current = slides[safeIndex];

  return (
    <section className="relative overflow-hidden rounded-[1.6rem]">
      <div className="relative aspect-[4/5] w-full">
        {slides.map((item, i) => (
          <div
            key={item.id}
            className={`absolute inset-0 transition-opacity duration-700 ${
              i === safeIndex ? "opacity-100" : "opacity-0"
            }`}
          >
            {item.drama.banner_url ? (
              <Image
                src={item.drama.banner_url}
                alt={item.drama.title}
                fill
                priority={i === 0}
                sizes="430px"
                className="object-cover"
              />
            ) : (
              <div className="h-full w-full bg-[#1a1218]" />
            )}
          </div>
        ))}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0c0a0f] via-[#0c0a0f]/35 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 space-y-3 p-5">
          <p className="font-display text-[11px] uppercase tracking-[0.22em] text-[var(--accent)]">
            Spotlight
          </p>
          <h2 className="max-w-[18ch] font-display text-[1.65rem] leading-[1.05] tracking-tight">
            {current.drama.title}
          </h2>
          <p className="text-sm text-white/65">{current.drama.total_episodes} episode</p>
          <Link
            href={`/drama/${current.drama.id}`}
            className="inline-flex h-11 items-center justify-center rounded-full bg-[var(--accent)] px-5 text-sm font-semibold text-[#1a0b10] transition hover:brightness-110"
          >
            Tonton sekarang
          </Link>
        </div>
      </div>
      {slides.length > 1 && (
        <div className="absolute right-4 bottom-5 flex gap-1.5">
          {slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              aria-label={`Slide ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === safeIndex ? "w-5 bg-[var(--accent)]" : "w-1.5 bg-white/35"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  );
}
