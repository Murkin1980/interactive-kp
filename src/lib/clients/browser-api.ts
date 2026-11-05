import type { Client } from "@/types";
import type { ClientFormData } from "@/lib/validation";

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { "content-type": "application/json" } : {}), ...init?.headers },
  });
  if (!response.ok) throw new Error(`clients_api_${response.status}`);
  return response.json() as Promise<T>;
}

export async function listClients(): Promise<Client[]> {
  return (await requestJson<{ clients: Client[] }>("/api/clients")).clients;
}

export async function getClient(id: string): Promise<Client> {
  return (await requestJson<{ client: Client }>(`/api/clients/${encodeURIComponent(id)}`)).client;
}

export async function createClient(input: ClientFormData): Promise<Client> {
  return (await requestJson<{ client: Client }>("/api/clients", { method: "POST", body: JSON.stringify(input) })).client;
}

export async function updateClient(id: string, input: ClientFormData): Promise<Client> {
  return (await requestJson<{ client: Client }>(`/api/clients/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(input) })).client;
}

export async function deleteClient(id: string): Promise<void> {
  const response = await fetch(`/api/clients/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`clients_api_${response.status}`);
}
