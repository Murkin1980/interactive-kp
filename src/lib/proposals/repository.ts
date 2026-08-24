
import "server-only";

import { MiniBaseError, MiniBaseServerClient, type MiniBaseRecord } from "@/lib/minibase/server-client";
import type { Kp, KpStatus, DiscountType } from "@/types";
import type { KpFormData } from "@/lib/validation";

function collectionFor(ownerId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error("invalid_owner_id");
  return `proposals_${ownerId.toLowerCase()}`;
}

type StoredKp = Omit<Kp, "id"> & { owner_id: string };

function toKp(record: MiniBaseRecord<StoredKp>): Kp {
  const data = record.data;
  return {
    id: record.id,
    number: data.number,
    client_id: data.client_id,
    client_name: data.client_name,
    client_phone: data.client_phone,
    project_name: data.project_name,
    created_at: data.created_at,
    valid_until: data.valid_until,
    status: data.status,
    notes: data.notes,
    advance_percent: data.advance_percent,
    balance_condition: data.balance_condition,
    discount_type: data.discount_type,
    discount_value: data.discount_value,
    public_token: data.public_token,
    confirmed_at: data.confirmed_at,
    selected_total: data.selected_total,
    current_revision: data.current_revision,
  };
}

async function ownedRecord(id: string, ownerId: string): Promise<MiniBaseRecord<StoredKp> | null> {
  try {
    const record = await MiniBaseServerClient.fromEnvironment().get<StoredKp>(collectionFor(ownerId), id);
    return record.data.owner_id === ownerId ? record : null;
  } catch (error) {
    if (error instanceof MiniBaseError && error.status === 404) return null;
    throw error;
  }
}

function getTodayPrefix(): string {
  const now = new Date();
  return `КП-${now.getFullYear()}`;
}

/**
 * Returns the next monotonically increasing serial number for the current year.
 *
 * Limitations:
 * - Not truly atomic: all records are scanned and a new record is written in a
 *   second request, so concurrent creates may produce duplicate numbers.
 * - The gap is sequential per owner, so two owners can independently receive
 *   "КП-2026-001".
 * - The fallback is used only when the collection is empty.
 */
async function getNextKpNumber(ownerId: string): Promise<string> {
  const client = MiniBaseServerClient.fromEnvironment();
  const collection = collectionFor(ownerId);
  const prefix = getTodayPrefix();
  const regex = new RegExp(`^${prefix}-(\\d+)$`);
  let maxSerial = 0;

  let after: string | undefined;
  do {
    const page = await client.list<StoredKp>(collection, { limit: 100, after });
    for (const record of page.records) {
      if (record.data.owner_id !== ownerId) continue;
      const match = record.data.number.match(regex);
      if (match) {
        const serial = parseInt(match[1], 10);
        if (!Number.isNaN(serial) && serial > maxSerial) {
          maxSerial = serial;
        }
      }
    }
    after = page.nextAfter ?? undefined;
  } while (after);

  const nextSerial = maxSerial + 1;
  return `${prefix}-${String(nextSerial).padStart(3, "0")}`;
}

export async function listProposals(ownerId: string): Promise<Kp[]> {
  const client = MiniBaseServerClient.fromEnvironment();
  const collection = collectionFor(ownerId);
  const records: MiniBaseRecord<StoredKp>[] = [];
  let after: string | undefined;

  do {
    const page = await client.list<StoredKp>(collection, { limit: 100, after });
    records.push(...page.records);
    after = page.nextAfter ?? undefined;
  } while (after);

  return records
    .filter((record) => record.data.owner_id === ownerId)
    .sort((a, b) => b.data.created_at.localeCompare(a.data.created_at))
    .map(toKp);
}

export async function getProposal(id: string, ownerId: string): Promise<Kp | null> {
  const record = await ownedRecord(id, ownerId);
  return record ? toKp(record) : null;
}

export async function createProposal(ownerId: string, input: KpFormData): Promise<Kp> {
  const id = crypto.randomUUID();
  const publicToken = crypto.randomUUID();
  const now = new Date().toISOString();

  const number = input.number?.trim() || (await getNextKpNumber(ownerId));

  const data: StoredKp = {
    owner_id: ownerId,
    number,
    client_id: input.client_id ?? null,
    client_name: input.client_name,
    client_phone: input.client_phone ?? null,
    project_name: input.project_name,
    created_at: now,
    valid_until: input.valid_until ?? null,
    status: "draft" as KpStatus,
    notes: input.notes ?? null,
    advance_percent: input.advance_percent ?? 50,
    balance_condition: input.balance_condition ?? null,
    discount_type: (input.discount_type as DiscountType) ?? "none",
    discount_value: input.discount_value ?? 0,
    public_token: publicToken,
    confirmed_at: null,
    selected_total: null,
    current_revision: 1,
  };

  await MiniBaseServerClient.fromEnvironment().put(collectionFor(ownerId), id, data);
  return toKp({ id, data, createdAt: now, updatedAt: now });
}

export async function deleteProposal(id: string, ownerId: string): Promise<boolean> {
  const current = await ownedRecord(id, ownerId);
  if (!current) return false;
  await MiniBaseServerClient.fromEnvironment().delete(collectionFor(ownerId), id);
  return true;
}
