import type { NextRequest } from "next/server";
import { adminSales } from "@/lib/sales/admin";
import { json, apiError } from "@/lib/auth/http";
export async function GET(request: NextRequest) {
  try { return json(await adminSales(request.nextUrl.searchParams)); } catch (error) { return apiError(error); }
}
