const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:7001";

export const runtime = "nodejs";

export async function GET() {
  return Response.json({
    ok: true,
    service: "generate-proxy",
    upstream: API_BASE_URL,
  });
}

export async function POST(request: Request) {
  const upstream = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "content-type": request.headers.get("content-type") || "application/json",
      accept: request.headers.get("accept") || "text/event-stream",
    },
    body: await request.text(),
  });

  const headers = new Headers(upstream.headers);
  headers.set("cache-control", "no-cache, no-transform");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  });
}
