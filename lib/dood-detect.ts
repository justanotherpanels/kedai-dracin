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
  "dood.video",
];

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

  const host = parts.hostname.toLowerCase();
  const isDood =
    DOOD_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`)) ||
    /dood|ds2play|ds2video|dsvplay/i.test(host);

  if (!isDood) return null;

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
