import type { NextRequest } from "next/server";
import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth/session";
import { AccessError } from "@/lib/auth/admin-access";
import { boundedForm } from "@/lib/auth/upload";
import { json, apiError } from "@/lib/auth/http";
import { db } from "@/lib/db";
import { parseRecoveryCsv } from "@/lib/recovery/csv";
import { pagedSnapshot } from "@/lib/recovery/paged-sync";
import { invalidateRecoveryCache } from "@/lib/recovery/cache";
async function requireRecoveryAdmin() {
  const user = await currentUser();
  if (!user) throw new AccessError(401, "Sign in to continue.");
  if (user.app_metadata.role !== "recovery_admin") throw new AccessError(403, "Only recovery admins can access recovery leads.");
  return user;
}
export async function GET(request: NextRequest) {
  try {
    await requireRecoveryAdmin();
    const page = Number(request.nextUrl.searchParams.get("page") || 1);
    if (!Number.isInteger(page) || page < 1 || page > 100000) throw new AccessError(400, "Invalid page.");
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor !== null && !/^\d{1,19}$/.test(cursor)) throw new AccessError(400, "Invalid sync cursor.");
    return json(await pagedSnapshot(db(), {}, page, cursor, undefined, "createdAt"));
  } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const user = await requireRecoveryAdmin();
    const form = await boundedForm(request);
    const file = form.get("file");
    const action = form.get("action");
    if (action !== "preview" && action !== "import") throw new AccessError(400, "Choose preview or import.");
    if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) throw new AccessError(400, "Choose a .csv file.");
    if (!file.size || file.size > 5 * 1024 * 1024) throw new AccessError(413, "Choose a nonempty CSV file up to 5 MB.");
    let rows;
    try { rows = parseRecoveryCsv(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer())); }
    catch (error) { throw new AccessError(400, error instanceof Error ? error.message : "Use a UTF-8 CSV file."); }
    if (action === "preview") return json({ totalRows: rows.length, preview: rows.slice(0, 20) });
    const uploadId = randomUUID();
    await db().$transaction(async tx => {
      for (let index = 0; index < rows.length; index += 500) {
        await tx.recoveryLead.createMany({ data: rows.slice(index, index + 500).map(row => ({ ...row, uploadedBy: user.id, uploadId, filename: file.name.slice(0, 255) })) });
      }
    }, { timeout: 30000 });
    invalidateRecoveryCache("months:");
    invalidateRecoveryCache("statistics:");
    return json({ imported: rows.length, uploadId }, 201);
  } catch (error) { return apiError(error); }
}
