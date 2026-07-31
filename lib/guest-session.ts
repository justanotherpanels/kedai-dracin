import { API_BASE_URL } from "@/lib/config";
import { redisDel, redisGetJson, redisSetJson, RedisKeys } from "@/lib/redis";

const GUEST_EMAIL = process.env.GUEST_EMAIL || "guest.webapp@kedaidracin.com";
const GUEST_PASSWORD = process.env.GUEST_PASSWORD || "GuestWebApp#2026";
const GUEST_TTL_SECONDS = Number(process.env.GUEST_TOKEN_TTL || 60 * 30);

type TokenCache = {
  token: string;
  expiresAt: number;
};

let memoryCache: TokenCache | null = null;
let pending: Promise<string> | null = null;

async function authRequest(path: string, body: Record<string, unknown>) {
  const res = await fetch(`${API_BASE_URL.replace(/\/$/, "")}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const payload = (await res.json().catch(() => null)) as {
    status?: string;
    data?: { token?: string };
    message?: string;
  } | null;

  if (!res.ok || !payload?.data?.token) {
    throw new Error(payload?.message || `Guest auth gagal (${res.status})`);
  }

  return payload.data.token;
}

async function readCachedToken(): Promise<string | null> {
  if (memoryCache && memoryCache.expiresAt > Date.now()) {
    return memoryCache.token;
  }

  const fromRedis = await redisGetJson<TokenCache>(RedisKeys.guestToken);
  if (fromRedis?.token && fromRedis.expiresAt > Date.now()) {
    memoryCache = fromRedis;
    return fromRedis.token;
  }

  return null;
}

async function writeCachedToken(token: string) {
  const entry: TokenCache = {
    token,
    expiresAt: Date.now() + GUEST_TTL_SECONDS * 1000,
  };
  memoryCache = entry;
  await redisSetJson(RedisKeys.guestToken, entry, GUEST_TTL_SECONDS);
}

export async function getGuestToken(): Promise<string> {
  const cached = await readCachedToken();
  if (cached) return cached;
  if (pending) return pending;

  pending = (async () => {
    try {
      let token: string;
      try {
        token = await authRequest("/auth/login", {
          email: GUEST_EMAIL,
          password: GUEST_PASSWORD,
          device_name: "website",
        });
      } catch {
        try {
          await authRequest("/auth/register", {
            name: "Guest Viewer",
            email: GUEST_EMAIL,
            password: GUEST_PASSWORD,
            password_confirmation: GUEST_PASSWORD,
          });
        } catch {
          /* email may already exist */
        }

        token = await authRequest("/auth/login", {
          email: GUEST_EMAIL,
          password: GUEST_PASSWORD,
          device_name: "website",
        });
      }

      await writeCachedToken(token);
      return token;
    } finally {
      pending = null;
    }
  })();

  return pending;
}

export async function clearGuestTokenCache() {
  memoryCache = null;
  await redisDel(RedisKeys.guestToken);
}
