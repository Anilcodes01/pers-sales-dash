import { db } from "@/lib/db";
import { json, apiError } from "@/lib/auth/http";
import { requireRecoveryRole } from "@/lib/recovery/allocation";
import type { NextRequest } from "next/server";
import { sheetSnapshot } from "@/lib/recovery/sheet-sync";
export async function GET(request: NextRequest) {
  try {
    const user = await requireRecoveryRole("recovery_executive");
    const cursor = request.nextUrl.searchParams.get("cursor");
    if (cursor !== null && !/^\d{1,19}$/.test(cursor)) return json({ error: "Invalid sync cursor." }, 400);
    const snapshot = await sheetSnapshot(db(), null, cursor, user.id);
    return json({ ...snapshot, ...(snapshot.reset ? { total: snapshot.records.length } : {}) });
  } catch (error) { return apiError(error); }
}
