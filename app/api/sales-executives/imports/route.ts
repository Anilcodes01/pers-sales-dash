import type { NextRequest } from "next/server";
import { salesGet, salesPost } from "@/lib/sales/handlers";
export function GET(request: NextRequest) { return salesGet(request, "sales_executive"); }
export function POST(request: NextRequest) { return salesPost(request, "sales_executive"); }
