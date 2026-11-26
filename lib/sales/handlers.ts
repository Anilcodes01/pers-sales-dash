import { isAllowedOrigin } from "@/lib/auth/origin";
import type { NextRequest } from "next/server";
import { AccessError } from "@/lib/auth/admin-access";
import { json, apiError } from "@/lib/auth/http";
import { MAX_FILE_BYTES, parseSalesCsv, reportingMonth } from "./csv";
import { importSales, listSales, requireSalesUser, type SalesRole } from "./service";
async function boundedForm(request: NextRequest) {
  if (!isAllowedOrigin(request)) throw new AccessError(403, "Request origin is not allowed.");
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data;")) throw new AccessError(415, "Upload a CSV using the file picker.");
  const limit = MAX_FILE_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new AccessError(413, "CSV files must be 5 MB or smaller.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Choose a CSV file.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new AccessError(413, "CSV files must be 5 MB or smaller."); }
    chunks.push(value);
  }
  try { return await new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { "Content-Type": type } }).formData(); }
  catch { throw new AccessError(400, "The upload could not be read. Choose the file again."); }
}
export async function salesGet(request: NextRequest, role: SalesRole) {
  try {
    const user = await requireSalesUser(role);
    let month: Date;
    try { month = reportingMonth(request.nextUrl.searchParams.get("month")); } catch (error) { throw new AccessError(400, (error as Error).message); }
    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new AccessError(400, "Invalid page.");
    return json(await listSales(user.id, month, page));
  } catch (error) { return apiError(error); }
}
export async function salesPost(request: NextRequest, role: SalesRole) {
  try {
    const user = await requireSalesUser(role);
    const form = await boundedForm(request);
    let month: Date;
    try { month = reportingMonth(form.get("month")); } catch (error) { throw new AccessError(400, (error as Error).message); }
    const action = form.get("action");
    if (action !== "preview" && action !== "import") throw new AccessError(400, "Choose preview or import.");
    const file = form.get("file");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) throw new AccessError(400, "Choose a .csv file.");
    if (!file.size || file.size > MAX_FILE_BYTES) throw new AccessError(413, "CSV files must contain data and be 5 MB or smaller.");
    let parsed;
    try { parsed = parseSalesCsv(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())); }
    catch (error) { throw new AccessError(400, error instanceof Error ? error.message : "Use a UTF-8 CSV file."); }
    const summary = { totalRows: parsed.totalRows, preview: parsed.rows.slice(0, 20).map(row => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "rowHash"))) };
    if (action === "preview") return json(summary);
    const result = await importSales(user.id, month, file.name.slice(0, 255), parsed.rows);
    return json(result, 201);
  } catch (error) { return apiError(error); }
}
