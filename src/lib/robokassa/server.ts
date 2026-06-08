import { createHash } from "node:crypto";

export const RK_PREMIUM_AMOUNT = 1;
export const RK_CURRENCY = "RUB";

/** Seconds since 2024-01-01 — unique InvId that fits signed int32 until ~2092. */
export function generateInvId(): number {
  return Math.floor((Date.now() - 1704067200000) / 1000);
}

function md5upper(str: string): string {
  return createHash("md5").update(str, "utf8").digest("hex").toUpperCase();
}

function sortedShp(shpParams: Record<string, string>): string {
  return Object.entries(shpParams)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(":");
}

export function buildPaymentSignature(
  login: string,
  outSum: number,
  invId: number,
  password1: string,
  shpParams?: Record<string, string>,
): string {
  let base = `${login}:${outSum}:${invId}:${password1}`;
  if (shpParams && Object.keys(shpParams).length > 0) {
    base += `:${sortedShp(shpParams)}`;
  }
  return md5upper(base);
}

export function verifyWebhookSignature(
  outSum: string,
  invId: string,
  password2: string,
  received: string,
  shpParams?: Record<string, string>,
): boolean {
  let base = `${outSum}:${invId}:${password2}`;
  if (shpParams && Object.keys(shpParams).length > 0) {
    base += `:${sortedShp(shpParams)}`;
  }
  return md5upper(base) === received.toUpperCase();
}

export function buildPaymentUrl({
  login,
  outSum,
  invId,
  desc,
  password1,
  isTest,
  successUrl,
  failUrl,
  resultUrl,
  recurring = false,
  shpParams,
}: {
  login: string;
  outSum: number;
  invId: number;
  desc: string;
  password1: string;
  isTest: boolean;
  successUrl: string;
  failUrl: string;
  resultUrl: string;
  recurring?: boolean;
  shpParams?: Record<string, string>;
}): string {
  const sig = buildPaymentSignature(login, outSum, invId, password1, shpParams);
  const params = new URLSearchParams({
    MrchLogin: login,
    OutSum: String(outSum),
    InvId: String(invId),
    Desc: desc,
    SignatureValue: sig,
    Encoding: "utf-8",
    Culture: "ru",
    SuccessURL: successUrl,
    FailURL: failUrl,
    ResultURL: resultUrl,
    ...(isTest ? { IsTest: "1" } : {}),
    ...(recurring ? { Recurring: "true" } : {}),
    ...(shpParams ?? {}),
  });
  return `https://auth.robokassa.ru/Merchant/Index.aspx?${params.toString()}`;
}

export async function chargeByRebillId({
  login,
  password1,
  outSum,
  newInvId,
  previousInvId,
  isTest,
}: {
  login: string;
  password1: string;
  outSum: number;
  newInvId: number;
  previousInvId: number;
  isTest: boolean;
}): Promise<{ success: boolean; errorText?: string }> {
  const sig = buildPaymentSignature(login, outSum, newInvId, password1);
  const params = new URLSearchParams({
    MrchLogin: login,
    OutSum: String(outSum),
    InvId: String(newInvId),
    PreviousInvoiceID: String(previousInvId),
    SignatureValue: sig,
    ...(isTest ? { IsTest: "1" } : {}),
  });
  const resp = await fetch("https://auth.robokassa.ru/Merchant/Recurring", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  const text = await resp.text();
  if (!resp.ok || text.toLowerCase().includes("error")) {
    return { success: false, errorText: text.slice(0, 300) };
  }
  return { success: true };
}