const DOOD_HOSTS = [
  "doodstream.com",
  "dood.stream",
  "dood.so",
  "dood.la",
  "dood.ws",
  "dood.wf",
  "dood.cx",
  "dood.sh",
  "dood.pm",
  "dood.li",
  "dood.yt",
  "dood.watch",
  "dood.to",
  "doods.pro",
  "ds2play.com",
  "ds2video.com",
  "dsvplay.com",
  "dooood.com",
  "doodcdn.com",
  "d000d.com",
  "d0000d.com",
  "dood.video",
  // Active Cloudflare mirrors (redirect targets)
  "playmogo.com",
  "alltimesplay.com",
  "vidply.com",
];

/** Preferred bootstrap hosts when resolving / retrying past Cloudflare. */
export const DOOD_BOOTSTRAP_ORIGINS = [
  "https://dsvplay.com",
  "https://doodstream.com",
  "https://dood.li",
  "https://dooood.com",
  "https://playmogo.com",
] as const;

function isDoodHost(host: string): boolean {
  const h = host.toLowerCase();
  if (DOOD_HOSTS.some((allowed) => h === allowed || h.endsWith(`.${allowed}`))) {
    return true;
  }
  return /dood|ds2play|ds2video|dsvplay|playmogo|d0000?d/i.test(h);
}

export function extractDoodFileCode(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (/^[a-zA-Z0-9]{8,20}$/.test(raw)) return raw;

  let url = raw;
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  let parts: URL;
  try {
    parts = new URL(url);
  } catch {
    return null;
  }

  if (!isDoodHost(parts.hostname)) return null;

  const path = parts.pathname;
  const nested = path.match(/\/(?:e|d|play|f)\/([a-zA-Z0-9]+)/);
  if (nested) return nested[1];

  const trailing = path.match(/\/([a-zA-Z0-9]{8,20})\/?$/);
  if (trailing) return trailing[1];

  return null;
}

export function isDoodSource(input: string): boolean {
  return extractDoodFileCode(input) !== null;
}

export function doodOrigin(sourceUrl?: string): string {
  let host = "dsvplay.com";
  if (sourceUrl && !/^[a-zA-Z0-9]{8,20}$/.test(sourceUrl.trim())) {
    try {
      const normalized = /^https?:\/\//i.test(sourceUrl) ? sourceUrl : `https://${sourceUrl}`;
      host = new URL(normalized).hostname.toLowerCase();
    } catch {
      /* keep default */
    }
  }
  return `https://${host}`;
}
