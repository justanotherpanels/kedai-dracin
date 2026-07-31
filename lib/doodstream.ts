import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { execFile } from "child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { promisify } from "util";
import { doodOrigin, extractDoodFileCode } from "@/lib/dood-detect";

const execFileAsync = promisify(execFile);

export const DOOD_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

async function findCurlBinary(): Promise<string | null> {
  const candidates =
    process.platform === "win32"
      ? ["C:\\Windows\\System32\\curl.exe", "curl.exe"]
      : ["curl"];

  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ["--version"], { timeout: 5000, windowsHide: true });
      return bin;
    } catch {
      /* try next */
    }
  }
  return null;
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
    const lines = stdout.toString().trim().split("\n");
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

async function httpRequestFetch(
  url: string,
  opts: {
    referer?: string;
    headers?: string[];
    timeout?: number;
  } = {},
): Promise<HttpResult> {
  const headers = new Headers({
    "User-Agent": DOOD_UA,
    Accept: "*/*",
  });
  if (opts.referer) headers.set("Referer", opts.referer);
  for (const line of opts.headers ?? []) {
    const idx = line.indexOf(":");
    if (idx > 0) headers.set(line.slice(0, idx).trim(), line.slice(idx + 1).trim());
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), (opts.timeout ?? 30) * 1000);
  try {
    const res = await fetch(url, {
      headers,
      redirect: "follow",
      signal: controller.signal,
    });
    const body = await res.text();
    return { body, status: res.status, url: res.url };
  } finally {
    clearTimeout(timer);
  }
}

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
  if (bin) return httpRequestCli(bin, url, opts);
  return httpRequestFetch(url, opts);
}

export type ResolvedDood = {
  fileCode: string;
  direct: string;
  referer: string;
  poster: string | null;
  title: string;
};

export async function resolveDoodStream(inputUrl: string): Promise<ResolvedDood> {
  const fileCode = extractDoodFileCode(inputUrl);
  if (!fileCode) {
    throw new Error("URL / file code Doodstream tidak valid");
  }

  const origin = doodOrigin(inputUrl);
  const embedUrl = `${origin}/e/${encodeURIComponent(fileCode)}`;
  const cookieDir = mkdtempSync(join(tmpdir(), "doodck-"));
  const cookieFile = join(cookieDir, "cookies.txt");
  writeFileSync(cookieFile, "");

  try {
    const page = await httpRequest(embedUrl, {
      referer: `${origin}/`,
      cookieFile,
      headers: ["Accept: text/html"],
    });
    const html = page.body;
    let playOrigin = origin;
    try {
      const final = new URL(page.url);
      playOrigin = `${final.protocol}//${final.host}`;
    } catch {
      /* keep origin */
    }

    const passMatch = html.match(/(\/pass_md5\/[a-zA-Z0-9_./-]+)/);
    if (!passMatch) {
      if (/Just a moment|cf-turnstile|challenge-platform/i.test(html)) {
        throw new Error(
          "Cloudflare memblokir resolve. Pastikan curl.exe tersedia di PATH (Windows).",
        );
      }
      throw new Error(`pass_md5 tidak ditemukan di halaman embed (HTTP ${page.status})`);
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

    const pass = await httpRequest(`${playOrigin}${passPath}`, {
      referer: `${playOrigin}/e/${fileCode}`,
      cookieFile,
      headers: ["X-Requested-With: XMLHttpRequest", "Accept: */*"],
    });

    const cdnPrefix = pass.body.trim();
    if (!cdnPrefix || !/^https?:\/\//i.test(cdnPrefix)) {
      throw new Error("Respons pass_md5 invalid (rate-limit / token habis). Coba lagi.");
    }

    const rand = randomBytes(8)
      .toString("base64url")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 10)
      .padEnd(10, "A");
    const expiry = String(Date.now());
    const direct = `${cdnPrefix}${rand}?token=${encodeURIComponent(token)}&expiry=${expiry}`;

    return {
      fileCode,
      direct,
      referer: `${playOrigin}/`,
      poster,
      title,
    };
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
