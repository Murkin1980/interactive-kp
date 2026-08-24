import "server-only";

export type DataBackend = "minibase";

export function getDataBackend(): DataBackend {
  const value = process.env.DATA_BACKEND ?? "minibase";
  if (value !== "minibase") throw new Error("invalid_data_backend");
  return value;
}
