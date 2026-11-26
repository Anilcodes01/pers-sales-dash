import type { NextRequest } from "next/server";
import { recoveryStatistics } from "@/lib/recovery/statistics";
export async function GET(request: NextRequest) { return recoveryStatistics(request, true); }
