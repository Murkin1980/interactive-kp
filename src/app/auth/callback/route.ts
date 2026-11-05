import { NextResponse } from "next/server";

/**
 * Legacy Supabase OAuth callback route.
 *
 * Authentication is now managed by Cloudflare Access. Any legacy redirects
 * hitting this route are forwarded directly to the dashboard.
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(new URL("/dashboard", origin));
}
