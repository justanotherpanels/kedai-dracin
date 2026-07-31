import { createStreamTicket, resolveDoodStream } from "@/lib/doodstream";

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
    const src = resolved.externalSrc
      ? resolved.externalSrc
      : `/api/dood/stream?t=${encodeURIComponent(createStreamTicket(resolved.direct, resolved.referer))}`;
    return Response.json(
      {
        ok: true,
        fileCode: resolved.fileCode,
        poster: resolved.poster,
        title: resolved.title,
        type: "video/mp4",
        src,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Gagal resolve Doodstream";
    const needsResolver =
      /DOOD_RESOLVER_URL|Vercel|pass_md5|Cloudflare|hosting/i.test(message) &&
      !process.env.DOOD_RESOLVER_URL;
    return Response.json(
      {
        ok: false,
        error: message,
        hint: needsResolver
          ? "Set BASE_DOODSTREAM_API di Vercel (butuh Premium aktif untuk file/direct_link). Premium akun Anda tercatat expired 2025-01-24."
          : undefined,
        fallback: null,
        embedUrl: null,
      },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
