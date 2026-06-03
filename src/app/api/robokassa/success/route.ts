import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

// Robokassa POSTs to Success URL when the "Метод отсылки данных по Success URL" is set to POST.
// A 303 See Other redirect converts the browser's POST into a GET request,
// which preserves session cookies and prevents the user from being logged out.

function successRedirect(request: NextRequest) {
  const { origin, searchParams } = new URL(request.url);
  const locale = searchParams.get("locale") ?? "ru";
  return NextResponse.redirect(
    new URL(`/${locale}/dashboard?checkout=processing`, origin),
    303
  );
}

export async function GET(request: NextRequest) {
  return successRedirect(request);
}

export async function POST(request: NextRequest) {
  return successRedirect(request);
}
