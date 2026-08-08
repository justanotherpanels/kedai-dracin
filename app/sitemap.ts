import type { MetadataRoute } from "next";
import { API_BASE_URL } from "@/lib/config";
import type { Drama } from "@/lib/types";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Ganti dengan URL domain produksi Anda jika berbeda
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://kedaidracin.com";

  let dramas: Drama[] = [];
  try {
    // Meminta semua drama dengan batas besar agar masuk sitemap
    const res = await fetch(`${API_BASE_URL}/drama?limit=5000`, {
      next: { revalidate: 3600 }, // cache 1 jam
    });
    
    if (res.ok) {
      const payload = await res.json();
      if (payload?.status === "success" && Array.isArray(payload.data)) {
        dramas = payload.data;
      }
    }
  } catch (error) {
    console.error("Sitemap error: Gagal mengambil data drama", error);
  }

  const dramaUrls: MetadataRoute.Sitemap = dramas.map((drama) => ({
    url: `${siteUrl}/drama/${drama.id}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [
    {
      url: `${siteUrl}/home`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 1,
    },
    {
      url: `${siteUrl}/drama`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: 0.9,
    },
    ...dramaUrls,
  ];
}
