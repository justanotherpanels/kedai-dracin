import type { Metadata } from "next";
import { getHomeMetadata } from "@/lib/seo";

export const metadata: Metadata = getHomeMetadata();

export default function HomeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
