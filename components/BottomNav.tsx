"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconBookmark, IconDeviceTvOld, IconHome, IconUser } from "@tabler/icons-react";

const items = [
  {
    href: "/home",
    label: "Beranda",
    icon: IconHome,
  },
  {
    href: "/drama",
    label: "Drama",
    icon: IconDeviceTvOld,
  },
  {
    href: "/saved",
    label: "Tersimpan",
    icon: IconBookmark,
  },
  {
    href: "/profile",
    label: "Akun",
    icon: IconUser,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="bottom-nav-fixed safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-white/8 bg-[#0c0a0f]/96 backdrop-blur-xl">
      <ul className="mx-auto grid w-full max-w-lg grid-cols-4 px-1 pt-1.5 pb-1 md:max-w-4xl">
        {items.map((item) => {
          const active =
            item.href === "/drama"
              ? pathname === "/drama"
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`flex flex-col items-center gap-0.5 rounded-xl px-1 py-2 text-[10px] font-medium transition sm:text-[11px] ${
                  active ? "text-[var(--accent)]" : "text-white/45 hover:text-white/75"
                }`}
              >
                <span className={active ? "scale-105" : "opacity-80"}>
                  <Icon size={20} stroke={1.8} />
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
