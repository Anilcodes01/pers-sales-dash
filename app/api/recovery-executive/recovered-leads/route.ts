import type { NextRequest } from "next/server";
import { recoveredLeads } from "@/lib/recovery/recovered-leads";
export async function GET(request: NextRequest) { return recoveredLeads(request, true); }
