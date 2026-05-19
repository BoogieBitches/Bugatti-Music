import "server-only";

const RESEND_API = "https://api.resend.com/emails";

export async function sendAutopayDeclinedEmail(params: {
  to: string;
  locale?: string | null;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[email] RESEND_API_KEY not set — skipping declined email");
    return;
  }

  const from = process.env.RESEND_FROM ?? "Bugatti Sound <noreply@bugattisound.online>";
  const isRu = params.locale !== "en";

  const subject = isRu
    ? "Bugatti Sound: не удалось продлить Premium-подписку"
    : "Bugatti Sound: Premium renewal failed";

  const html = isRu
    ? `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#e2e2e2;background:#0c0818;padding:32px 24px;border-radius:12px">
        <h2 style="margin:0 0 16px;color:#fff">Bugatti Sound</h2>
        <p>Привет!</p>
        <p>К сожалению, нам не удалось списать платёж за продление вашей <strong>Premium-подписки</strong>. Токен привязанной карты был удалён.</p>
        <p>Чтобы продолжить пользоваться Premium — оформите подписку заново:</p>
        <a href="https://bugattisound.online/ru/pricing"
           style="display:inline-block;margin:12px 0;padding:12px 24px;background:#7a55ff;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Оформить Premium
        </a>
        <p style="color:#888;font-size:13px;margin-top:24px">Если вопросы — отвечаем на этот адрес.<br>— Команда Bugatti Sound</p>
      </div>`
    : `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#e2e2e2;background:#0c0818;padding:32px 24px;border-radius:12px">
        <h2 style="margin:0 0 16px;color:#fff">Bugatti Sound</h2>
        <p>Hi!</p>
        <p>Unfortunately, we were unable to charge your card for <strong>Premium renewal</strong>. Your saved card token has been removed.</p>
        <p>To keep enjoying Premium, please subscribe again:</p>
        <a href="https://bugattisound.online/en/pricing"
           style="display:inline-block;margin:12px 0;padding:12px 24px;background:#7a55ff;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">
          Get Premium
        </a>
        <p style="color:#888;font-size:13px;margin-top:24px">Reply to this email if you have any questions.<br>— Bugatti Sound Team</p>
      </div>`;

  const res = await fetch(RESEND_API, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [params.to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("[email] Resend error", res.status, body);
  } else {
    console.log("[email] sent autopay declined email to", params.to);
  }
}
