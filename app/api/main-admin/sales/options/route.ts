import { adminSalesOptions } from "@/lib/sales/admin";
import { json, apiError } from "@/lib/auth/http";
export async function GET() {
  try { return json(await adminSalesOptions()); } catch (error) { return apiError(error); }
}
