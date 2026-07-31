import { createClient, type RedisClientType } from "redis";

const REDIS_URL = (process.env.REDIS_URL || "").trim();

declare global {
  // eslint-disable-next-line no-var
  var __kdRedisClient: RedisClientType | undefined;
  // eslint-disable-next-line no-var
  var __kdRedisConnecting: Promise<RedisClientType | null> | undefined;
}

function createRedisClient(): RedisClientType | null {
  if (!REDIS_URL) return null;

  const client = createClient({
    url: REDIS_URL,
    socket: {
      connectTimeout: 8_000,
      reconnectStrategy(retries) {
        if (retries > 8) return false;
        return Math.min(retries * 200, 2_000);
      },
    },
  });

  client.on("error", (err) => {
    if (process.env.NODE_ENV === "development") {
      console.warn("[redis]", err.message);
    }
  });

  return client as RedisClientType;
}

/** Shared Redis client (lazy). Returns null if REDIS_URL missing / connect failed. */
export async function getRedis(): Promise<RedisClientType | null> {
  if (!REDIS_URL) return null;

  if (globalThis.__kdRedisClient?.isOpen) {
    return globalThis.__kdRedisClient;
  }

  if (!globalThis.__kdRedisConnecting) {
    globalThis.__kdRedisConnecting = (async () => {
      const client = globalThis.__kdRedisClient ?? createRedisClient();
      if (!client) return null;
      globalThis.__kdRedisClient = client;
      if (!client.isOpen) {
        await client.connect();
      }
      return client;
    })().finally(() => {
      globalThis.__kdRedisConnecting = undefined;
    });
  }

  try {
    return await globalThis.__kdRedisConnecting;
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[redis] connect failed", err);
    }
    return null;
  }
}

export function redisConfigured(): boolean {
  return Boolean(REDIS_URL);
}

export async function redisPing(): Promise<{
  ok: boolean;
  configured: boolean;
  latencyMs?: number;
  error?: string;
}> {
  if (!REDIS_URL) {
    return { ok: false, configured: false, error: "REDIS_URL tidak diset" };
  }

  const started = Date.now();
  try {
    const client = await getRedis();
    if (!client) {
      return { ok: false, configured: true, error: "Gagal connect ke Redis" };
    }
    const pong = await client.ping();
    return {
      ok: pong === "PONG",
      configured: true,
      latencyMs: Date.now() - started,
    };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  const client = await getRedis();
  if (!client) return null;
  try {
    const raw = await client.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function redisSetJson(
  key: string,
  value: unknown,
  ttlSeconds: number,
): Promise<boolean> {
  const client = await getRedis();
  if (!client) return false;
  try {
    const payload = JSON.stringify(value);
    if (ttlSeconds > 0) {
      await client.set(key, payload, { EX: Math.floor(ttlSeconds) });
    } else {
      await client.set(key, payload);
    }
    return true;
  } catch {
    return false;
  }
}

export async function redisDel(key: string): Promise<void> {
  const client = await getRedis();
  if (!client) return;
  try {
    await client.del(key);
  } catch {
    /* ignore */
  }
}

export const RedisKeys = {
  guestToken: "kd:guest:token",
  doodResolve: (fileCode: string) => `kd:dood:resolve:${fileCode}`,
} as const;
