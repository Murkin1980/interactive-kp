import "server-only";

import { MiniBaseError, MiniBaseServerClient, type MiniBaseRecord } from "@/lib/minibase/server-client";
import type { Client } from "@/types";
import type { ClientFormData } from "@/lib/validation";

const COLLECTION = "clients";

type StoredClient = Omit<Client, "id"> & { owner_id: string };

function toClient(record: MiniBaseRecord<StoredClient>): Client {
  return {
    id: record.id,
    name: record.data.name,
    phone: record.data.phone,
    email: record.data.email,
    address: record.data.address,
    notes: record.data.notes,
    created_at: record.data.created_at,
    updated_at: record.data.updated_at,
  };
}

async function ownedRecord(id: string, ownerId: string): Promise<MiniBaseRecord<StoredClient> | null> {
  try {
    const record = await MiniBaseServerClient.fromEnvironment().get<StoredClient>(COLLECTION, id);
    return record.data.owner_id === ownerId ? record : null;
  } catch (error) {
    if (error instanceof MiniBaseError && error.status === 404) return null;
    throw error;
  }
}

export async function listClients(ownerId: string): Promise<Client[]> {
  const client = MiniBaseServerClient.fromEnvironment();
  const records: MiniBaseRecord<StoredClient>[] = [];
  let after: string | undefined;

  do {
    const page = await client.list<StoredClient>(COLLECTION, { limit: 100, after });
    records.push(...page.records);
    after = page.nextAfter ?? undefined;
  } while (after);

  return records
    .filter((record) => record.data.owner_id === ownerId)
    .sort((a, b) => b.data.created_at.localeCompare(a.data.created_at))
    .map(toClient);
}

export async function getClient(id: string, ownerId: string): Promise<Client | null> {
  const record = await ownedRecord(id, ownerId);
  return record ? toClient(record) : null;
}

export async function createClient(ownerId: string, input: ClientFormData): Promise<Client> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const data: StoredClient = {
    owner_id: ownerId,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    created_at: now,
    updated_at: now,
  };
  await MiniBaseServerClient.fromEnvironment().put(COLLECTION, id, data);
  return toClient({ id, data, createdAt: now, updatedAt: now });
}

export async function updateClient(id: string, ownerId: string, input: ClientFormData): Promise<Client | null> {
  const current = await ownedRecord(id, ownerId);
  if (!current) return null;

  const data: StoredClient = {
    ...current.data,
    name: input.name,
    phone: input.phone ?? null,
    email: input.email ?? null,
    address: input.address ?? null,
    notes: input.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  await MiniBaseServerClient.fromEnvironment().put(COLLECTION, id, data);
  return toClient({ id, data, createdAt: current.createdAt, updatedAt: data.updated_at });
}

export async function deleteClient(id: string, ownerId: string): Promise<boolean> {
  const current = await ownedRecord(id, ownerId);
  if (!current) return false;
  await MiniBaseServerClient.fromEnvironment().delete(COLLECTION, id);
  return true;
}
