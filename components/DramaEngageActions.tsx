"use client";

import { IconBookmark, IconBookmarkFilled, IconHeart, IconHeartFilled } from "@tabler/icons-react";

type DramaEngageActionsProps = {
  liked: boolean;
  saved: boolean;
  likesCount: number;
  busy?: boolean;
  onToggleLike: () => void;
  onToggleSave: () => void;
};

export function DramaEngageActions({
  liked,
  saved,
  likesCount,
  busy,
  onToggleLike,
  onToggleSave,
}: DramaEngageActionsProps) {
  return (
    <div className="pointer-events-auto flex flex-col items-center gap-4">
      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onToggleLike();
        }}
        className="flex flex-col items-center gap-1"
      >
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur ${
            liked ? "bg-[var(--accent)] text-[#1a0b10]" : "bg-black/45 text-white"
          }`}
        >
          {liked ? <IconHeartFilled size={24} /> : <IconHeart size={24} stroke={1.8} />}
        </span>
        <span className="text-[11px] font-medium text-white/85">{likesCount}</span>
      </button>

      <button
        type="button"
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onToggleSave();
        }}
        className="flex flex-col items-center gap-1"
      >
        <span
          className={`flex h-12 w-12 items-center justify-center rounded-full backdrop-blur ${
            saved ? "bg-[var(--accent)] text-[#1a0b10]" : "bg-black/45 text-white"
          }`}
        >
          {saved ? <IconBookmarkFilled size={24} /> : <IconBookmark size={24} stroke={1.8} />}
        </span>
        <span className="text-[11px] font-medium text-white/85">{saved ? "Tersimpan" : "Simpan"}</span>
      </button>
    </div>
  );
}
