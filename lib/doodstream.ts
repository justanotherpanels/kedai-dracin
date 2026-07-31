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
import { getConfiguredProxyUrls, getPrimaryProxyUrl } from "@/lib/dood-proxy";
import { redisGetJson, redisSetJson, RedisKeys } from "@/lib/redis";

const execFileAsync = promisify(execFile);

export const DOOD_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

type ImpitBrowser = "chrome" | "chrome131" | "chrome142" | "firefox";

function streamSecret() {
  return process.env.DOOD_STREAM_SECRET || "doodplayer-change-me-in-production";
}

function streamTtl() {
  return Number(process.env.DOOD_STREAM_TTL || 7200);
}

function resolverUpstream(): string | null {
  const raw = (process.env.DOOD_RESOLVER_URL || "").trim();
  return raw || null;
}

function proxyUrl(): string | undefined {
  return getPrimaryProxyUrl();
}

function proxyUrls(): string[] {
  return getConfiguredProxyUrls();
}

function resolveCacheTtl(): number {
  return Number(process.env.DOOD_RESOLVE_CACHE_TTL || 120);
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
  cookieFile?: string;
};

export type ResolvedDood = {
  fileCode: string;
  direct: string;
  referer: string;
  poster: string | null;
  title: string;
  /** Absolute playable URL from upstream (e.g. PHP stream proxy) */
  externalSrc?: string;
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

function isVercelRuntime() {
  return Boolean(process.env.VERCEL || process.env.VERCEL_ENV);
}

function doodApiKey(): string | null {
  const raw = (
    process.env.BASE_DOODSTREAM_API ||
    process.env.DOOD_API_KEY ||
    process.env.DOODSTREAM_API_KEY ||
    ""
  ).trim();
  return raw || null;
}

function doodApiBases(): string[] {
  return ["https://doodapi.com/api", "https://doodapi.co/api"];
}

function cfBlockedError() {
  const hasUpstream = Boolean(resolverUpstream());
  const hasApi = Boolean(doodApiKey());
  if (isVercelRuntime() && !hasUpstream && !hasApi && !proxyUrl()) {
    return new Error(
      "Doodstream memblokir IP cloud. Set BASE_DOODSTREAM_API (premium aktif untuk file/direct_link) di Vercel, atau DOOD_RESOLVER_URL.",
    );
  }
  if (hasApi) {
    return new Error(
      "Scrape Doodstream diblokir. API key ada tapi file/direct_link gagal — pastikan akun Doodstream Premium masih aktif.",
    );
  }
  return new Error(
    "Cloudflare/Doodstream memblokir resolve. Set BASE_DOODSTREAM_API (premium) atau DOOD_RESOLVER_URL.",
  );
}

function softBlockedMessage(status: number) {
  if (doodApiKey()) {
    return `pass_md5 tidak ditemukan (HTTP ${status}). Coba lewat API key / pastikan Premium aktif.`;
  }
  if (isVercelRuntime() && !resolverUpstream()) {
    return cfBlockedError().message;
  }
  return `pass_md5 tidak ditemukan di halaman embed (HTTP ${status})`;
}

function extractPassMd5Path(html: string): string | null {
  // Unescape JS/JSON slash forms: \/pass_md5\/...
  const normalized = html.replace(/\\+\//g, "/");
  const match = normalized.match(/(\/pass_md5\/[a-zA-Z0-9_./-]+)/);
  return match?.[1] ?? null;
}

let cachedCurl: string | null | undefined;
let impitLoadError: string | null = null;

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

async function loadImpit() {
  try {
    const mod = await import("impit");
    return mod.Impit;
  } catch (err) {
    impitLoadError = err instanceof Error ? err.message : String(err);
    return null;
  }
}

export async function getDoodClientStatus() {
  const Impit = await loadImpit();
  let impitOk = false;
  let impitError = impitLoadError;
  if (Impit) {
    try {
      // eslint-disable-next-line no-new
      new Impit({ browser: "chrome", timeout: 5000 });
      impitOk = true;
    } catch (err) {
      impitError = err instanceof Error ? err.message : String(err);
    }
  }
  return {
    platform: process.platform,
    arch: process.arch,
    vercel: Boolean(process.env.VERCEL),
    impitOk,
    impitError,
    curl: await findCurlBinary(),
    resolverUpstream: resolverUpstream(),
    proxyConfigured: Boolean(proxyUrl()),
    proxyCount: proxyUrls().length,
    doodApiConfigured: Boolean(doodApiKey()),
  };
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
        /* ignore */
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

type ImpitLike = {
  fetch: (
    url: string,
    init?: { headers?: Record<string, string>; redirect?: string; timeout?: number },
  ) => Promise<{ text: () => Promise<string>; status: number; url: string }>;
};

async function httpRequestImpit(
  client: ImpitLike,
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
  const passPath = extractPassMd5Path(html);
  if (!passPath) {
    if (isCloudflareInterstitial(html)) throw cfBlockedError();
    throw new Error(softBlockedMessage(status));
  }

  let token: string | null = null;
  const tokenFromPath = passPath.match(/\/pass_md5\/[^'"\s]+\/([a-zA-Z0-9]+)/);
  if (tokenFromPath) token = tokenFromPath[1];
  else {
    const tokenFromHtml = html.replace(/\\+\//g, "/").match(/[?&]token=([a-zA-Z0-9]+)/);
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

async function resolveViaUpstream(inputUrl: string): Promise<ResolvedDood | null> {
  const base = resolverUpstream();
  if (!base) return null;

  const endpoint = new URL(base);
  endpoint.searchParams.set("url", inputUrl);

  const res = await fetch(endpoint.toString(), {
    headers: {
      Accept: "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(45_000),
  });

  const data = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        fileCode?: string;
        direct?: string;
        directLink?: string;
        referer?: string;
        poster?: string | null;
        title?: string;
        src?: string;
        error?: string;
      }
    | null;

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `Upstream resolver gagal (HTTP ${res.status})`);
  }

  const fileCode = data.fileCode || extractDoodFileCode(inputUrl) || "unknown";
  const direct = data.direct || data.directLink;
  const referer = data.referer;

  // Format A: direct CDN + referer (dood-resolve-api.php)
  if (direct && referer) {
    return {
      fileCode,
      direct,
      referer,
      poster: data.poster ?? null,
      title: data.title || "Doodstream",
    };
  }

  // Format B: ready-to-play src (doodplayer.php?api=resolve)
  if (data.src && /^https?:\/\//i.test(data.src)) {
    return {
      fileCode,
      direct: data.src,
      referer: referer || new URL(base).origin + "/",
      poster: data.poster ?? null,
      title: data.title || "Doodstream",
      externalSrc: data.src,
    };
  }

  throw new Error("Upstream resolver mengembalikan payload tidak lengkap");
}

async function resolveWithClient(
  request: (url: string, opts?: RequestOpts) => Promise<HttpResult>,
  inputUrl: string,
  fileCode: string,
): Promise<ResolvedDood> {
  const origins = uniqueOrigins(inputUrl);
  let lastError: Error | null = null;

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

      if (!/\/pass_md5\//i.test(html.replace(/\\+\//g, "/")) && !extractPassMd5Path(html)) {
        lastError = isCloudflareInterstitial(html)
          ? cfBlockedError()
          : new Error(softBlockedMessage(page.status));
        continue;
      }

      let playOrigin = origin;
      try {
        const final = new URL(page.url);
        playOrigin = `${final.protocol}//${final.host}`;
      } catch {
        /* keep */
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
      const direct = `${cdnPrefix}${rand}?token=${encodeURIComponent(meta.token)}&expiry=${Date.now()}`;

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
}

async function resolveViaOfficialApi(fileCode: string, inputUrl: string): Promise<ResolvedDood | null> {
  const key = doodApiKey();
  if (!key) return null;

  let lastError: Error | null = null;

  for (const base of doodApiBases()) {
    try {
      const directUrl = new URL(`${base}/file/direct_link`);
      directUrl.searchParams.set("key", key);
      directUrl.searchParams.set("file_code", fileCode);

      const res = await fetch(directUrl.toString(), {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(30_000),
      });
      const data = (await res.json().catch(() => null)) as {
        status?: number | string;
        msg?: string;
        result?:
          | string
          | {
              direct_link?: string;
              ssl_direct_link?: string;
              download_link?: string;
              protected_dl?: string;
              protected_download?: string;
            }
          | Array<{
              direct_link?: string;
              ssl_direct_link?: string;
              download_link?: string;
            }>;
      } | null;

      const statusNum = Number(data?.status);
      const msg = data?.msg || "";

      if (statusNum === 400 && /invalid operation|direct_link/i.test(msg)) {
        throw new Error(
          "Akun Doodstream tidak punya akses file/direct_link (Premium expired/nonaktif). Perpanjang Premium di doodstream.com/settings, atau API key tidak cukup.",
        );
      }

      if (!res.ok || statusNum !== 200 || !data) {
        lastError = new Error(msg || `Doodstream API gagal (HTTP ${res.status})`);
        continue;
      }

      let direct: string | null = null;
      const result = data.result;
      if (typeof result === "string" && /^https?:\/\//i.test(result)) {
        direct = result;
      } else if (Array.isArray(result) && result[0]) {
        const row = result[0];
        direct = row.ssl_direct_link || row.direct_link || row.download_link || null;
      } else if (result && typeof result === "object") {
        const row = result as {
          direct_link?: string;
          ssl_direct_link?: string;
          download_link?: string;
          protected_dl?: string;
          protected_download?: string;
        };
        direct =
          row.ssl_direct_link ||
          row.direct_link ||
          row.download_link ||
          row.protected_download ||
          row.protected_dl ||
          null;
      }

      if (!direct || !/^https?:\/\//i.test(direct)) {
        lastError = new Error("Doodstream API tidak mengembalikan direct link");
        continue;
      }

      let poster: string | null = null;
      let title = "Doodstream";
      try {
        const infoUrl = new URL(`${base}/file/info`);
        infoUrl.searchParams.set("key", key);
        infoUrl.searchParams.set("file_code", fileCode);
        const infoRes = await fetch(infoUrl.toString(), {
          headers: { Accept: "application/json" },
          cache: "no-store",
          signal: AbortSignal.timeout(20_000),
        });
        const info = (await infoRes.json().catch(() => null)) as {
          result?: Array<{ title?: string; single_img?: string; splash_img?: string }>;
        } | null;
        const row = info?.result?.[0];
        if (row?.title) title = row.title;
        poster = row?.single_img || row?.splash_img || null;
      } catch {
        /* optional */
      }

      return {
        fileCode,
        direct,
        referer: `${doodOrigin(inputUrl)}/`,
        poster,
        title,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Premium / invalid operation — don't try other base hosts for same error
      if (/Premium|direct_link|tidak punya akses/i.test(lastError.message)) {
        throw lastError;
      }
    }
  }

  throw lastError ?? new Error("Gagal resolve via Doodstream API");
}

export async function resolveDoodStream(
  inputUrl: string,
  options: { bypassCache?: boolean } = {},
): Promise<ResolvedDood> {
  const fileCode = extractDoodFileCode(inputUrl);
  if (!fileCode) {
    throw new Error("URL / file code Doodstream tidak valid");
  }

  const cacheKey = RedisKeys.doodResolve(fileCode);
  if (!options.bypassCache) {
    const cached = await redisGetJson<ResolvedDood>(cacheKey);
    if (cached?.direct && cached?.referer && cached?.fileCode) {
      return cached;
    }
  }

  let resolved: ResolvedDood | null = null;
  let apiError: Error | null = null;

  // 0) Official Doodstream API (works on Vercel when Premium unlocks file/direct_link)
  if (doodApiKey()) {
    try {
      resolved = await resolveViaOfficialApi(fileCode, inputUrl);
    } catch (err) {
      apiError = err instanceof Error ? err : new Error(String(err));
    }
  }

  // External resolver/proxy required on Vercel when API failed / missing
  if (!resolved && isVercelRuntime() && !resolverUpstream() && !proxyUrl()) {
    throw apiError ?? cfBlockedError();
  }

  // 1) External resolver (VPS / PC / hosting PHP)
  if (!resolved && resolverUpstream()) {
    try {
      const upstream = await resolveViaUpstream(inputUrl);
      if (upstream) {
        resolved = upstream;
      } else {
        resolved = await resolveLocally(inputUrl, fileCode);
      }
    } catch (err) {
      const upstreamErr = err instanceof Error ? err : new Error(String(err));
      if (isVercelRuntime()) throw apiError ?? upstreamErr;
      try {
        resolved = await resolveLocally(inputUrl, fileCode);
      } catch {
        throw apiError ?? upstreamErr;
      }
    }
  } else if (!resolved) {
    try {
      resolved = await resolveLocally(inputUrl, fileCode);
    } catch (err) {
      throw apiError ?? (err instanceof Error ? err : new Error(String(err)));
    }
  }

  if (!resolved) {
    throw apiError ?? new Error("Gagal resolve Doodstream");
  }

  const ttl = resolveCacheTtl();
  if (ttl > 0) {
    await redisSetJson(cacheKey, resolved, ttl);
  }

  return resolved;
}

async function resolveLocally(inputUrl: string, fileCode: string): Promise<ResolvedDood> {
  const Impit = await loadImpit();
  const browsers: ImpitBrowser[] = ["chrome", "chrome142", "chrome131", "firefox"];
  const proxies = proxyUrls();
  // Always try direct first on non-Vercel; on Vercel prefer proxies then direct
  const proxyAttempts: Array<string | undefined> = isVercelRuntime()
    ? [...proxies, undefined]
    : [undefined, ...proxies];
  let lastError: Error | null = null;

  if (Impit) {
    for (const proxy of proxyAttempts) {
      for (const browser of browsers) {
        try {
          const client = new Impit({
            browser,
            timeout: 45_000,
            followRedirects: true,
            maxRedirects: 8,
            cookieJar: createMemoryCookieJar(),
            ...(proxy ? { proxyUrl: proxy } : {}),
          }) as ImpitLike;

          return await resolveWithClient(
            (url, opts) => httpRequestImpit(client, url, opts),
            inputUrl,
            fileCode,
          );
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          const msg = lastError.message;
          if (!/Cloudflare|pass_md5 tidak ditemukan|Premium|direct_link/i.test(msg)) {
            // network/proxy errors → try next proxy/browser
            if (/proxy|connect|tunnel|timeout|ECONN|ENOTFOUND/i.test(msg)) continue;
            throw lastError;
          }
        }
      }
    }
  }

  const curlBin = await findCurlBinary();
  if (curlBin) {
    const cookieDir = mkdtempSync(join(tmpdir(), "doodck-"));
    const cookieFile = join(cookieDir, "cookies.txt");
    writeFileSync(cookieFile, "# Netscape HTTP Cookie File\n");
    try {
      return await resolveWithClient(
        (url, opts) => httpRequestCli(curlBin, url, { ...opts, cookieFile }),
        inputUrl,
        fileCode,
      );
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    } finally {
      try {
        rmSync(cookieDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  if (lastError) throw lastError;
  if (impitLoadError) {
    throw new Error(`Impit gagal dimuat (${impitLoadError}). Pastikan binary native ikut ter-deploy.`);
  }
  throw cfBlockedError();
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
