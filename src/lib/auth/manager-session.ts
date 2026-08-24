import "server-only";

import { createClient } from "@/lib/supabase/server";

export class ManagerAuthenticationError extends Error {
  constructor() {
    super("manager_authentication_required");
    this.name = "ManagerAuthenticationError";
  }
}

/**
 * Transitional authentication boundary.
 *
 * Data already lives in MiniBase. Supabase is used here only to verify the
 * existing manager session until Cloudflare Access (or MiniBase native auth)
 * is enabled. Keeping this in one server-only module makes the final auth
 * cutover isolated and prevents browser code from talking to either backend.
 */
export async function requireManagerId(): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ManagerAuthenticationError();
  return data.user.id;
}
