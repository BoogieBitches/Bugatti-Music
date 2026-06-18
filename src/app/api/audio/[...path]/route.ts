export const runtime = "edge";

const HF_URL = (
  process.env.AUDIO_API_URL ?? "https://bugattimusic-bugatti-audio.hf.space"
).replace(/\/$/, "");

async function proxy(req: Request, path: string[]): Promise<Response> {
  const target = `${HF_URL}/audio/${path.join("/")}`;
  const url = new URL(req.url);
  const targetUrl = target + (url.search || "");

  const headers = new Headers();
  req.headers.forEach((v, k) => {
    if (!["host", "connection"].includes(k.toLowerCase())) headers.set(k, v);
  });

  const res = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
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

export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function POST(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function PUT(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
export async function DELETE(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  return proxy(req, (await params).path);
}
