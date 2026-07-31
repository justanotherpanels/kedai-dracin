"use client";

import Image from "next/image";
import Link from "next/link";
import type { Drama } from "@/lib/types";

export function DramaPoster({
  drama,
  href,
  compact = false,
  showLikes = false,
}: {
  drama: Drama;
  href?: string;
  compact?: boolean;
  showLikes?: boolean;
}) {
  const target = href ?? `/drama/${drama.id}`;

  return (
    <Link href={target} className="group block shrink-0">
      <div
        className={`relative overflow-hidden rounded-2xl bg-white/5 ${
          compact ? "aspect-[2/3] w-[118px]" : "aspect-[2/3] w-full"
        }`}
      >
        {drama.banner_url ? (
          <Image
            src={drama.banner_url}
            alt={drama.title}
            fill
            sizes={compact ? "118px" : "50vw"}
            className="object-cover transition duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gradient-to-br from-[#2a1f28] to-[#121015] text-xs text-white/40">
            No cover
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent p-2.5 pt-10">
          <p className="line-clamp-2 text-[12px] font-semibold leading-snug text-white">{drama.title}</p>
          <p className="mt-1 text-[10px] text-white/55">
            {drama.total_episodes} eps
            {showLikes && typeof drama.likes_count === "number" ? ` · ${drama.likes_count} suka` : ""}
          </p>
        </div>
      </div>
    </Link>
  );
}
