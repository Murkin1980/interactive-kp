import "server-only";

export type DataBackend = "supabase" | "minibase";

export function getDataBackend(): DataBackend {
  const value = process.env.DATA_BACKEND ?? "supabase";
  if (value !== "supabase" && value !== "minibase") throw new Error("invalid_data_backend");
  return value;
}
