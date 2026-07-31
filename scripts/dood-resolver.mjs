#!/usr/bin/env node
/**
 * Standalone Doodstream resolver for VPS / PC (not Vercel).
 *
 * Run on the same machine as your Laravel/ngrok API (where Cloudflare
 * usually does NOT challenge residential / non-AWS IPs):
 *
 *   node scripts/dood-resolver.mjs
 *   # then expose e.g. http://127.0.0.1:8787 via ngrok
 *
 * On Vercel set:
 *   DOOD_RESOLVER_URL=https://YOUR-NGROK-HOST/resolve
 */
import { createServer } from "node:http";
import { Impit } from "impit";
import { randomBytes } from "node:crypto";

const PORT = Number(process.env.PORT || 8787);
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BOOTSTRAP = [
  "https://dsvplay.com",
  "https://doodstream.com",
  "https://dood.li",
  "https://dooood.com",
  "https://playmogo.com",
];

function extractCode(input) {
  const raw = String(input || "").trim();
  if (/^[a-zA-Z0-9]{8,20}$/.test(raw)) return raw;
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const m = u.pathname.match(/\/(?:e|d|play|f)\/([a-zA-Z0-9]+)/);
    if (m) return m[1];
    const t = u.pathname.match(/\/([a-zA-Z0-9]{8,20})\/?$/);
    return t?.[1] ?? null;
  } catch {
    return null;
  }
}

function createJar() {
  const jar = new Map();
  return {
    setCookie(cookie, url) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        const [pair] = cookie.split(";");
        const eq = pair.indexOf("=");
        if (eq <= 0) return;
        if (!jar.has(host)) jar.set(host, new Map());
        jar.get(host).set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
      } catch {
        /* ignore */
      }
    },
    getCookieString(url) {
      try {
        const host = new URL(url).hostname.toLowerCase();
        const parts = [];
        for (const [h, cookies] of jar) {
          if (host === h || host.endsWith(`.${h}`)) {
            for (const [n, v] of cookies) parts.push(`${n}=${v}`);
          }
        }
        return parts.join("; ");
      } catch {
        return "";
      }
    },
  };
}

async function resolve(inputUrl) {
  const fileCode = extractCode(inputUrl);
  if (!fileCode) throw new Error("URL / file code Doodstream tidak valid");

  const client = new Impit({
    browser: "chrome",
    timeout: 45_000,
    followRedirects: true,
    maxRedirects: 8,
    cookieJar: createJar(),
  });

  let lastError = null;
  const primary = (() => {
    try {
      return new URL(/^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`).origin;
    } catch {
      return "https://dsvplay.com";
    }
  })();

  const origins = [primary, ...BOOTSTRAP].filter((v, i, a) => a.indexOf(v) === i);

  for (const origin of origins) {
    try {
      const embedUrl = `${origin}/e/${fileCode}`;
      const page = await client.fetch(embedUrl, {
        headers: { Referer: `${origin}/`, Accept: "text/html", "User-Agent": UA },
        redirect: "follow",
      });
      const html = await page.text();
      const passMatch = html.match(/(\/pass_md5\/[a-zA-Z0-9_./-]+)/);
      if (!passMatch) {
        lastError = new Error(`pass_md5 missing (HTTP ${page.status}) @ ${origin}`);
        continue;
      }
      const passPath = passMatch[1];
      const token =
        passPath.match(/\/pass_md5\/[^'"\s]+\/([a-zA-Z0-9]+)/)?.[1] ||
        html.match(/[?&]token=([a-zA-Z0-9]+)/)?.[1];
      if (!token) throw new Error("Token tidak ditemukan");

      const playOrigin = new URL(page.url || embedUrl).origin;
      const pass = await client.fetch(`${playOrigin}${passPath}`, {
        headers: {
          Referer: `${playOrigin}/e/${fileCode}`,
          "X-Requested-With": "XMLHttpRequest",
          Accept: "*/*",
        },
      });
      const cdn = (await pass.text()).trim();
      if (!/^https?:\/\//i.test(cdn)) {
        lastError = new Error("pass_md5 invalid");
        continue;
      }

      const rand = randomBytes(8)
        .toString("base64url")
        .replace(/[^a-zA-Z0-9]/g, "")
        .slice(0, 10)
        .padEnd(10, "A");
      const poster =
        html.match(/(?:og:image|twitter:image)["'\s]+content=["']([^"']+)/i)?.[1] ?? null;
      const title =
        html
          .match(/<title>([\s\S]*?)<\/title>/i)?.[1]
          ?.replace(/\s*-\s*DoodStream.*$/i, "")
          .trim() || "Doodstream";

      return {
        ok: true,
        fileCode,
        direct: `${cdn}${rand}?token=${encodeURIComponent(token)}&expiry=${Date.now()}`,
        referer: `${playOrigin}/`,
        poster,
        title,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }
  }

  throw lastError ?? new Error("Gagal resolve");
}

createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, ngrok-skip-browser-warning");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname !== "/resolve" && url.pathname !== "/") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Not found. Use /resolve?url=..." }));
    return;
  }

  const input = (url.searchParams.get("url") || "").trim();
  if (!input) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Parameter url wajib" }));
    return;
  }

  try {
    const data = await resolve(input);
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(data));
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }));
  }
}).listen(PORT, () => {
  console.log(`Dood resolver listening on http://127.0.0.1:${PORT}/resolve?url=...`);
});
