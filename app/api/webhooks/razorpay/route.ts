import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { verifyWebhook, handlePaymentWebhook, WebhookError } from "@/lib/recovery/payment-webhook.mjs";
export async function POST(request: NextRequest) {
  try {
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Webhook body is required." }, 400);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 262144) { await reader.cancel(); return json({ error: "Webhook body is too large." }, 413); }
      chunks.push(value);
    }
    const raw = Buffer.concat(chunks);
    verifyWebhook(raw, request.headers.get("x-razorpay-signature"), process.env.RAZORPAY_WEBHOOK_SECRET);
    return json(await handlePaymentWebhook(db(), raw, request.headers.get("x-razorpay-event-id")));
  } catch (error) {
    if (error instanceof WebhookError) return json({ error: error.message }, error.status);
    return apiError(error);
  }
}
