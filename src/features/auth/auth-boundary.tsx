"use client";

import type { ReactNode } from "react";

/**
 * Client boundary wrapper.
 *
 * Authentication and authorization are now enforced at the perimeter by
 * Cloudflare Access (verifying signed JWT headers on all manager API endpoints).
 * Browser-side Supabase authentication checks are completely removed.
 */
export function AuthBoundary({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
