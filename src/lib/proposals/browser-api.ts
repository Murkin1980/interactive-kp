import type { Kp } from "@/types";
import type { KpFormData } from "@/lib/validation";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers } });
  if (!response.ok) throw new Error(`proposals_api_${response.status}`);
  return response.json() as Promise<T>;
}

export async function listProposals(): Promise<Kp[]> {
  return (await json<{ proposals: Kp[] }>("/api/proposals")).proposals;
}

export async function createProposal(input: KpFormData): Promise<Kp> {
  return (await json<{ proposal: Kp }>("/api/proposals", { method: "POST", body: JSON.stringify(input) })).proposal;
}
