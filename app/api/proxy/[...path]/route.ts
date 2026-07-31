import { API_BASE_URL } from "@/lib/config";
import { clearGuestTokenCache, getGuestToken } from "@/lib/guest-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forward(request: Request, pathParts: string[]) {
  const incoming = new URL(request.url);
  const target = new URL(pathParts.join("/"), `${API_BASE_URL.replace(/\/$/, "")}/`);
  incoming.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });

  const userAuth = request.headers.get("authorization");
  let bearer = userAuth;

  if (!bearer) {
    try {
      const guest = await getGuestToken();
      bearer = `Bearer ${guest}`;
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Guest session gagal. Coba login.";
      return Response.json(
        { status: "error", message },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "ngrok-skip-browser-warning": "true",
    Authorization: bearer,
  };

  const contentType = request.headers.get("content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const init: RequestInit = {
    method: request.method,
    headers,
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.text();
  }

  let upstream = await fetch(target.toString(), init);

  if (upstream.status === 401 && !userAuth) {
    clearGuestTokenCache();
    try {
      const guest = await getGuestToken();
      headers.Authorization = `Bearer ${guest}`;
      upstream = await fetch(target.toString(), { ...init, headers });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Guest session gagal. Coba login.";
      return Response.json(
        { status: "error", message },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
  }

  const body = await upstream.arrayBuffer();
  const responseHeaders = new Headers();
  const ct = upstream.headers.get("content-type");
  if (ct) responseHeaders.set("content-type", ct);
  responseHeaders.set("cache-control", "no-store");

  return new Response(body, {
    status: upstream.status,
    headers: responseHeaders,
  });
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path);
}

export async function POST(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path);
}

export async function PUT(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path);
}

export async function DELETE(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path);
}

export async function PATCH(request: Request, ctx: Ctx) {
  const { path } = await ctx.params;
  return forward(request, path);
}
