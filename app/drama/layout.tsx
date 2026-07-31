import type { Metadata } from "next";
import { getDramaMetadata } from "@/lib/seo";

export const metadata: Metadata = getDramaMetadata();

export default function DramaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
