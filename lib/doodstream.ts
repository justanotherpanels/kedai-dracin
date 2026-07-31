import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { execFile } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { Impit } from "impit";
import {
  DOOD_BOOTSTRAP_ORIGINS,
  doodOrigin,
  extractDoodFileCode,
} from "@/lib/dood-detect";

const execFileAsync = promisify(execFile);

export const DOOD_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function streamSecret() {
  return process.env.DOOD_STREAM_SECRET || "doodplayer-change-me-in-production";
}

function streamTtl() {
  return Number(process.env.DOOD_STREAM_TTL || 7200);
}

type HttpResult = {
  body: string;
  status: number;
  url: string;
};

type RequestOpts = {
  referer?: string;
  headers?: Record<string, string>;
  timeout?: number;
  /** Only used by curl fallback */
  cookieFile?: string;
};

function isCloudflareInterstitial(html: string): boolean {
  return (
    /<title[^>]*>\s*Just a moment/i.test(html) ||
    /cf-browser-verification|cf-challenge-running|Attention Required!|Enable JavaScript and cookies to continue/i.test(
      html,
    ) ||
    (/cf-turnstile/i.test(html) && !/\/pass_md5\//i.test(html))
  );
}

function softBlockedMessage(status: number) {
  return `pass_md5 tidak ditemukan di halaman embed (HTTP ${status}). Server cloud (Vercel) sering diblokir mirror Doodstream — pastikan resolve memakai TLS browser (impit).`;
}

let cachedCurl: string | null | undefined;

async function findCurlBinary(): Promise<string | null> {
  if (cachedCurl !== undefined) return cachedCurl;

  const candidates: string[] = [];
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR || "C:\\Windows";
    candidates.push(join(systemRoot, "System32", "curl.exe"));
    candidates.push("C:\\Windows\\System32\\curl.exe");
    candidates.push("curl.exe");
  }
  candidates.push("curl");

  for (const bin of candidates) {
    if ((bin.includes("\\") || bin.includes("/")) && !existsSync(bin)) continue;
    try {
      await execFileAsync(bin, ["--version"], { timeout: 5000, windowsHide: true });
      cachedCurl = bin;
      return bin;
    } catch {
      /* try next */
    }
  }

  cachedCurl = null;
  return null;
}

async function httpRequestCli(
  bin: string,
  url: string,
  opts: RequestOpts = {},
): Promise<HttpResult> {
  const bodyDir = mkdtempSync(join(tmpdir(), "doodb-"));
  const bodyFile = join(bodyDir, "body.bin");
  const args = [
    "-sL",
    "--compressed",
    "--http1.1",
    "--max-redirs",
    "8",
    "--connect-timeout",
    "15",
    "--max-time",
    String(opts.timeout ?? 45),
    "-A",
    DOOD_UA,
    "-o",
    bodyFile,
    "-w",
    "%{http_code}\n%{url_effective}",
  ];

  if (opts.referer) args.push("-e", opts.referer);
  if (opts.cookieFile) args.push("-c", opts.cookieFile, "-b", opts.cookieFile);
  if (opts.headers) {
    for (const [key, value] of Object.entries(opts.headers)) {
      args.push("-H", `${key}: ${value}`);
    }
  }
  args.push(url);

  try {
    const { stdout } = await execFileAsync(bin, args, {
      timeout: (opts.timeout ?? 45) * 1000 + 5000,
      maxBuffer: 8 * 1024 * 1024,
      windowsHide: true,
    });
    const lines = stdout
      .toString()
      .replace(/\r/g, "")
      .trim()
      .split("\n")
      .filter(Boolean);
    return {
      status: Number(lines[0] || 0),
      url: lines[1] || url,
      body: readFileSync(bodyFile, "utf8"),
    };
  } finally {
    try {
      rmSync(bodyDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Minimal cookie jar compatible with ImpitOptions.cookieJar */
function createMemoryCookieJar() {
  const jar = new Map<string, Map<string, string>>();

  return {
    setCookie(cookie: string, url: string) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        const [pair] = cookie.split(";");
        const eq = pair.indexOf("=");
        if (eq <= 0) return;
        const name = pair.slice(0, eq).trim();
        const value = pair.slice(eq + 1).trim();
        if (!jar.has(host)) jar.set(host, new Map());
        jar.get(host)!.set(name, value);
      } catch {
        /* ignore malformed */
      }
    },
    getCookieString(url: string) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        const parts: string[] = [];
        for (const [h, cookies] of jar) {
          if (host === h || host.endsWith(`.${h}`)) {
            for (const [name, value] of cookies) parts.push(`${name}=${value}`);
          }
        }
        return parts.join("; ");
      } catch {
        return "";
      }
    },
  };
}

/**
 * Chrome TLS impersonation — works on Vercel Linux where plain curl/fetch
 * get soft-blocked (HTTP 200 HTML without pass_md5).
 */
async function httpRequestImpit(
  client: Impit,
  url: string,
  opts: RequestOpts = {},
): Promise<HttpResult> {
  const headers: Record<string, string> = {
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9,id;q=0.8",
    ...(opts.headers ?? {}),
  };
  if (opts.referer) headers.Referer = opts.referer;

  const res = await client.fetch(url, {
    headers,
    redirect: "follow",
    timeout: (opts.timeout ?? 45) * 1000,
  });

  return {
    body: await res.text(),
    status: res.status,
    url: res.url || url,
  };
}

export type ResolvedDood = {
  fileCode: string;
  direct: string;
  referer: string;
  poster: string | null;
  title: string;
};

function uniqueOrigins(inputUrl: string): string[] {
  const primary = doodOrigin(inputUrl);
  const ordered = [primary, ...DOOD_BOOTSTRAP_ORIGINS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const origin of ordered) {
    const key = origin.replace(/\/$/, "").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(origin.replace(/\/$/, ""));
  }
  return out;
}

function parseEmbedMeta(html: string, status: number): {
  passPath: string;
  token: string;
  poster: string | null;
  title: string;
} {
  const passMatch = html.match(/(\/pass_md5\/[a-zA-Z0-9_./-]+)/);
  if (!passMatch) {
    if (isCloudflareInterstitial(html)) {
      throw new Error(
        "Cloudflare challenge memblokir resolve. Coba lagi atau pastikan impit ter-deploy di Vercel.",
      );
    }
    throw new Error(softBlockedMessage(status));
  }
  const passPath = passMatch[1];

  let token: string | null = null;
  const tokenFromPath = passPath.match(/\/pass_md5\/[^'"\s]+\/([a-zA-Z0-9]+)/);
  if (tokenFromPath) token = tokenFromPath[1];
  else {
    const tokenFromHtml = html.match(/[?&]token=([a-zA-Z0-9]+)/);
    if (tokenFromHtml) token = tokenFromHtml[1];
  }
  if (!token) throw new Error("Token playback tidak ditemukan");

  let poster: string | null = null;
  const og = html.match(/(?:og:image|twitter:image)["'\s]+content=["']([^"']+)/i);
  if (og) poster = og[1];
  else {
    const snap = html.match(/content=["'](https:\/\/[^"']+(?:snaps|splash)[^"']+)["']/i);
    if (snap) poster = snap[1];
  }

  let title = "Doodstream";
  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    title = titleMatch[1]
      .replace(/\s*-\s*DoodStream.*$/i, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .trim();
  }

  return { passPath, token, poster, title };
}

export async function resolveDoodStream(inputUrl: string): Promise<ResolvedDood> {
  const fileCode = extractDoodFileCode(inputUrl);
  if (!fileCode) {
    throw new Error("URL / file code Doodstream tidak valid");
  }

  // Prefer Chrome TLS impersonation (Vercel-safe). Fallback to system curl on Windows.
  let client: Impit | null = null;
  try {
    client = new Impit({
      browser: "chrome",
      timeout: 45_000,
      followRedirects: true,
      maxRedirects: 8,
      cookieJar: createMemoryCookieJar(),
    });
  } catch {
    client = null;
  }

  const curlBin = client ? null : await findCurlBinary();
  if (!client && !curlBin) {
    throw new Error(
      "Tidak ada HTTP client untuk bypass Cloudflare (impit/curl). Install dependency impit.",
    );
  }

  const cookieDir = curlBin ? mkdtempSync(join(tmpdir(), "doodck-")) : null;
  const cookieFile = cookieDir ? join(cookieDir, "cookies.txt") : undefined;
  if (cookieFile) writeFileSync(cookieFile, "# Netscape HTTP Cookie File\n");

  const request = async (url: string, opts: RequestOpts = {}) => {
    if (client) return httpRequestImpit(client, url, opts);
    return httpRequestCli(curlBin!, url, { ...opts, cookieFile });
  };

  const origins = uniqueOrigins(inputUrl);
  let lastError: Error | null = null;

  try {
    for (const origin of origins) {
      const embedUrl = `${origin}/e/${encodeURIComponent(fileCode)}`;
      try {
        const page = await request(embedUrl, {
          referer: `${origin}/`,
          headers: {
            Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Upgrade-Insecure-Requests": "1",
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "cross-site",
            "Sec-Fetch-User": "?1",
          },
        });
        const html = page.body;

        if (!/\/pass_md5\//i.test(html)) {
          lastError = isCloudflareInterstitial(html)
            ? new Error(
                "Cloudflare challenge memblokir resolve. Coba lagi atau pastikan impit ter-deploy di Vercel.",
              )
            : new Error(softBlockedMessage(page.status));
          continue;
        }

        let playOrigin = origin;
        try {
          const final = new URL(page.url);
          playOrigin = `${final.protocol}//${final.host}`;
        } catch {
          /* keep origin */
        }

        const meta = parseEmbedMeta(html, page.status);

        const pass = await request(`${playOrigin}${meta.passPath}`, {
          referer: `${playOrigin}/e/${fileCode}`,
          headers: {
            "X-Requested-With": "XMLHttpRequest",
            Accept: "*/*",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-origin",
          },
        });

        const cdnPrefix = pass.body.trim();
        if (!cdnPrefix || !/^https?:\/\//i.test(cdnPrefix)) {
          lastError = new Error("Respons pass_md5 invalid (rate-limit / token habis). Coba lagi.");
          continue;
        }

        const rand = randomBytes(8)
          .toString("base64url")
          .replace(/[^a-zA-Z0-9]/g, "")
          .slice(0, 10)
          .padEnd(10, "A");
        const expiry = String(Date.now());
        const direct = `${cdnPrefix}${rand}?token=${encodeURIComponent(meta.token)}&expiry=${expiry}`;

        return {
          fileCode,
          direct,
          referer: `${playOrigin}/`,
          poster: meta.poster,
          title: meta.title,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
      }
    }

    throw lastError ?? new Error("Gagal resolve Doodstream");
  } finally {
    if (cookieDir) {
      try {
        rmSync(cookieDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
}

export function createStreamTicket(direct: string, referer: string): string {
  const payload = JSON.stringify({
    u: direct,
    r: referer,
    e: Math.floor(Date.now() / 1000) + streamTtl(),
  });
  const b64 = Buffer.from(payload).toString("base64url").replace(/=+$/, "");
  const sig = createHmac("sha256", streamSecret()).update(b64).digest("hex");
  return `${b64}.${sig}`;
}

export function parseStreamTicket(ticket: string): { u: string; r: string; e: number } {
  const parts = ticket.split(".");
  if (parts.length !== 2) throw new Error("Ticket stream invalid");
  const [b64, sig] = parts;
  const expect = createHmac("sha256", streamSecret()).update(b64).digest("hex");
  const a = Buffer.from(expect);
  const b = Buffer.from(sig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("Signature stream invalid");
  }

  const json = Buffer.from(b64, "base64url").toString("utf8");
  const data = JSON.parse(json) as { u?: string; r?: string; e?: number };
  if (!data?.u || !data?.r || !data?.e) throw new Error("Payload stream invalid");
  if (Number(data.e) < Math.floor(Date.now() / 1000)) {
    throw new Error("Ticket stream expired — refresh halaman");
  }
  return { u: data.u, r: data.r, e: Number(data.e) };
}
