import { DOOD_UA, parseStreamTicket } from "@/lib/doodstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FORWARD_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "etag",
  "last-modified",
  "cache-control",
] as const;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ticket = searchParams.get("t") ?? "";

  let data: { u: string; r: string };
  try {
    data = parseStreamTicket(ticket);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Ticket invalid";
    return new Response(message, { status: 403, headers: { "Content-Type": "text/plain" } });
  }

  const range = request.headers.get("range");
  const upstreamHeaders: Record<string, string> = {
    "User-Agent": DOOD_UA,
    Accept: "*/*",
    Referer: data.r,
    Connection: "close",
  };
  if (range) upstreamHeaders.Range = range;

  try {
    const upstream = await fetch(data.u, {
      headers: upstreamHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      const text = await upstream.text().catch(() => "");
      return new Response(text || `Upstream error ${upstream.status}`, {
        status: 502,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const headers = new Headers();
    for (const name of FORWARD_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has("content-type")) headers.set("Content-Type", "video/mp4");
    if (!headers.has("accept-ranges")) headers.set("Accept-Ranges", "bytes");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Cache-Control", "no-store");

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal proxy stream";
    return new Response(`Gagal proxy stream: ${message}`, {
      status: 502,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
