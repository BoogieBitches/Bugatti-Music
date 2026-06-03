import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const isTest = process.env.ROBOKASSA_IS_TEST === "1";
  const appUrl = env.appUrl();

  return NextResponse.json({
    isTest,
    hasLogin: !!process.env.ROBOKASSA_LOGIN,
    login: process.env.ROBOKASSA_LOGIN ?? null,
    hasPassword1: !!process.env.ROBOKASSA_PASSWORD1,
    hasPassword2: !!process.env.ROBOKASSA_PASSWORD2,
    appUrl,
    resultUrl: `${appUrl}/api/robokassa/webhook`,
    successUrl: `${appUrl}/api/robokassa/success`,
    note: isTest
      ? "TEST mode — Password2 must be from 'Параметры проведения тестовых платежей' (bottom section in Robokassa ЛК)"
      : "LIVE mode — Password2 must be from the top section in Robokassa ЛК",
  });
}
