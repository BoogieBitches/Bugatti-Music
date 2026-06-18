export const runtime = "edge";

// Analyze endpoint — routes to Railway (always warm, no cold start).
// Generation/jobs still go via /api/audio/* → HF Space.
const RAILWAY_URL = (
  process.env.ANALYZE_API_URL ??
  "https://vivacious-celebration-production-9ee8.up.railway.app"
).replace(/\/$/, "");

export async function GET(req: Request): Promise<Response> {
  return proxy(req, "GET");
}

export async function POST(req: Request): Promise<Response> {
  return proxy(req, "POST");
}

async function proxy(req: Request, method: string): Promise<Response> {
  const url = new URL(req.url);
  const target = `${RAILWAY_URL}/audio/analyze${url.search || ""}`;

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!["host", "connection"].includes(k.toLowerCase())) headers.set(k, v);
  });

  const res = await fetch(target, {
    method,
    headers,
    body: method !== "GET" && method !== "HEAD" ? req.body : undefined,
    // @ts-expect-error duplex required for streaming body
    duplex: "half",
  });

  const resHeaders = new Headers();
  res.headers.forEach((v, k) => {
    if (!["connection", "transfer-encoding"].includes(k.toLowerCase())) {
      resHeaders.set(k, v);
    }
  });

  return new Response(res.body, { status: res.status, headers: resHeaders });
}
