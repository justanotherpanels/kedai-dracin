import type { MetadataRoute } from "next";
import { API_BASE_URL } from "@/lib/config";
import type { Drama } from "@/lib/types";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Menggunakan URL dari Vercel (otomatis) atau localhost sebagai fallback
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"));

  let dramas: Drama[] = [];
  try {
    let page = 1;
    let totalPages = 1;
    const limit = 50; // API limits max 50 per page

    while (page <= totalPages) {
      const res = await fetch(`${API_BASE_URL}/drama?limit=${limit}&page=${page}`, {
        next: { revalidate: 3600 },
      });
      
      if (!res.ok) break;
      
      const payload = await res.json();
      if (payload?.status === "success" && Array.isArray(payload.data)) {
        dramas.push(...payload.data);
        totalPages = payload.meta?.last_page || 1;
      } else {
        break;
      }
      
      page++;
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
