import googleData from "@/app/data/google.json";

function extractSearchConsole(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw === "G-EXAMPLE") return null;
  const fromMeta = raw.match(/content=["']([^"']+)["']/i);
  if (fromMeta?.[1]) return fromMeta[1].trim();
  // plain verification token
  if (!raw.includes("<")) return raw;
  return null;
}

function extractAnalyticsId(value: string): string | null {
  const raw = value.trim();
  if (!raw || raw === "G-EXAMPLE") return null;
  const fromSrc = raw.match(/[?&]id=(G-[A-Z0-9]+)/i);
  if (fromSrc?.[1]) return fromSrc[1];
  if (/^G-[A-Z0-9]+$/i.test(raw)) return raw;
  return null;
}

type GoogleConfigShape =
  | {
      google_search_console?: string;
      google_analytics?: string;
    }
  | Array<Record<string, string>>;

function normalizeConfig(data: GoogleConfigShape) {
  if (Array.isArray(data)) {
    const merged: Record<string, string> = {};
    for (const item of data) Object.assign(merged, item);
    return merged;
  }
  return data;
}

const config = normalizeConfig(googleData as GoogleConfigShape);

export const GOOGLE_SITE_VERIFICATION = extractSearchConsole(
  config.google_search_console ?? "",
);

export const GOOGLE_ANALYTICS_ID = extractAnalyticsId(config.google_analytics ?? "");
