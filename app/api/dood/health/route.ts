import { getDoodClientStatus } from "@/lib/doodstream";
import { redisPing } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [status, redis] = await Promise.all([getDoodClientStatus(), redisPing()]);
  return Response.json(
    { ok: true, ...status, redis },
    { headers: { "Cache-Control": "no-store" } },
  );
}
