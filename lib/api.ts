import { API_BASE_URL } from "@/lib/config";
import type { ApiError, ApiSuccess } from "@/lib/types";

type RequestOptions = {
  method?: string;
  body?: unknown;
  token?: string | null;
  query?: Record<string, string | number | undefined | null>;
  /** Force guest proxy (for play without user login) */
  useGuestProxy?: boolean;
};

export class ApiRequestError extends Error {
  code?: string;
  data?: Record<string, unknown>;
  status: number;

  constructor(message: string, status: number, code?: string, data?: Record<string, unknown>) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.data = data;
  }
}

function buildUrl(
  path: string,
  query?: RequestOptions["query"],
  useGuestProxy?: boolean,
) {
  const normalized = path.replace(/^\//, "");
  const needsProxy =
    useGuestProxy ||
    (typeof window !== "undefined" &&
      !useGuestProxy &&
      // play unlock without going through browser CORS + inject guest when needed
      false);

  const base =
    typeof window !== "undefined" && (useGuestProxy || needsProxy)
      ? `${window.location.origin}/api/proxy/`
      : `${API_BASE_URL.replace(/\/$/, "")}/`;

  const url = new URL(normalized, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiSuccess<T>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "ngrok-skip-browser-warning": "true",
  };

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  // Play tanpa login: pakai proxy agar server inject guest token
  const isPlayUnlock =
    /^\/?play\/drama\/\d+\/episode\/\d+$/i.test(path.replace(/^\//, "")) &&
    (options.method ?? (options.body !== undefined ? "POST" : "GET")).toUpperCase() === "POST";

  const useGuestProxy =
    options.useGuestProxy ||
    (typeof window !== "undefined" && isPlayUnlock && !options.token);

  if (options.token) {
    headers.Authorization = `Bearer ${options.token}`;
  }

  const response = await fetch(buildUrl(path, options.query, useGuestProxy), {
    method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    cache: "no-store",
  });

  let payload: ApiSuccess<T> | ApiError | null = null;
  try {
    payload = (await response.json()) as ApiSuccess<T> | ApiError;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.status === "error") {
    const errorPayload = payload as ApiError | null;
    const message =
      errorPayload?.message ??
      (response.status === 401
        ? "Sesi tidak valid. Coba refresh atau masuk akun."
        : `Request gagal (${response.status})`);
    throw new ApiRequestError(message, response.status, errorPayload?.code, errorPayload?.data);
  }

  return payload;
}
