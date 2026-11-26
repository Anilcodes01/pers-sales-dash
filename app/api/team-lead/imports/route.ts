import type { NextRequest } from "next/server";
import { salesGet, salesPost } from "@/lib/sales/handlers";
export function GET(request: NextRequest) { return salesGet(request, "team_leader"); }
export function POST(request: NextRequest) { return salesPost(request, "team_leader"); }
