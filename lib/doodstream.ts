import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { execFile } from "child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import {
  DOOD_BOOTSTRAP_ORIGINS,
  doodOrigin,
  extractDoodFileCode,
} from "@/lib/dood-detect";

const execFileAsync = promisify(execFile);

export const DOOD_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BROWSER_HEADERS = [
  "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language: en-US,en;q=0.9,id;q=0.8",
  "Cache-Control: no-cache",
  "Pragma: no-cache",
  "Upgrade-Insecure-Requests: 1",
  'sec-ch-ua: "Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile: ?0",
  'sec-ch-ua-platform: "Windows"',
  "Sec-Fetch-Dest: document",
  "Sec-Fetch-Mode: navigate",
  "Sec-Fetch-Site: cross-site",
  "Sec-Fetch-User: ?1",
];

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
    if (bin.includes("\\") || bin.includes("/")) {
      if (!existsSync(bin)) continue;
    }
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

function requireCurlMessage() {
  if (process.platform === "win32") {
    return "Cloudflare memblokir resolve. Pastikan curl.exe tersedia di PATH (Windows), misalnya C:\\Windows\\System32\\curl.exe.";
  }
  return "Cloudflare memblokir resolve. Install curl CLI agar fingerprint TLS lolos challenge.";
}

function isCloudflareInterstitial(html: string): boolean {
  return (
    /<title[^>]*>\s*Just a moment/i.test(html) ||
    /cf-browser-verification|cf-challenge-running|Attention Required!|Enable JavaScript and cookies to continue/i.test(
      html,
    ) ||
    (/cf-turnstile/i.test(html) && !/\/pass_md5\//i.test(html))
  );
}

async function httpRequestCli(
  bin: string,
  url: string,
  opts: {
    referer?: string;
    cookieFile?: string;
    headers?: string[];
    timeout?: number;
  } = {},
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
  for (const header of opts.headers ?? []) args.push("-H", header);
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
    const status = Number(lines[0] || 0);
    const finalUrl = lines[1] || url;
    const body = readFileSync(bodyFile, "utf8");
    return { body, status, url: finalUrl };
  } finally {
    try {
      rmSync(bodyDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/**
 * curl CLI needed to bypass Cloudflare TLS fingerprint.
 * Node fetch / undici almost always gets the interstitial.
 */
async function httpRequest(
  url: string,
  opts: {
    referer?: string;
    cookieFile?: string;
    headers?: string[];
    timeout?: number;
  } = {},
): Promise<HttpResult> {
  const bin = await findCurlBinary();
  if (!bin) {
    throw new Error(requireCurlMessage());
  }
  return httpRequestCli(bin, url, opts);
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

function parseEmbedMeta(html: string): {
  passPath: string;
  token: string;
  poster: string | null;
  title: string;
} {
  const passMatch = html.match(/(\/pass_md5\/[a-zA-Z0-9_./-]+)/);
  if (!passMatch) {
    if (isCloudflareInterstitial(html)) {
      throw new Error(requireCurlMessage());
    }
    throw new Error("pass_md5 tidak ditemukan di halaman embed");
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

  // Ensure curl is present before doing network work
  if (!(await findCurlBinary())) {
    throw new Error(requireCurlMessage());
  }

  const cookieDir = mkdtempSync(join(tmpdir(), "doodck-"));
  const cookieFile = join(cookieDir, "cookies.txt");
  writeFileSync(cookieFile, "# Netscape HTTP Cookie File\n");

  const origins = uniqueOrigins(inputUrl);
  let lastError: Error | null = null;

  try {
    for (const origin of origins) {
      const embedUrl = `${origin}/e/${encodeURIComponent(fileCode)}`;
      try {
        const page = await httpRequest(embedUrl, {
          referer: `${origin}/`,
          cookieFile,
          headers: [...BROWSER_HEADERS, "Accept: text/html"],
        });
        const html = page.body;

        if (!/\/pass_md5\//i.test(html)) {
          if (isCloudflareInterstitial(html)) {
            lastError = new Error(requireCurlMessage());
            continue;
          }
          lastError = new Error(`pass_md5 tidak ditemukan di halaman embed (HTTP ${page.status})`);
          continue;
        }

        let playOrigin = origin;
        try {
          const final = new URL(page.url);
          playOrigin = `${final.protocol}//${final.host}`;
        } catch {
          /* keep origin */
        }

        const meta = parseEmbedMeta(html);

        const pass = await httpRequest(`${playOrigin}${meta.passPath}`, {
          referer: `${playOrigin}/e/${fileCode}`,
          cookieFile,
          headers: [
            "X-Requested-With: XMLHttpRequest",
            "Accept: */*",
            "Accept-Language: en-US,en;q=0.9",
            "Sec-Fetch-Dest: empty",
            "Sec-Fetch-Mode: cors",
            "Sec-Fetch-Site: same-origin",
          ],
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
    try {
      rmSync(cookieDir, { recursive: true, force: true });
    } catch {
      /* ignore */
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
