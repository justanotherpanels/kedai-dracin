import proxyList from "@/app/data/list_proxy.json";

/**
 * Parse proxy entries from list_proxy.json.
 * Supported formats:
 * - host:port:user:pass
 * - user:pass@host:port
 * - http://user:pass@host:port
 */
export function parseProxyEntry(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  if (/^https?:\/\//i.test(value)) return value;

  if (value.includes("@")) {
    return value.startsWith("//") ? `http:${value}` : `http://${value}`;
  }

  // host:port:user:pass  OR  host:port
  const parts = value.split(":");
  if (parts.length === 2) {
    const [host, port] = parts;
    if (host && port) return `http://${host}:${port}`;
  }
  if (parts.length >= 4) {
    const host = parts[0];
    const port = parts[1];
    const user = parts[2];
    const pass = parts.slice(3).join(":"); // password may contain ':'
    if (host && port && user) {
      return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
    }
  }

  return null;
}

export function getConfiguredProxyUrls(): string[] {
  const fromEnv = (process.env.DOOD_PROXY_URL || "").trim();
  const urls: string[] = [];
  if (fromEnv) {
    const parsed = parseProxyEntry(fromEnv);
    if (parsed) urls.push(parsed);
  }

  const list = Array.isArray(proxyList) ? proxyList : [];
  for (const row of list) {
    const raw = typeof row === "string" ? row : row?.proxy;
    if (!raw || typeof raw !== "string") continue;
    const parsed = parseProxyEntry(raw);
    if (parsed && !urls.includes(parsed)) urls.push(parsed);
  }

  return urls;
}

export function getPrimaryProxyUrl(): string | undefined {
  return getConfiguredProxyUrls()[0];
}
