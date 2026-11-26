import { isAllowedOrigin } from "@/lib/auth/origin";
import { NextResponse, type NextRequest } from "next/server";
import { AccessError } from "./admin-access";
export function json(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}
export function apiError(error: unknown) {
  if (error && typeof error === "object" && "code" in error && error.code === "P2022" && "meta" in error && error.meta && typeof error.meta === "object" && "column" in error.meta && error.meta.column === "sales_records.raw_values") {
    return json({ error: "The connected database is missing sales_records.raw_values. Apply the 202611250003_preserve_csv_values SQL migration to this database.", code: "SALES_SCHEMA_OUTDATED" }, 503);
  }
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string" && /prepared statement/i.test(error.message)) return json({ error: "The database pooler needs Prisma compatibility enabled. Refresh after updating the connection configuration." }, 503);
  if (error && typeof error === "object" && "code" in error && (error.code === "P2021" || error.code === "P2022")) return json({ error: "Application storage needs its database migration. Ask your administrator to apply it." }, 503);
  return error instanceof AccessError ? json({ error: error.message }, error.status) : json({ error: "Service is unavailable. Check the database connection or retry." }, 503);
}
export async function readAdminBody(request: NextRequest) {
  if (!isAllowedOrigin(request)) throw new AccessError(403, "Request origin is not allowed.");
  if (!request.headers.get("content-type")?.includes("application/json")) throw new AccessError(415, "Send a JSON request.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 8192) { await reader.cancel(); throw new AccessError(413, "Request is too large."); }
    chunks.push(value);
  }
  let body;
  try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new AccessError(400, "Invalid JSON request."); }
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new AccessError(400, "Send an account object.");
  return body as Record<string, unknown>;
}
