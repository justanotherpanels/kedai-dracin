export function loginUrl(next?: string) {
  if (!next || next === "/login" || next.startsWith("/login?")) return "/login";
  return `/login?next=${encodeURIComponent(next)}`;
}

export function safeNextPath(raw: string | null | undefined, fallback = "/home") {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw;
}
