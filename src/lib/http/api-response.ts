import { NextResponse } from "next/server";
import { ManagerAuthenticationError } from "@/lib/auth/manager-session";
import { MiniBaseError } from "@/lib/minibase/server-client";

export function apiError(error: unknown): NextResponse {
  if (error instanceof ManagerAuthenticationError) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (error instanceof MiniBaseError) {
    console.error("MiniBase request failed", { code: error.code, status: error.status });
    return NextResponse.json({ error: "backend_unavailable" }, { status: 502 });
  }
  console.error("API request failed", error);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
