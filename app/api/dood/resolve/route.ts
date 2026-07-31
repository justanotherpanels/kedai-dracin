import { createStreamTicket, resolveDoodStream } from "@/lib/doodstream";
import { toDoodEmbedUrl } from "@/lib/dood-detect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = (searchParams.get("url") ?? "").trim();
  const bypassCache =
    searchParams.get("fresh") === "1" || searchParams.get("nocache") === "1";

  if (!url) {
    return Response.json({ ok: false, error: "Parameter url wajib diisi." }, { status: 400 });
  }

  try {
    const resolved = await resolveDoodStream(url, { bypassCache });
    const ticket = createStreamTicket(resolved.direct, resolved.referer);
    return Response.json(
      {
        ok: true,
        fileCode: resolved.fileCode,
        poster: resolved.poster,
        title: resolved.title,
        type: "video/mp4",
        src: `/api/dood/stream?t=${encodeURIComponent(ticket)}`,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal resolve Doodstream";
    const embedUrl = toDoodEmbedUrl(url);
    return Response.json(
      {
        ok: false,
        error: message,
        fallback: embedUrl ? "embed" : null,
        embedUrl,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
