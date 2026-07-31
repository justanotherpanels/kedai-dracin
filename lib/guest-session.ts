import { API_BASE_URL } from "@/lib/config";

const GUEST_EMAIL = process.env.GUEST_EMAIL || "guest.web@kedaidracin.com";
const GUEST_PASSWORD = process.env.GUEST_PASSWORD || "GuestWebApp#2026";

type TokenCache = {
  token: string;
  expiresAt: number;
};

let cache: TokenCache | null = null;
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

export async function getGuestToken(): Promise<string> {
  if (cache && cache.expiresAt > Date.now()) return cache.token;
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
        await authRequest("/auth/register", {
          name: "Guest Viewer",
          email: GUEST_EMAIL,
          password: GUEST_PASSWORD,
          password_confirmation: GUEST_PASSWORD,
        }).catch(() => null);

        token = await authRequest("/auth/login", {
          email: GUEST_EMAIL,
          password: GUEST_PASSWORD,
        device_name: "website",
        });
      }

      cache = {
        token,
        // refresh periodically; sanctum tokens usually don't expire soon
        expiresAt: Date.now() + 1000 * 60 * 30,
      };
      return token;
    } finally {
      pending = null;
    }
  })();

  return pending;
}

export function clearGuestTokenCache() {
  cache = null;
}
