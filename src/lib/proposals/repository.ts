import "server-only";

import { MiniBaseError, MiniBaseServerClient, type MiniBaseRecord } from "@/lib/minibase/server-client";
import {
  cloneProposalItems,
  deleteAllProposalItemsForKp,
  listProposalItems,
} from "@/lib/proposals/items-repository";
import type { Kp, KpApprovalSnapshot, KpStatus, DiscountType } from "@/types";
import type { KpFormData, KpUpdateData } from "@/lib/validation";

export class ProposalDomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = "ProposalDomainError";
  }
}

function collectionFor(ownerId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error("invalid_owner_id");
  return `proposals_${ownerId.toLowerCase()}`;
}

function counterCollectionFor(ownerId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error("invalid_owner_id");
  return `proposal_counters_${ownerId.toLowerCase()}`;
}

function snapshotsCollectionFor(ownerId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error("invalid_owner_id");
  return `proposal_snapshots_${ownerId.toLowerCase()}`;
}

export type StoredKp = Omit<Kp, "id"> & { owner_id: string };
export type StoredApprovalSnapshot = Omit<KpApprovalSnapshot, "id"> & { owner_id: string };

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
    current_revision: data.current_revision ?? 1,
  };
}

function toApprovalSnapshot(record: MiniBaseRecord<StoredApprovalSnapshot>): KpApprovalSnapshot {
  const data = record.data;
  return {
    id: record.id,
    kp_id: data.kp_id,
    version: data.version,
    snapshot: data.snapshot,
    total: data.total,
    advance: data.advance,
    balance: data.balance,
    confirmed_at: data.confirmed_at,
    pdf_storage_path: data.pdf_storage_path ?? null,
    pdf_generated_at: data.pdf_generated_at ?? null,
  };
}

function assertKpMutable(kp: StoredKp): void {
  if (kp.status === "confirmed" || kp.status === "expired") {
    throw new ProposalDomainError(
      "kp_locked",
      "КП подтверждено или просрочено и не может быть изменено",
      409,
    );
  }
}

async function ownedRecord(
  id: string,
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<MiniBaseRecord<StoredKp> | null> {
  try {
    const record = await client.get<StoredKp>(collectionFor(ownerId), id);
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

async function getExistingMaxKpSerial(
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<number> {
  const collection = collectionFor(ownerId);
  const prefix = `${getTodayPrefix()}-`;
  const regex = new RegExp(`^${prefix}(\\d+)$`);
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

  return maxSerial;
}

export async function listProposals(
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<Kp[]> {
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

export async function getProposal(
  id: string,
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<Kp | null> {
  const record = await ownedRecord(id, ownerId, client);
  return record ? toKp(record) : null;
}

export async function createProposal(
  ownerId: string,
  input: KpFormData,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<Kp> {
  const id = crypto.randomUUID();
  const publicToken = crypto.randomUUID();
  const now = new Date().toISOString();

  const suppliedNumber = input.number?.trim();

  const data: StoredKp = {
    owner_id: ownerId,
    number: suppliedNumber || "",
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

  if (suppliedNumber) {
    await client.put(collectionFor(ownerId), id, data);
    return toKp({ id, data, createdAt: now, updatedAt: now });
  }

  const year = new Date(now).getFullYear();
  await client.allocateSeededSequence(
    {
      counter: { collection: counterCollectionFor(ownerId), id: `kp-${year}` },
      record: { collection: collectionFor(ownerId), id, data },
      sequenceField: "number",
      prefix: `${getTodayPrefix()}-`,
      minimumDigits: 3,
      initialValue: await getExistingMaxKpSerial(ownerId, client),
    },
    id,
  );
  const created = await client.get<StoredKp>(collectionFor(ownerId), id);
  return toKp(created);
}

export async function updateProposal(
  id: string,
  ownerId: string,
  input: KpUpdateData,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<Kp | null> {
  const current = await ownedRecord(id, ownerId, client);
  if (!current) return null;
  assertKpMutable(current.data);

  const now = new Date().toISOString();
  const suppliedNumber = input.number?.trim();
  const data: StoredKp = {
    ...current.data,
    client_name: input.client_name.trim(),
    client_phone: input.client_phone?.trim() || null,
    project_name: input.project_name.trim(),
    number: suppliedNumber ? suppliedNumber : current.data.number,
    valid_until: input.valid_until?.trim() || null,
    notes: input.notes?.trim() || null,
    advance_percent: input.advance_percent,
    balance_condition: input.balance_condition?.trim() || null,
    discount_type: input.discount_type as DiscountType,
    discount_value: input.discount_value,
  };

  await client.put(collectionFor(ownerId), id, data);
  return toKp({ id, data, createdAt: current.createdAt, updatedAt: now });
}

export async function deleteProposal(
  id: string,
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<boolean> {
  const current = await ownedRecord(id, ownerId, client);
  if (!current) return false;
  if (current.data.status === "confirmed" || current.data.status === "expired") {
    throw new ProposalDomainError(
      "kp_locked",
      "КП подтверждено или просрочено и не может быть удалено",
      409,
    );
  }

  await deleteAllProposalItemsForKp(ownerId, id, client);
  await client.delete(collectionFor(ownerId), id);
  return true;
}

export async function publishProposal(
  id: string,
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<Kp | null> {
  const current = await ownedRecord(id, ownerId, client);
  if (!current) return null;
  assertKpMutable(current.data);

  const items = await listProposalItems(ownerId, id, client);
  if (items.length === 0) {
    throw new ProposalDomainError(
      "publish_empty_items",
      "Нельзя опубликовать КП без позиций",
      400,
    );
  }

  const hasItemWithoutVariants = items.some((item) => !item.variants || item.variants.length === 0);
  if (hasItemWithoutVariants) {
    throw new ProposalDomainError(
      "publish_missing_variants",
      "Каждая позиция в КП должна содержать хотя бы один вариант",
      400,
    );
  }

  const now = new Date().toISOString();
  const data: StoredKp = {
    ...current.data,
    status: "sent",
  };

  await client.put(collectionFor(ownerId), id, data);
  return toKp({ id, data, createdAt: current.createdAt, updatedAt: now });
}

export async function duplicateProposal(
  id: string,
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<Kp | null> {
  const current = await ownedRecord(id, ownerId, client);
  if (!current) return null;

  const newKp = await createProposal(
    ownerId,
    {
      client_id: current.data.client_id,
      client_name: current.data.client_name,
      client_phone: current.data.client_phone,
      project_name: current.data.project_name,
      valid_until: current.data.valid_until,
      notes: current.data.notes,
      advance_percent: current.data.advance_percent,
      balance_condition: current.data.balance_condition,
      discount_type: current.data.discount_type,
      discount_value: current.data.discount_value,
    },
    client,
  );

  await cloneProposalItems(ownerId, id, newKp.id, client);
  return newKp;
}

function computeReopenedValidUntil(existingValidUntil: string | null): string {
  const minDate = new Date();
  minDate.setUTCDate(minDate.getUTCDate() + 7);
  const minDateStr = minDate.toISOString().slice(0, 10);
  if (!existingValidUntil) return minDateStr;
  const normalizedExisting = existingValidUntil.slice(0, 10);
  return normalizedExisting > minDateStr ? normalizedExisting : minDateStr;
}

export async function reopenProposalForRevision(
  id: string,
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<Kp | null> {
  const current = await ownedRecord(id, ownerId, client);
  if (!current) return null;

  if (current.data.status !== "confirmed") {
    throw new ProposalDomainError(
      "kp_not_confirmed",
      "Открыть новую редакцию можно только для подтверждённого КП",
      409,
    );
  }

  const currentRevision = current.data.current_revision ?? 1;
  const snapshots = await listProposalApprovalSnapshots(id, ownerId, client);
  const hasSnapshotForRevision = snapshots.some((s) => s.version === currentRevision);
  if (!hasSnapshotForRevision) {
    throw new ProposalDomainError(
      "missing_revision_snapshot",
      "Отсутствует слепок согласованной редакции КП",
      409,
    );
  }

  const nextRevision = currentRevision + 1;
  const now = new Date().toISOString();
  const data: StoredKp = {
    ...current.data,
    status: "sent",
    current_revision: nextRevision,
    confirmed_at: null,
    selected_total: null,
    valid_until: computeReopenedValidUntil(current.data.valid_until),
  };

  await client.put(collectionFor(ownerId), id, data);
  return toKp({ id, data, createdAt: current.createdAt, updatedAt: now });
}

/* ─── Approval Snapshots & PDFs ─── */

export async function listProposalApprovalSnapshots(
  kpId: string,
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpApprovalSnapshot[]> {
  const kp = await ownedRecord(kpId, ownerId, client);
  if (!kp) return [];

  const collection = snapshotsCollectionFor(ownerId);
  const records: MiniBaseRecord<StoredApprovalSnapshot>[] = [];
  let after: string | undefined;

  do {
    const page = await client.list<StoredApprovalSnapshot>(collection, { limit: 100, after });
    for (const record of page.records) {
      if (record.data.owner_id === ownerId && record.data.kp_id === kpId) {
        records.push(record);
      }
    }
    after = page.nextAfter ?? undefined;
  } while (after);

  return records
    .sort((a, b) => b.data.version - a.data.version)
    .map(toApprovalSnapshot);
}

export async function downloadProposalSnapshotPdf(
  kpId: string,
  snapshotId: string,
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<{ response: Response; filename: string } | null> {
  const kp = await ownedRecord(kpId, ownerId, client);
  if (!kp) return null;

  try {
    const snapshot = await client.get<StoredApprovalSnapshot>(snapshotsCollectionFor(ownerId), snapshotId);
    if (
      snapshot.data.owner_id !== ownerId ||
      snapshot.data.kp_id !== kpId ||
      !snapshot.data.pdf_storage_path
    ) {
      return null;
    }

    const response = await client.downloadFile(snapshot.data.pdf_storage_path);
    const filename = `${kp.data.number || "KP"}-v${snapshot.data.version}.pdf`;
    return { response, filename };
  } catch (error) {
    if (error instanceof MiniBaseError && error.status === 404) return null;
    throw error;
  }
}
