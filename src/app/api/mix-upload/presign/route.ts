import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const BUCKET = "audio-tracks";
const PREFIX = "mix-temp";
const DOWNLOAD_TTL_SEC = 60 * 15; // 15 minutes — enough for analysis

export async function POST(req: NextRequest) {
  try {
    const { filename } = await req.json();
    if (!filename || typeof filename !== "string") {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }

    const ext = filename.split(".").pop()?.toLowerCase() || "mp3";
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const path = `${PREFIX}/${safeName}`;

    const admin = createSupabaseAdminClient();

    const { data: uploadData, error: uploadErr } = await admin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (uploadErr || !uploadData) {
      return NextResponse.json(
        { error: uploadErr?.message ?? "Failed to create upload URL" },
        { status: 500 }
      );
    }

    const { data: downloadData, error: downloadErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, DOWNLOAD_TTL_SEC);

    if (downloadErr || !downloadData) {
      return NextResponse.json(
        { error: downloadErr?.message ?? "Failed to create download URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      uploadUrl: uploadData.signedUrl,
      downloadUrl: downloadData.signedUrl,
      path,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
