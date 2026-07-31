import { redisPing, redisConfigured } from "@/lib/redis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const redis = await redisPing();
  return Response.json(
    {
      ok: redis.ok,
      redis: {
        configured: redisConfigured(),
        ...redis,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
