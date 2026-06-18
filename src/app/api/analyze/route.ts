export const runtime = "edge";

const HF_URL =
  (process.env.AUDIO_API_URL ?? "https://bugattimusic-bugatti-audio.hf.space").replace(/\/$/, "");

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const res = await fetch(`${HF_URL}/audio/analyze`, {
      method: "POST",
      body: form,
    });
    const data = await res.json();
    return new Response(JSON.stringify(data), {
      status: res.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ detail: e instanceof Error ? e.message : "Proxy error" }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}
