import { NextResponse } from "next/server";
import { ManagerAuthenticationError } from "@/lib/auth/manager-session";
import { MiniBaseError } from "@/lib/minibase/server-client";

export function apiError(error: unknown): NextResponse {
  if (error instanceof ManagerAuthenticationError) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (error instanceof MiniBaseError) {
    console.error("MiniBase request failed", { code: error.code, status: error.status });
    const status = error.status >= 400 && error.status < 500 ? error.status : 502;
    return NextResponse.json({ error: status === 409 ? "conflict" : "backend_unavailable" }, { status });
  }
  if (error instanceof SyntaxError) return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  console.error("API request failed", error);
  return NextResponse.json({ error: "internal_error" }, { status: 500 });
}
