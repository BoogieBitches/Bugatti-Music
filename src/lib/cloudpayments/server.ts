import "server-only";
import { env } from "@/lib/env";

export const CP_API_BASE = "https://api.cloudpayments.ru";
export const CP_CURRENCY = "RUB" as const;
export const CP_PREMIUM_AMOUNT = 499;

export interface CpApiResponse<T = unknown> {
  Success: boolean;
  Message: string | null;
  Model?: T;
}

export interface CpChargeModel {
  TransactionId: number;
  Amount: number;
  Status: string;
  Token?: string;
  AccountId?: string;
}

async function cpFetch<T>(
  path: string,
  body: Record<string, unknown>,
): Promise<CpApiResponse<T>> {
  const publicId = env.cloudpaymentsPublicId();
  const secretKey = env.cloudpaymentsSecretKey();
  const credentials = Buffer.from(`${publicId}:${secretKey}`).toString("base64");

  const res = await fetch(`${CP_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`CloudPayments API ${res.status}: ${res.statusText}`);
  }

  return res.json() as Promise<CpApiResponse<T>>;
}

export async function chargeByToken(params: {
  token: string;
  accountId: string;
  amount: number;
  description: string;
  invoiceId?: string;
  jsonData?: Record<string, string>;
}): Promise<CpApiResponse<CpChargeModel>> {
  return cpFetch<CpChargeModel>("/payments/tokens/charge", {
    Token: params.token,
    AccountId: params.accountId,
    Amount: params.amount,
    Currency: CP_CURRENCY,
    Description: params.description,
    InvoiceId: params.invoiceId ?? undefined,
    JsonData: params.jsonData ?? {},
  });
}
