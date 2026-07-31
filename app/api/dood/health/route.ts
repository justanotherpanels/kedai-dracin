import { getDoodClientStatus } from "@/lib/doodstream";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = await getDoodClientStatus();
  return Response.json(
    { ok: true, ...status },
    { headers: { "Cache-Control": "no-store" } },
  );
}
