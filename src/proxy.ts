import { NextResponse, type NextRequest } from "next/server";
import { LOCALES, DEFAULT_LOCALE } from "@/i18n/config";
import { createSupabaseProxyClient } from "@/lib/supabase/proxy";

const PUBLIC_FILE = /\.(.*)$/;

function pickLocale(request: NextRequest): string {
  const cookie = request.cookies.get("NEXT_LOCALE")?.value;
  if (cookie && (LOCALES as readonly string[]).includes(cookie)) return cookie;
  const accept = request.headers.get("accept-language") ?? "";
  for (const part of accept.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (tag.startsWith("ru")) return "ru";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

const PROTECTED_PATHS = ["/upload", "/dashboard", "/admin"];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Static & API: pass through
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    PUBLIC_FILE.test(pathname)
  ) {
    return NextResponse.next();
  }

  // 1. Locale routing: /  ->  /<locale>/...
  const firstSegment = pathname.split("/")[1];
  const hasLocale = (LOCALES as readonly string[]).includes(firstSegment);
  if (!hasLocale) {
    const locale = pickLocale(request);
    const url = request.nextUrl.clone();
    url.pathname = `/${locale}${pathname === "/" ? "" : pathname}`;
    url.search = search;
    const res = NextResponse.redirect(url);
    res.cookies.set("NEXT_LOCALE", locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
    return res;
  }

  // 2. Auth refresh + access control for protected paths
  const { supabase, response, configured } = createSupabaseProxyClient(request);
  if (!configured) return response;

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  const stripped = "/" + pathname.split("/").slice(2).join("/"); // e.g. /upload
  const needsAuth = PROTECTED_PATHS.some((p) => stripped === p || stripped.startsWith(p + "/"));

  if (needsAuth && !user) {
    const url = request.nextUrl.clone();
    url.pathname = `/${firstSegment}/login`;
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
