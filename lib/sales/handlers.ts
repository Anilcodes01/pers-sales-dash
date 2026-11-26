import { boundedForm } from "@/lib/auth/upload";
import type { NextRequest } from "next/server";
import { AccessError } from "@/lib/auth/admin-access";
import { json, apiError } from "@/lib/auth/http";
import { MAX_FILE_BYTES, parseSalesCsv, reportingMonth } from "./csv";
import { importSales, listSales, requireSalesUser, type SalesRole } from "./service";
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
