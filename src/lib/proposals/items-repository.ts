import "server-only";

import { MiniBaseError, MiniBaseServerClient, type MiniBaseRecord } from "@/lib/minibase/server-client";
import { getProposal, ProposalDomainError } from "@/lib/proposals/repository";
import type { Kp, KpItem, KpItemVariant, KpOptionGroup, KpOptionValue } from "@/types";
import type {
  KpItemFormData,
  KpItemUpdateData,
  KpItemVariantFormData,
  KpOptionGroupFormData,
  KpOptionValueFormData,
  KpSimpleAddOnFormData,
} from "@/lib/validation";

export { ProposalDomainError };

const MAX_ITEMS_PER_KP = 50;
const MAX_VARIANTS_PER_ITEM = 3;

export type StoredKpItem = Omit<KpItem, "id"> & {
  owner_id: string;
  variants: KpItemVariant[];
  option_groups?: KpOptionGroup[];
};

export type KpItemWithDetails = KpItem & {
  variants: KpItemVariant[];
  option_groups: KpOptionGroup[];
};

function itemsCollectionFor(ownerId: string): string {
  if (!/^[0-9a-f-]{36}$/i.test(ownerId)) throw new Error("invalid_owner_id");
  return `proposal_items_${ownerId.toLowerCase()}`;
}

function toKpItemWithDetails(record: MiniBaseRecord<StoredKpItem>): KpItemWithDetails {
  const data = record.data;
  const variants = [...(data.variants ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const optionGroups = [...(data.option_groups ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((group) => ({
      ...group,
      values: [...(group.values ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
    }));

  return {
    id: record.id,
    kp_id: data.kp_id,
    name: data.name,
    description: data.description ?? null,
    dimensions: data.dimensions ?? null,
    quantity: data.quantity ?? 1,
    image_url: data.image_url ?? null,
    sort_order: data.sort_order ?? 0,
    item_type: data.item_type ?? "wardrobe",
    original_image_url: data.original_image_url ?? null,
    sketch_image_url: data.sketch_image_url ?? null,
    variants,
    option_groups: optionGroups,
  };
}

function assertKpMutable(kp: Kp | null): void {
  if (!kp) {
    throw new ProposalDomainError(
      "proposal_not_found",
      "Коммерческое предложение не найдено или недоступно",
      404,
    );
  }
  if (kp.status === "confirmed" || kp.status === "expired") {
    throw new ProposalDomainError(
      "kp_locked",
      "КП подтверждено или просрочено и его позиции не могут быть изменены",
      409,
    );
  }
}

async function listAllOwnerItemRecords(
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<MiniBaseRecord<StoredKpItem>[]> {
  const collection = itemsCollectionFor(ownerId);
  const records: MiniBaseRecord<StoredKpItem>[] = [];
  let after: string | undefined;

  do {
    const page = await client.list<StoredKpItem>(collection, { limit: 100, after });
    for (const record of page.records) {
      if (record.data.owner_id === ownerId) {
        records.push(record);
      }
    }
    after = page.nextAfter ?? undefined;
  } while (after);

  return records;
}

async function getOwnedItemRecord(
  itemId: string,
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<MiniBaseRecord<StoredKpItem> | null> {
  try {
    const record = await client.get<StoredKpItem>(itemsCollectionFor(ownerId), itemId);
    return record.data.owner_id === ownerId ? record : null;
  } catch (error) {
    if (error instanceof MiniBaseError && error.status === 404) return null;
    throw error;
  }
}

async function ensureMutableItemRecord(
  itemId: string,
  ownerId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<MiniBaseRecord<StoredKpItem>> {
  const record = await getOwnedItemRecord(itemId, ownerId, client);
  if (!record) {
    throw new ProposalDomainError("item_not_found", "Позиция не найдена или недоступна", 404);
  }
  const kp = await getProposal(record.data.kp_id, ownerId, client);
  assertKpMutable(kp);
  return record;
}

export async function listProposalItems(
  ownerId: string,
  kpId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpItemWithDetails[]> {
  const all = await listAllOwnerItemRecords(ownerId, client);
  return all
    .filter((record) => record.data.kp_id === kpId)
    .sort((a, b) => (a.data.sort_order ?? 0) - (b.data.sort_order ?? 0) || a.id.localeCompare(b.id))
    .map(toKpItemWithDetails);
}

export async function createProposalItem(
  ownerId: string,
  kpId: string,
  input: KpItemFormData,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpItemWithDetails> {
  const kp = await getProposal(kpId, ownerId, client);
  assertKpMutable(kp);

  const existing = await listProposalItems(ownerId, kpId, client);
  if (existing.length >= MAX_ITEMS_PER_KP) {
    throw new ProposalDomainError(
      "max_items_exceeded",
      `Максимум ${MAX_ITEMS_PER_KP} позиций в КП`,
      400,
    );
  }

  const maxSortOrder = existing.length > 0 ? Math.max(...existing.map((item) => item.sort_order ?? 0)) + 1 : 0;
  const sortOrder = input.sort_order !== undefined && input.sort_order >= maxSortOrder ? input.sort_order : maxSortOrder;
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const data: StoredKpItem = {
    owner_id: ownerId,
    kp_id: kpId,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    dimensions: input.dimensions?.trim() || null,
    quantity: input.quantity ?? 1,
    image_url: null,
    sort_order: sortOrder,
    item_type: "wardrobe",
    original_image_url: null,
    sketch_image_url: null,
    variants: [],
    option_groups: [],
  };

  await client.put(itemsCollectionFor(ownerId), id, data);
  return toKpItemWithDetails({ id, data, createdAt: now, updatedAt: now });
}

export async function updateProposalItem(
  ownerId: string,
  itemId: string,
  input: KpItemUpdateData,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpItemWithDetails> {
  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const now = new Date().toISOString();

  const data: StoredKpItem = {
    ...current.data,
    name: input.name.trim(),
    description: input.description?.trim() || null,
    dimensions: input.dimensions?.trim() || null,
    quantity: input.quantity,
  };

  await client.put(itemsCollectionFor(ownerId), itemId, data);
  return toKpItemWithDetails({ id: itemId, data, createdAt: current.createdAt, updatedAt: now });
}

export async function deleteProposalItem(
  ownerId: string,
  itemId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<boolean> {
  const current = await getOwnedItemRecord(itemId, ownerId, client);
  if (!current) return false;
  const kp = await getProposal(current.data.kp_id, ownerId, client);
  assertKpMutable(kp);

  for (const mediaPath of [current.data.original_image_url || current.data.image_url, current.data.sketch_image_url]) {
    if (mediaPath && !/^https?:\/\//.test(mediaPath)) {
      try {
        await client.deleteFile(mediaPath);
      } catch {
        // Best-effort media cleanup on item deletion
      }
    }
  }

  await client.delete(itemsCollectionFor(ownerId), itemId);
  return true;
}

export async function deleteAllProposalItemsForKp(
  ownerId: string,
  kpId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<void> {
  const all = await listAllOwnerItemRecords(ownerId, client);
  const kpItems = all.filter((record) => record.data.kp_id === kpId);
  const collection = itemsCollectionFor(ownerId);

  for (const record of kpItems) {
    for (const mediaPath of [record.data.original_image_url || record.data.image_url, record.data.sketch_image_url]) {
      if (mediaPath && !/^https?:\/\//.test(mediaPath)) {
        try {
          await client.deleteFile(mediaPath);
        } catch {
          // Best-effort cleanup
        }
      }
    }
    await client.delete(collection, record.id);
  }
}

function extensionForMediaPath(path: string, contentType: string | null): string {
  const fromPath = path.split(".").pop()?.toLowerCase();
  if (fromPath && /^[a-z0-9]{1,10}$/.test(fromPath)) return fromPath;
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}

async function cloneItemMediaFile(
  sourcePath: string | null,
  targetKpId: string,
  targetItemId: string,
  kind: "original" | "sketch" | "image",
  client: MiniBaseServerClient,
): Promise<string | null> {
  if (!sourcePath || /^https?:\/\//.test(sourcePath)) return sourcePath;

  const source = await client.downloadFile(sourcePath);
  const extension = extensionForMediaPath(sourcePath, source.headers.get("content-type"));
  const targetPath = `${targetKpId}/items/${targetItemId}-${kind}-${crypto.randomUUID()}.${extension}`;
  await client.uploadFile(targetPath, await source.blob());
  return targetPath;
}

export async function cloneProposalItems(
  ownerId: string,
  sourceKpId: string,
  targetKpId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpItemWithDetails[]> {
  const sourceItems = await listProposalItems(ownerId, sourceKpId, client);
  const collection = itemsCollectionFor(ownerId);
  const now = new Date().toISOString();
  const cloned: KpItemWithDetails[] = [];

  for (const item of sourceItems) {
    const newItemId = crypto.randomUUID();
    const clonedOriginalImage = await cloneItemMediaFile(
      item.original_image_url,
      targetKpId,
      newItemId,
      "original",
      client,
    );
    const clonedSketchImage = await cloneItemMediaFile(
      item.sketch_image_url,
      targetKpId,
      newItemId,
      "sketch",
      client,
    );
    const clonedImage =
      item.image_url === item.original_image_url
        ? clonedOriginalImage
        : await cloneItemMediaFile(item.image_url, targetKpId, newItemId, "image", client);
    const clonedVariants: KpItemVariant[] = item.variants.map((variant) => ({
      ...variant,
      id: crypto.randomUUID(),
      item_id: newItemId,
    }));

    const clonedOptionGroups: KpOptionGroup[] = item.option_groups.map((group) => {
      const newGroupId = crypto.randomUUID();
      return {
        ...group,
        id: newGroupId,
        item_id: newItemId,
        values: group.values.map((val) => ({
          ...val,
          id: crypto.randomUUID(),
          group_id: newGroupId,
        })),
      };
    });

    const data: StoredKpItem = {
      owner_id: ownerId,
      kp_id: targetKpId,
      name: item.name,
      description: item.description,
      dimensions: item.dimensions,
      quantity: item.quantity,
      image_url: clonedImage,
      sort_order: item.sort_order,
      item_type: item.item_type,
      original_image_url: clonedOriginalImage,
      sketch_image_url: clonedSketchImage,
      variants: clonedVariants,
      option_groups: clonedOptionGroups,
    };

    await client.put(collection, newItemId, data);
    cloned.push(toKpItemWithDetails({ id: newItemId, data, createdAt: now, updatedAt: now }));
  }

  return cloned;
}

export async function reorderProposalItems(
  ownerId: string,
  kpId: string,
  itemIds: string[],
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpItemWithDetails[]> {
  const kp = await getProposal(kpId, ownerId, client);
  assertKpMutable(kp);

  const uniquePassed = new Set(itemIds);
  if (uniquePassed.size !== itemIds.length) {
    throw new ProposalDomainError("duplicate_item_ids", "Список содержит дубликаты позиций", 400);
  }

  const allRecords = await listAllOwnerItemRecords(ownerId, client);
  const kpRecords = allRecords.filter((r) => r.data.kp_id === kpId);

  if (itemIds.length !== kpRecords.length) {
    throw new ProposalDomainError(
      "item_count_mismatch",
      `Неверное количество позиций для перестановки (ожидалось ${kpRecords.length}, получено ${itemIds.length})`,
      400,
    );
  }

  const recordMap = new Map(kpRecords.map((r) => [r.id, r]));
  for (const id of itemIds) {
    if (!recordMap.has(id)) {
      throw new ProposalDomainError("foreign_item_id", "Некоторые позиции не принадлежат данному КП", 400);
    }
  }

  const collection = itemsCollectionFor(ownerId);
  const now = new Date().toISOString();
  const updated: KpItemWithDetails[] = [];

  for (let i = 0; i < itemIds.length; i += 1) {
    const id = itemIds[i];
    const current = recordMap.get(id)!;
    const data: StoredKpItem = {
      ...current.data,
      sort_order: i,
    };
    await client.put(collection, id, data);
    updated.push(toKpItemWithDetails({ id, data, createdAt: current.createdAt, updatedAt: now }));
  }

  return updated;
}

/* ─── Variants ─── */

export async function addProposalVariant(
  ownerId: string,
  itemId: string,
  input: KpItemVariantFormData,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<{ variant: KpItemVariant; variants: KpItemVariant[] }> {
  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const existing = [...(current.data.variants ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (existing.length >= MAX_VARIANTS_PER_ITEM) {
    throw new ProposalDomainError(
      "max_variants_exceeded",
      `Максимум ${MAX_VARIANTS_PER_ITEM} варианта на позицию`,
      400,
    );
  }

  const isDefault = existing.length === 0 ? true : Boolean(input.is_default);
  const nextSort = existing.length > 0 ? Math.max(...existing.map((v) => v.sort_order ?? 0)) + 1 : 0;

  const newVariant: KpItemVariant = {
    id: crypto.randomUUID(),
    item_id: itemId,
    name: input.name.trim(),
    material: input.material?.trim() || null,
    hardware: input.hardware?.trim() || null,
    description: input.description?.trim() || null,
    price: input.price,
    is_default: isDefault,
    sort_order: nextSort,
  };

  const nextVariants = [
    ...existing.map((v) => (isDefault ? { ...v, is_default: false } : v)),
    newVariant,
  ];

  const data: StoredKpItem = {
    ...current.data,
    variants: nextVariants,
  };

  await client.put(itemsCollectionFor(ownerId), itemId, data);
  return { variant: newVariant, variants: nextVariants };
}

export async function updateProposalVariant(
  ownerId: string,
  itemId: string,
  variantId: string,
  input: KpItemVariantFormData,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpItemVariant[]> {
  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const existing = [...(current.data.variants ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const targetIndex = existing.findIndex((v) => v.id === variantId);

  if (targetIndex === -1) {
    throw new ProposalDomainError("variant_not_found", "Вариант не найден", 404);
  }

  const makeDefault = Boolean(input.is_default);
  const nextVariants = existing.map((variant, idx) => {
    if (idx === targetIndex) {
      return {
        ...variant,
        name: input.name.trim(),
        material: input.material?.trim() || null,
        hardware: input.hardware?.trim() || null,
        description: input.description?.trim() || null,
        price: input.price,
        is_default: makeDefault ? true : variant.is_default,
      };
    }
    return makeDefault ? { ...variant, is_default: false } : variant;
  });

  const data: StoredKpItem = {
    ...current.data,
    variants: nextVariants,
  };

  await client.put(itemsCollectionFor(ownerId), itemId, data);
  return nextVariants;
}

export async function deleteProposalVariant(
  ownerId: string,
  itemId: string,
  variantId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpItemVariant[]> {
  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const existing = [...(current.data.variants ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const target = existing.find((v) => v.id === variantId);

  if (!target) {
    throw new ProposalDomainError("variant_not_found", "Вариант не найден", 404);
  }

  let remaining = existing.filter((v) => v.id !== variantId);
  if (target.is_default && remaining.length > 0) {
    remaining = remaining.map((v, idx) => (idx === 0 ? { ...v, is_default: true } : { ...v, is_default: false }));
  }

  const data: StoredKpItem = {
    ...current.data,
    variants: remaining,
  };

  await client.put(itemsCollectionFor(ownerId), itemId, data);
  return remaining;
}

export async function setDefaultProposalVariant(
  ownerId: string,
  itemId: string,
  variantId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpItemVariant[]> {
  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const existing = [...(current.data.variants ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  if (!existing.some((v) => v.id === variantId)) {
    throw new ProposalDomainError("variant_not_found", "Вариант не принадлежит данной позиции", 404);
  }

  const nextVariants = existing.map((v) => ({
    ...v,
    is_default: v.id === variantId,
  }));

  const data: StoredKpItem = {
    ...current.data,
    variants: nextVariants,
  };

  await client.put(itemsCollectionFor(ownerId), itemId, data);
  return nextVariants;
}

/* ─── Option Groups & Values ─── */

export async function listItemOptionGroups(
  ownerId: string,
  itemId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpOptionGroup[]> {
  const record = await getOwnedItemRecord(itemId, ownerId, client);
  if (!record) {
    throw new ProposalDomainError("item_not_found", "Позиция не найдена или недоступна", 404);
  }
  return toKpItemWithDetails(record).option_groups;
}

function buildOptionGroupSlug(name: string, providedSlug?: string): string {
  if (providedSlug && /^[a-z0-9][a-z0-9_-]{0,49}$/.test(providedSlug)) {
    return providedSlug;
  }
  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return `${slugBase || "option"}-${Date.now().toString(36)}`.slice(0, 50);
}

export async function addItemOptionGroup(
  ownerId: string,
  itemId: string,
  input: KpOptionGroupFormData,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<{ group: KpOptionGroup; groups: KpOptionGroup[] }> {
  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const existing = toKpItemWithDetails(current).option_groups;
  const sortOrder = input.sort_order ?? (existing.length > 0 ? Math.max(...existing.map((g) => g.sort_order ?? 0)) + 1 : 0);

  let slug = buildOptionGroupSlug(input.name.trim(), input.slug);
  if (existing.some((g) => g.slug === slug)) {
    slug = `${slug.slice(0, 40)}-${crypto.randomUUID().slice(0, 8)}`;
  }

  const newGroup: KpOptionGroup = {
    id: crypto.randomUUID(),
    item_id: itemId,
    name: input.name.trim(),
    slug,
    description: input.description?.trim() || null,
    is_required: input.is_required ?? true,
    sort_order: sortOrder,
    values: [],
  };

  const nextGroups = [...existing, newGroup].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const data: StoredKpItem = {
    ...current.data,
    option_groups: nextGroups,
  };

  await client.put(itemsCollectionFor(ownerId), itemId, data);
  return { group: newGroup, groups: nextGroups };
}

export async function addItemSimpleAddOn(
  ownerId: string,
  itemId: string,
  input: KpSimpleAddOnFormData,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<{ group: KpOptionGroup; groups: KpOptionGroup[] }> {
  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const existing = toKpItemWithDetails(current).option_groups;
  const sortOrder = existing.length > 0 ? Math.max(...existing.map((g) => g.sort_order ?? 0)) + 1 : 0;
  const groupId = crypto.randomUUID();
  const name = input.name.trim();
  const slug = `addon-${Date.now().toString(36)}-${groupId.slice(0, 6)}`.slice(0, 50);

  const values: KpOptionValue[] = [
    {
      id: crypto.randomUUID(),
      group_id: groupId,
      name: `Без ${name.toLocaleLowerCase("ru-RU")}`,
      brand: null,
      description: null,
      image_url: null,
      price_delta: 0,
      production_days_delta: 0,
      is_default: true,
      sort_order: 0,
    },
    {
      id: crypto.randomUUID(),
      group_id: groupId,
      name,
      brand: null,
      description: null,
      image_url: null,
      price_delta: input.price,
      production_days_delta: 0,
      is_default: false,
      sort_order: 1,
    },
  ];

  const newGroup: KpOptionGroup = {
    id: groupId,
    item_id: itemId,
    name,
    slug,
    description: null,
    is_required: false,
    sort_order: sortOrder,
    values,
  };

  const nextGroups = [...existing, newGroup].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const data: StoredKpItem = {
    ...current.data,
    option_groups: nextGroups,
  };

  await client.put(itemsCollectionFor(ownerId), itemId, data);
  return { group: newGroup, groups: nextGroups };
}

export async function deleteItemOptionGroup(
  ownerId: string,
  itemId: string,
  groupId: string,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpOptionGroup[]> {
  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const existing = toKpItemWithDetails(current).option_groups;
  if (!existing.some((g) => g.id === groupId)) {
    throw new ProposalDomainError("option_group_not_found", "Группа опций не найдена", 404);
  }

  const nextGroups = existing.filter((g) => g.id !== groupId);
  const data: StoredKpItem = {
    ...current.data,
    option_groups: nextGroups,
  };

  await client.put(itemsCollectionFor(ownerId), itemId, data);
  return nextGroups;
}

export async function addItemOptionValue(
  ownerId: string,
  itemId: string,
  groupId: string,
  input: KpOptionValueFormData,
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpOptionGroup[]> {
  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const existing = toKpItemWithDetails(current).option_groups;
  const groupIndex = existing.findIndex((g) => g.id === groupId);

  if (groupIndex === -1) {
    throw new ProposalDomainError("option_group_not_found", "Группа опций не найдена", 404);
  }

  const targetGroup = existing[groupIndex];
  const currentValues = [...(targetGroup.values ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  const isDefault = currentValues.length === 0 ? true : Boolean(input.is_default);
  const sortOrder = input.sort_order ?? (currentValues.length > 0 ? Math.max(...currentValues.map((v) => v.sort_order ?? 0)) + 1 : 0);

  const newValue: KpOptionValue = {
    id: crypto.randomUUID(),
    group_id: groupId,
    name: input.name.trim(),
    brand: input.brand?.trim() || null,
    description: input.description?.trim() || null,
    image_url: input.image_url?.trim() || null,
    price_delta: input.price_delta ?? 0,
    production_days_delta: input.production_days_delta ?? 0,
    is_default: isDefault,
    sort_order: sortOrder,
  };

  const nextValues = [
    ...currentValues.map((v) => (isDefault ? { ...v, is_default: false } : v)),
    newValue,
  ].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const nextGroups = existing.map((group, idx) =>
    idx === groupIndex ? { ...group, values: nextValues } : group,
  );

  const data: StoredKpItem = {
    ...current.data,
    option_groups: nextGroups,
  };

  await client.put(itemsCollectionFor(ownerId), itemId, data);
  return nextGroups;
}

/* ─── Item Media (Original & Sketch Photos) ─── */

const ALLOWED_IMAGE_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;

export async function uploadProposalItemPhoto(
  ownerId: string,
  itemId: string,
  kind: "original" | "sketch",
  file: Blob & { name?: string },
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpItemWithDetails> {
  if (!ALLOWED_IMAGE_MIME_TYPES.has(file.type)) {
    throw new ProposalDomainError("invalid_media_type", "Загрузите JPG, PNG или WebP.", 400);
  }
  if (file.size <= 0 || file.size > MAX_IMAGE_SIZE_BYTES) {
    throw new ProposalDomainError("invalid_media_size", "Файл должен быть не больше 10 МБ.", 400);
  }

  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const kp = await getProposal(current.data.kp_id, ownerId, client);
  const publicToken = kp?.public_token ?? "media";
  const rawExt = file.name?.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
  const ext = rawExt || (file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg");
  const path = `${current.data.kp_id}/${publicToken}/items/${itemId}-${kind}-${crypto.randomUUID()}.${ext}`;

  await client.uploadFile(path, file);

  const previousPath =
    kind === "original"
      ? current.data.original_image_url || current.data.image_url
      : current.data.sketch_image_url;

  const data: StoredKpItem =
    kind === "original"
      ? { ...current.data, original_image_url: path, image_url: path }
      : { ...current.data, sketch_image_url: path };

  try {
    await client.put(itemsCollectionFor(ownerId), itemId, data);
  } catch (error) {
    try {
      await client.deleteFile(path);
    } catch {
      // Best-effort rollback of uploaded file if record update fails
    }
    throw error;
  }

  if (previousPath && previousPath !== path && !/^https?:\/\//.test(previousPath)) {
    try {
      await client.deleteFile(previousPath);
    } catch {
      // Ignore cleanup failures of old media
    }
  }

  return toKpItemWithDetails({
    id: itemId,
    data,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteProposalItemPhoto(
  ownerId: string,
  itemId: string,
  kind: "original" | "sketch",
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<KpItemWithDetails> {
  const current = await ensureMutableItemRecord(itemId, ownerId, client);
  const previousPath =
    kind === "original"
      ? current.data.original_image_url || current.data.image_url
      : current.data.sketch_image_url;

  const data: StoredKpItem =
    kind === "original"
      ? { ...current.data, original_image_url: null, image_url: null }
      : { ...current.data, sketch_image_url: null };

  await client.put(itemsCollectionFor(ownerId), itemId, data);

  if (previousPath && !/^https?:\/\//.test(previousPath)) {
    try {
      await client.deleteFile(previousPath);
    } catch {
      // Ignore missing file on delete
    }
  }

  return toKpItemWithDetails({
    id: itemId,
    data,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString(),
  });
}

export async function downloadProposalItemPhoto(
  ownerId: string,
  itemId: string,
  kind: "original" | "sketch",
  client: MiniBaseServerClient = MiniBaseServerClient.fromEnvironment(),
): Promise<Response | null> {
  const current = await getOwnedItemRecord(itemId, ownerId, client);
  if (!current) return null;

  const path =
    kind === "original"
      ? current.data.original_image_url || current.data.image_url
      : current.data.sketch_image_url;

  if (!path || /^https?:\/\//.test(path)) return null;

  try {
    return await client.downloadFile(path);
  } catch (error) {
    if (error instanceof MiniBaseError && error.status === 404) return null;
    throw error;
  }
}
