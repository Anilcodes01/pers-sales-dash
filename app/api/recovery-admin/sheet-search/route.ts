import type { NextRequest } from "next/server";
import { sheetSearch } from "@/lib/recovery/sheet-search";
export async function GET(request: NextRequest) { return sheetSearch(request, false); }
