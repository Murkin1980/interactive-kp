import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MiniBaseServerClient } from "../minibase/server-client";
import {
  ProposalDomainError,
  addItemOptionGroup,
  addItemOptionValue,
  addItemSimpleAddOn,
  addProposalVariant,
  createProposalItem,
  deleteItemOptionGroup,
  deleteProposalItem,
  deleteProposalItemPhoto,
  deleteProposalVariant,
  downloadProposalItemPhoto,
  listItemOptionGroups,
  listProposalItems,
  reorderProposalItems,
  setDefaultProposalVariant,
  updateProposalItem,
  updateProposalVariant,
  uploadProposalItemPhoto,
} from "./items-repository";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const KP_1 = "33333333-3333-4333-8333-333333333333";

function createInMemoryMiniBase() {
  const collections = new Map<string, Map<string, { id: string; data: Record<string, unknown>; createdAt: string; updatedAt: string }>>();
  const files = new Map<string, { body: Blob; contentType: string }>();
  const now = new Date().toISOString();
  const proposals = new Map<string, { id: string; data: Record<string, unknown>; createdAt: string; updatedAt: string }>();
  proposals.set(KP_1, {
    id: KP_1,
    data: {
      owner_id: OWNER_A,
      number: "КП-2026-001",
      client_id: null,
      client_name: "Клиент",
      client_phone: null,
      project_name: "Проект",
      created_at: now,
      valid_until: null,
      status: "draft",
      notes: null,
      advance_percent: 50,
      balance_condition: null,
      discount_type: "none",
      discount_value: 0,
      public_token: "44444444-4444-4444-8444-444444444444",
      confirmed_at: null,
      selected_total: null,
      current_revision: 1,
    },
    createdAt: now,
    updatedAt: now,
  });
  collections.set(`proposals_${OWNER_A}`, proposals);

  process.env.MINIBASE_URL = "http://localhost:8787";
  process.env.MINIBASE_SECRET_KEY = "mb_secret_test_key_for_unit_tests";

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = (init?.method || "GET").toUpperCase();

    if (url.pathname.startsWith("/v1/data/")) {
      const parts = url.pathname.slice("/v1/data/".length).split("/").map(decodeURIComponent);
      const collection = parts[0];
      const recordId = parts[1];
      let store = collections.get(collection);
      if (!store) {
        store = new Map();
        collections.set(collection, store);
      }

      if (method === "GET" && !recordId) {
        return new Response(
          JSON.stringify({ records: Array.from(store.values()), nextAfter: null }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (method === "GET" && recordId) {
        const record = store.get(recordId);
        if (!record) {
          return new Response(JSON.stringify({ error: { code: "not_found" } }), { status: 404 });
        }
        return new Response(JSON.stringify(record), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (method === "PUT" && recordId) {
        const data = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
        const now = new Date().toISOString();
        const existing = store.get(recordId);
        const saved = { id: recordId, data, createdAt: existing?.createdAt ?? now, updatedAt: now };
        store.set(recordId, saved);
        return new Response(JSON.stringify(saved), { status: 200, headers: { "content-type": "application/json" } });
      }

      if (method === "DELETE" && recordId) {
        store.delete(recordId);
        return new Response(null, { status: 204 });
      }
    }

    if (url.pathname.startsWith("/v1/files/")) {
      const filePath = url.pathname.slice("/v1/files/".length).split("/").map(decodeURIComponent).join("/");
      if (method === "PUT") {
        const blob = init?.body instanceof Blob ? init.body : new Blob([String(init?.body ?? "")]);
        files.set(filePath, { body: blob, contentType: blob.type || "application/octet-stream" });
        return new Response(
          JSON.stringify({
            path: filePath,
            size: blob.size,
            contentType: blob.type || "application/octet-stream",
            etag: "etag-1",
            updatedAt: new Date().toISOString(),
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (method === "GET") {
        const found = files.get(filePath);
        if (!found) {
          return new Response(JSON.stringify({ error: { code: "file_not_found" } }), { status: 404 });
        }
        return new Response(found.body, { status: 200, headers: { "content-type": found.contentType } });
      }
      if (method === "DELETE") {
        files.delete(filePath);
        return new Response(null, { status: 204 });
      }
    }

    return new Response(JSON.stringify({ error: { code: "unhandled_route" } }), { status: 500 });
  };

  return {
    client: MiniBaseServerClient.fromEnvironment(fakeFetch),
    collections,
    files,
  };
}

describe("Proposal Items, Variants & Options Repository", () => {
  it("creates, updates, reorders, and deletes KP items with strict owner isolation", async () => {
    const { client } = createInMemoryMiniBase();

    await assert.rejects(
      () => createProposalItem(
        OWNER_A,
        "55555555-5555-4555-8555-555555555555",
        { name: "Сиротская позиция", description: null, dimensions: null, quantity: 1, sort_order: 0 },
        client,
      ),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "proposal_not_found" && err.status === 404,
    );

    const item1 = await createProposalItem(
      OWNER_A,
      KP_1,
      { name: "Шкаф-купе", description: "В прихожую", dimensions: "2400x1800x600", quantity: 1, sort_order: 0 },
      client,
    );
    const item2 = await createProposalItem(
      OWNER_A,
      KP_1,
      { name: "Тумба", description: null, dimensions: "800x400x450", quantity: 2, sort_order: 1 },
      client,
    );

    assert.equal(item1.name, "Шкаф-купе");
    assert.equal(item2.sort_order, 1);

    // Owner B cannot see or mutate Owner A's items
    const ownerBItems = await listProposalItems(OWNER_B, KP_1, client);
    assert.equal(ownerBItems.length, 0);

    await assert.rejects(
      () => updateProposalItem(OWNER_B, item1.id, { name: "Взлом", description: null, dimensions: null, quantity: 1 }, client),
      (err: unknown) => err instanceof ProposalDomainError && err.status === 404,
    );

    // Update item
    const updated1 = await updateProposalItem(
      OWNER_A,
      item1.id,
      { name: "Шкаф-купе Премиум", description: "Обновлено", dimensions: "2500x1800x600", quantity: 3 },
      client,
    );
    assert.equal(updated1.name, "Шкаф-купе Премиум");
    assert.equal(updated1.quantity, 3);

    // Reorder items
    const reordered = await reorderProposalItems(OWNER_A, KP_1, [item2.id, item1.id], client);
    assert.deepEqual(
      reordered.map((i) => ({ id: i.id, sort_order: i.sort_order })),
      [
        { id: item2.id, sort_order: 0 },
        { id: item1.id, sort_order: 1 },
      ],
    );

    // Reject duplicate IDs on reorder
    await assert.rejects(
      () => reorderProposalItems(OWNER_A, KP_1, [item1.id, item1.id], client),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "duplicate_item_ids",
    );

    // Delete item
    const deleted = await deleteProposalItem(OWNER_A, item2.id, client);
    assert.equal(deleted, true);
    const remaining = await listProposalItems(OWNER_A, KP_1, client);
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, item1.id);
  });

  it("enforces variant limits (max 3) and maintains exactly one default variant", async () => {
    const { client } = createInMemoryMiniBase();
    const item = await createProposalItem(
      OWNER_A,
      KP_1,
      { name: "Кухня", description: null, dimensions: null, quantity: 1, sort_order: 0 },
      client,
    );

    // First variant is forced to is_default = true even if false is passed
    const { variant: v1, variants: afterV1 } = await addProposalVariant(
      OWNER_A,
      item.id,
      { name: "Базовый ЛДСП", material: "Egger", hardware: "Boyard", description: null, price: 450000, is_default: false },
      client,
    );
    assert.equal(v1.is_default, true);
    assert.equal(afterV1.length, 1);

    // Second variant with is_default = true unsets v1
    const { variant: v2, variants: afterV2 } = await addProposalVariant(
      OWNER_A,
      item.id,
      { name: "МДФ Эмаль", material: "МДФ", hardware: "Blum", description: null, price: 680000, is_default: true },
      client,
    );
    assert.equal(v2.is_default, true);
    assert.equal(afterV2.find((v) => v.id === v1.id)?.is_default, false);

    // Third variant with is_default = false preserves v2 as default
    const { variant: v3, variants: afterV3 } = await addProposalVariant(
      OWNER_A,
      item.id,
      { name: "Шпон", material: "Дуб", hardware: "Blum", description: null, price: 890000, is_default: false },
      client,
    );
    assert.equal(v3.is_default, false);
    assert.equal(afterV3.length, 3);

    // Fourth variant is rejected
    await assert.rejects(
      () =>
        addProposalVariant(
          OWNER_A,
          item.id,
          { name: "Четвертый", material: null, hardware: null, description: null, price: 1000000, is_default: false },
          client,
        ),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "max_variants_exceeded",
    );

    // Set default to v3
    const afterSetDefault = await setDefaultProposalVariant(OWNER_A, item.id, v3.id, client);
    assert.equal(afterSetDefault.find((v) => v.id === v3.id)?.is_default, true);
    assert.equal(afterSetDefault.find((v) => v.id === v2.id)?.is_default, false);

    // Update v1 and mark it default
    const afterUpdate = await updateProposalVariant(
      OWNER_A,
      item.id,
      v1.id,
      { name: "Базовый ЛДСП+", material: "Egger", hardware: "Hettich", description: "Улучшенный", price: 470000, is_default: true },
      client,
    );
    assert.equal(afterUpdate.find((v) => v.id === v1.id)?.is_default, true);
    assert.equal(afterUpdate.find((v) => v.id === v1.id)?.price, 470000);
    assert.equal(afterUpdate.find((v) => v.id === v3.id)?.is_default, false);

    // Delete default variant (v1) promotes first remaining variant (v2) to default
    const afterDelete = await deleteProposalVariant(OWNER_A, item.id, v1.id, client);
    assert.equal(afterDelete.length, 2);
    assert.equal(afterDelete[0].id, v2.id);
    assert.equal(afterDelete[0].is_default, true);
  });

  it("manages option groups, option values, and simple add-ons", async () => {
    const { client } = createInMemoryMiniBase();
    const item = await createProposalItem(
      OWNER_A,
      KP_1,
      { name: "Гардеробная", description: null, dimensions: null, quantity: 1, sort_order: 0 },
      client,
    );

    // Simple add-on creates a non-required group with 2 values (0 and +price)
    const { group: addOnGroup } = await addItemSimpleAddOn(
      OWNER_A,
      item.id,
      { name: "Подсветка", price: 35000 },
      client,
    );
    assert.equal(addOnGroup.is_required, false);
    assert.equal(addOnGroup.values.length, 2);
    assert.equal(addOnGroup.values[0].is_default, true);
    assert.equal(addOnGroup.values[0].price_delta, 0);
    assert.equal(addOnGroup.values[1].price_delta, 35000);

    // Custom option group + values
    const { group: colorGroup } = await addItemOptionGroup(
      OWNER_A,
      item.id,
      { name: "Цвет фасадов", is_required: true },
      client,
    );
    const afterVal1 = await addItemOptionValue(
      OWNER_A,
      item.id,
      colorGroup.id,
      { name: "Белый матовый", brand: "Egger", price_delta: 0, production_days_delta: 0 },
      client,
    );
    const afterVal2 = await addItemOptionValue(
      OWNER_A,
      item.id,
      colorGroup.id,
      { name: "Кашемир", brand: "AGT", price_delta: 25000, production_days_delta: 2 },
      client,
    );

    const updatedColorGroup = afterVal2.find((g) => g.id === colorGroup.id)!;
    assert.equal(updatedColorGroup.values.length, 2);
    assert.equal(updatedColorGroup.values[0].is_default, true);
    assert.equal(updatedColorGroup.values[1].is_default, false);
    assert.equal(afterVal1.length, 2);

    // Delete option group
    const afterDelete = await deleteItemOptionGroup(OWNER_A, item.id, addOnGroup.id, client);
    assert.equal(afterDelete.length, 1);
    assert.equal((await listItemOptionGroups(OWNER_A, item.id, client)).length, 1);
  });

  it("blocks mutations when parent KP is confirmed or expired", async () => {
    const { client } = createInMemoryMiniBase();
    const item = await createProposalItem(
      OWNER_A,
      KP_1,
      { name: "Шкаф", description: null, dimensions: null, quantity: 1, sort_order: 0 },
      client,
    );

    // Put a confirmed KP into the owner's proposal collection
    await client.put(`proposals_${OWNER_A}`, KP_1, {
      owner_id: OWNER_A,
      number: "КП-2026-001",
      client_id: null,
      client_name: "Клиент",
      client_phone: null,
      project_name: "Проект",
      created_at: new Date().toISOString(),
      valid_until: null,
      status: "confirmed",
      notes: null,
      advance_percent: 50,
      balance_condition: null,
      discount_type: "none",
      discount_value: 0,
      public_token: "44444444-4444-4444-8444-444444444444",
      confirmed_at: new Date().toISOString(),
      selected_total: 500000,
      current_revision: 1,
    });

    await assert.rejects(
      () => updateProposalItem(OWNER_A, item.id, { name: "Изменение", description: null, dimensions: null, quantity: 1 }, client),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "kp_locked" && err.status === 409,
    );

    await assert.rejects(
      () =>
        addProposalVariant(
          OWNER_A,
          item.id,
          { name: "Вариант", material: null, hardware: null, description: null, price: 100, is_default: true },
          client,
        ),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "kp_locked",
    );
  });

  it("uploads, downloads, replaces, and deletes item photos via MiniBase files", async () => {
    const { client, files } = createInMemoryMiniBase();
    const item = await createProposalItem(
      OWNER_A,
      KP_1,
      { name: "Витрина", description: null, dimensions: null, quantity: 1, sort_order: 0 },
      client,
    );

    const file1 = Object.assign(new Blob(["fake-image-1"], { type: "image/png" }), { name: "render.png" });
    const withPhoto1 = await uploadProposalItemPhoto(OWNER_A, item.id, "original", file1, client);
    assert.ok(withPhoto1.original_image_url);
    assert.equal(files.size, 1);

    const downloaded = await downloadProposalItemPhoto(OWNER_A, item.id, "original", client);
    assert.ok(downloaded);
    assert.equal(await downloaded.text(), "fake-image-1");

    // Replacing photo deletes the previous file
    const file2 = Object.assign(new Blob(["fake-image-2"], { type: "image/webp" }), { name: "render2.webp" });
    const withPhoto2 = await uploadProposalItemPhoto(OWNER_A, item.id, "original", file2, client);
    assert.notEqual(withPhoto2.original_image_url, withPhoto1.original_image_url);
    assert.equal(files.size, 1);

    // Deleting photo removes file and clears item field
    const afterDelete = await deleteProposalItemPhoto(OWNER_A, item.id, "original", client);
    assert.equal(afterDelete.original_image_url, null);
    assert.equal(files.size, 0);
  });

  it("maps domain errors and authentication failures to expected HTTP responses via apiError", async () => {
    const { apiError } = await import("../http/api-response");
    const { ManagerAuthenticationError } = await import("../auth/manager-session");
    const { kpItemsReorderSchema, kpSimpleAddOnSchema } = await import("../validation/index");

    const unauthRes = apiError(new ManagerAuthenticationError());
    assert.equal(unauthRes.status, 401);
    assert.deepEqual(await unauthRes.json(), { error: "unauthorized" });

    const domainRes = apiError(new ProposalDomainError("kp_locked", "КП заблокировано", 409));
    assert.equal(domainRes.status, 409);
    assert.deepEqual(await domainRes.json(), { error: "kp_locked", message: "КП заблокировано" });

    assert.equal(kpItemsReorderSchema.safeParse({ item_ids: ["not-a-uuid"] }).success, false);
    assert.equal(kpItemsReorderSchema.safeParse({ item_ids: [KP_1] }).success, true);

    assert.equal(kpSimpleAddOnSchema.safeParse({ name: "Подсветка", price: 0 }).success, false);
    assert.equal(kpSimpleAddOnSchema.safeParse({ name: "Подсветка", price: 15000 }).success, true);
  });
});

