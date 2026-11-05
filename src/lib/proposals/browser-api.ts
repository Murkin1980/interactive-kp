import type { Kp, KpApprovalSnapshot, KpItem, KpItemVariant, KpOptionGroup } from "@/types";
import type {
  KpFormData,
  KpItemFormData,
  KpItemUpdateData,
  KpItemVariantFormData,
  KpOptionGroupFormData,
  KpOptionValueFormData,
  KpSimpleAddOnFormData,
  KpUpdateData,
} from "@/lib/validation";

export type KpItemRecord = KpItem & {
  variants: KpItemVariant[];
  option_groups?: KpOptionGroup[];
};

async function parseApiError(response: Response, fallbackPrefix: string): Promise<never> {
  let message = `${fallbackPrefix}_${response.status}`;
  try {
    const body = (await response.json()) as {
      message?: unknown;
      error?: unknown;
      issues?: Array<{ message?: unknown }>;
    };
    if (typeof body.message === "string" && body.message.trim()) {
      message = body.message;
    } else if (Array.isArray(body.issues) && typeof body.issues[0]?.message === "string") {
      message = body.issues[0].message;
    } else if (typeof body.error === "string" && body.error.trim()) {
      message = body.error;
    }
  } catch {
    // Keep status fallback if response is not JSON.
  }
  throw new Error(message);
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!response.ok) return parseApiError(response, "proposals_api");
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function listProposals(): Promise<Kp[]> {
  return (await json<{ proposals: Kp[] }>("/api/proposals")).proposals;
}

export async function getProposal(id: string): Promise<Kp | null> {
  const response = await fetch(`/api/proposals/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) return parseApiError(response, "proposals_api");
  return ((await response.json()) as { proposal: Kp }).proposal;
}

export async function createProposal(input: KpFormData): Promise<Kp> {
  return (await json<{ proposal: Kp }>("/api/proposals", { method: "POST", body: JSON.stringify(input) })).proposal;
}

export async function updateProposal(id: string, input: KpUpdateData): Promise<Kp> {
  return (
    await json<{ proposal: Kp }>(`/api/proposals/${encodeURIComponent(id)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    })
  ).proposal;
}

export async function deleteProposal(id: string): Promise<void> {
  await json<void>(`/api/proposals/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function publishProposal(id: string): Promise<Kp> {
  return (
    await json<{ proposal: Kp }>(`/api/proposals/${encodeURIComponent(id)}/publish`, {
      method: "POST",
    })
  ).proposal;
}

export async function duplicateProposal(id: string): Promise<Kp> {
  return (
    await json<{ proposal: Kp }>(`/api/proposals/${encodeURIComponent(id)}/duplicate`, {
      method: "POST",
    })
  ).proposal;
}

export async function reopenProposalForRevision(id: string): Promise<Kp> {
  return (
    await json<{ proposal: Kp }>(`/api/proposals/${encodeURIComponent(id)}/reopen`, {
      method: "POST",
    })
  ).proposal;
}

export async function listProposalApprovalSnapshots(kpId: string): Promise<KpApprovalSnapshot[]> {
  return (
    await json<{ snapshots: KpApprovalSnapshot[] }>(
      `/api/proposals/${encodeURIComponent(kpId)}/snapshots`,
    )
  ).snapshots;
}

export async function downloadProposalSnapshotPdf(kpId: string, snapshotId: string): Promise<Blob> {
  const response = await fetch(
    `/api/proposals/${encodeURIComponent(kpId)}/snapshots/${encodeURIComponent(snapshotId)}/pdf`,
  );
  if (!response.ok) return parseApiError(response, "proposals_pdf_api");
  return response.blob();
}

/* ─── Proposal Items ─── */

export async function listProposalItems(kpId: string): Promise<KpItemRecord[]> {
  return (await json<{ items: KpItemRecord[] }>(`/api/proposals/${encodeURIComponent(kpId)}/items`)).items;
}

export async function createProposalItem(kpId: string, input: KpItemFormData): Promise<KpItemRecord> {
  return (
    await json<{ item: KpItemRecord }>(`/api/proposals/${encodeURIComponent(kpId)}/items`, {
      method: "POST",
      body: JSON.stringify(input),
    })
  ).item;
}

export async function updateProposalItem(itemId: string, input: KpItemUpdateData): Promise<KpItemRecord> {
  return (
    await json<{ item: KpItemRecord }>(`/api/proposal-items/${encodeURIComponent(itemId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    })
  ).item;
}

export async function deleteProposalItem(itemId: string): Promise<void> {
  await json<void>(`/api/proposal-items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
  });
}

export async function reorderProposalItems(kpId: string, itemIds: string[]): Promise<KpItemRecord[]> {
  return (
    await json<{ items: KpItemRecord[] }>(`/api/proposals/${encodeURIComponent(kpId)}/items/reorder`, {
      method: "POST",
      body: JSON.stringify({ item_ids: itemIds }),
    })
  ).items;
}

/* ─── Item Variants ─── */

export async function addProposalVariant(
  itemId: string,
  input: KpItemVariantFormData,
): Promise<{ variant: KpItemVariant; variants: KpItemVariant[] }> {
  return json<{ variant: KpItemVariant; variants: KpItemVariant[] }>(
    `/api/proposal-items/${encodeURIComponent(itemId)}/variants`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function updateProposalVariant(
  itemId: string,
  variantId: string,
  input: KpItemVariantFormData,
): Promise<KpItemVariant[]> {
  return (
    await json<{ variants: KpItemVariant[] }>(
      `/api/proposal-items/${encodeURIComponent(itemId)}/variants/${encodeURIComponent(variantId)}`,
      {
        method: "PUT",
        body: JSON.stringify(input),
      },
    )
  ).variants;
}

export async function deleteProposalVariant(
  itemId: string,
  variantId: string,
): Promise<KpItemVariant[]> {
  return (
    await json<{ variants: KpItemVariant[] }>(
      `/api/proposal-items/${encodeURIComponent(itemId)}/variants/${encodeURIComponent(variantId)}`,
      {
        method: "DELETE",
      },
    )
  ).variants;
}

export async function setDefaultProposalVariant(
  itemId: string,
  variantId: string,
): Promise<KpItemVariant[]> {
  return (
    await json<{ variants: KpItemVariant[] }>(
      `/api/proposal-items/${encodeURIComponent(itemId)}/variants/${encodeURIComponent(variantId)}/default`,
      {
        method: "POST",
      },
    )
  ).variants;
}

/* ─── Item Option Groups & Values ─── */

export async function listItemOptionGroups(itemId: string): Promise<KpOptionGroup[]> {
  return (
    await json<{ groups: KpOptionGroup[] }>(
      `/api/proposal-items/${encodeURIComponent(itemId)}/option-groups`,
    )
  ).groups;
}

export async function addItemOptionGroup(
  itemId: string,
  input: KpOptionGroupFormData,
): Promise<{ group: KpOptionGroup; groups: KpOptionGroup[] }> {
  return json<{ group: KpOptionGroup; groups: KpOptionGroup[] }>(
    `/api/proposal-items/${encodeURIComponent(itemId)}/option-groups`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function addItemSimpleAddOn(
  itemId: string,
  input: KpSimpleAddOnFormData,
): Promise<{ group: KpOptionGroup; groups: KpOptionGroup[] }> {
  return json<{ group: KpOptionGroup; groups: KpOptionGroup[] }>(
    `/api/proposal-items/${encodeURIComponent(itemId)}/option-groups/simple-add-on`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export async function deleteItemOptionGroup(
  itemId: string,
  groupId: string,
): Promise<KpOptionGroup[]> {
  return (
    await json<{ groups: KpOptionGroup[] }>(
      `/api/proposal-items/${encodeURIComponent(itemId)}/option-groups/${encodeURIComponent(groupId)}`,
      {
        method: "DELETE",
      },
    )
  ).groups;
}

export async function addItemOptionValue(
  itemId: string,
  groupId: string,
  input: KpOptionValueFormData,
): Promise<KpOptionGroup[]> {
  return (
    await json<{ groups: KpOptionGroup[] }>(
      `/api/proposal-items/${encodeURIComponent(itemId)}/option-groups/${encodeURIComponent(groupId)}/values`,
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    )
  ).groups;
}

/* ─── Item Media ─── */

export function getProposalItemPhotoPreviewUrl(
  itemId: string,
  kind: "original" | "sketch",
  pathOrUrl: string | null | undefined,
): string | null {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//.test(pathOrUrl)) return pathOrUrl;
  return `/api/proposal-items/${encodeURIComponent(itemId)}/media/${kind}?v=${encodeURIComponent(pathOrUrl)}`;
}

export async function uploadProposalItemPhoto(
  itemId: string,
  kind: "original" | "sketch",
  file: File,
): Promise<KpItemRecord> {
  const formData = new FormData();
  formData.set("file", file);
  return (
    await json<{ item: KpItemRecord }>(
      `/api/proposal-items/${encodeURIComponent(itemId)}/media/${kind}`,
      {
        method: "PUT",
        body: formData,
      },
    )
  ).item;
}
export async function deleteProposalItemPhoto(
  itemId: string,
  kind: "original" | "sketch",
): Promise<KpItemRecord> {
  return (
    await json<{ item: KpItemRecord }>(
      `/api/proposal-items/${encodeURIComponent(itemId)}/media/${kind}`,
      {
        method: "DELETE",
      },
    )
  ).item;
}
