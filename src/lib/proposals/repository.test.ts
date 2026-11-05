import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MiniBaseServerClient } from "../minibase/server-client";
import {
  ProposalDomainError,
  createProposal,
  deleteProposal,
  downloadProposalSnapshotPdf,
  duplicateProposal,
  getProposal,
  listProposalApprovalSnapshots,
  listProposals,
  publishProposal,
  reopenProposalForRevision,
  updateProposal,
} from "./repository";
import {
  addItemOptionGroup,
  addItemOptionValue,
  addItemSimpleAddOn,
  addProposalVariant,
  createProposalItem,
  downloadProposalItemPhoto,
  listProposalItems,
  uploadProposalItemPhoto,
} from "./items-repository";

const OWNER_A = "11111111-1111-4111-8111-111111111111";
const OWNER_B = "22222222-2222-4222-8222-222222222222";
const MISSING_KP = "99999999-9999-4999-8999-999999999999";

function createInMemoryMiniBase() {
  const collections = new Map<
    string,
    Map<string, { id: string; data: Record<string, unknown>; createdAt: string; updatedAt: string }>
  >();
  const files = new Map<string, { body: Blob; contentType: string }>();

  process.env.MINIBASE_URL = "http://localhost:8787";
  process.env.MINIBASE_SECRET_KEY = "mb_secret_test_key_for_unit_tests";

  const fakeFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.toString());
    const method = (init?.method || "GET").toUpperCase();

    if (url.pathname === "/v1/commands/records:allocate-seeded-sequence" && method === "POST") {
      const payload = JSON.parse(String(init?.body || "{}")) as {
        counter: { collection: string; id: string };
        record: { collection: string; id: string; data: Record<string, unknown> };
        sequenceField: string;
        prefix: string;
        minimumDigits: number;
        initialValue: number;
      };
      let counterStore = collections.get(payload.counter.collection);
      if (!counterStore) {
        counterStore = new Map();
        collections.set(payload.counter.collection, counterStore);
      }
      const existingCounter = counterStore.get(payload.counter.id);
      const currentVal =
        existingCounter && typeof existingCounter.data.value === "number"
          ? existingCounter.data.value
          : payload.initialValue;
      const nextVal = currentVal + 1;
      const now = new Date().toISOString();
      counterStore.set(payload.counter.id, {
        id: payload.counter.id,
        data: { value: nextVal },
        createdAt: existingCounter?.createdAt ?? now,
        updatedAt: now,
      });

      let recordStore = collections.get(payload.record.collection);
      if (!recordStore) {
        recordStore = new Map();
        collections.set(payload.record.collection, recordStore);
      }
      const formatted = `${payload.prefix}${String(nextVal).padStart(payload.minimumDigits, "0")}`;
      const recordData = { ...payload.record.data, [payload.sequenceField]: formatted };
      recordStore.set(payload.record.id, {
        id: payload.record.id,
        data: recordData,
        createdAt: now,
        updatedAt: now,
      });

      return new Response(
        JSON.stringify({
          commandId: "cmd-1",
          status: "applied",
          record: { collection: payload.record.collection, id: payload.record.id },
          replayed: false,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

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

describe("Proposal Header & Lifecycle Repository", () => {
  it("enforces ownership and handles missing KPs across get, update, delete, publish, duplicate, and reopen", async () => {
    const { client } = createInMemoryMiniBase();

    // Missing KP returns null / false
    assert.equal(await getProposal(MISSING_KP, OWNER_A, client), null);
    assert.equal(
      await updateProposal(
        MISSING_KP,
        OWNER_A,
        {
          client_name: "Алия",
          client_phone: null,
          project_name: "Кухня",
          number: null,
          valid_until: null,
          notes: null,
          advance_percent: 50,
          balance_condition: null,
          discount_type: "none",
          discount_value: 0,
        },
        client,
      ),
      null,
    );
    assert.equal(await deleteProposal(MISSING_KP, OWNER_A, client), false);
    assert.equal(await publishProposal(MISSING_KP, OWNER_A, client), null);
    assert.equal(await duplicateProposal(MISSING_KP, OWNER_A, client), null);
    assert.equal(await reopenProposalForRevision(MISSING_KP, OWNER_A, client), null);

    // Create KP for Owner A
    const created = await createProposal(
      OWNER_A,
      {
        client_id: null,
        client_name: "Алия",
        client_phone: "+7 777 111 2233",
        project_name: "Гардеробная",
        valid_until: "2026-12-01",
        notes: "Срочный заказ",
        advance_percent: 60,
        balance_condition: "Перед монтажом",
        discount_type: "percent",
        discount_value: 10,
      },
      client,
    );

    assert.match(created.number, /^КП-\d{4}-001$/);
    assert.equal(created.status, "draft");
    assert.equal(created.current_revision, 1);

    // Owner B cannot access or mutate Owner A's KP
    assert.equal(await getProposal(created.id, OWNER_B, client), null);
    assert.equal(await deleteProposal(created.id, OWNER_B, client), false);
    assert.equal(await duplicateProposal(created.id, OWNER_B, client), null);
    assert.equal((await listProposals(OWNER_B, client)).length, 0);

    // Owner A can update fields (and blank number preserves existing number)
    const updated = await updateProposal(
      OWNER_A,
      created.id,
      {
        client_name: "Алия С.",
        client_phone: "+7 777 999 0000",
        project_name: "Гардеробная Люкс",
        number: "",
        valid_until: "2026-12-15",
        notes: "Обновлённое примечание",
        advance_percent: 70,
        balance_condition: "После доставки",
        discount_type: "fixed",
        discount_value: 25000,
      },
      client,
    );

    // Note: updateProposal takes (id, ownerId, input, client)
    assert.equal(updated, null); // Because OWNER_A was passed as id above! Let's call with (created.id, OWNER_A, ...)
    const realUpdated = await updateProposal(
      created.id,
      OWNER_A,
      {
        client_name: "Алия С.",
        client_phone: "+7 777 999 0000",
        project_name: "Гардеробная Люкс",
        number: "",
        valid_until: "2026-12-15",
        notes: "Обновлённое примечание",
        advance_percent: 70,
        balance_condition: "После доставки",
        discount_type: "fixed",
        discount_value: 25000,
      },
      client,
    );
    assert.ok(realUpdated);
    assert.equal(realUpdated.client_name, "Алия С.");
    assert.equal(realUpdated.project_name, "Гардеробная Люкс");
    assert.equal(realUpdated.number, created.number);
    assert.equal(realUpdated.discount_type, "fixed");
    assert.equal(realUpdated.discount_value, 25000);
  });

  it("enforces publish requirements (at least 1 item and 1 variant per item) and transitions status to sent", async () => {
    const { client } = createInMemoryMiniBase();

    const kp = await createProposal(
      OWNER_A,
      {
        client_id: null,
        client_name: "Клиент",
        client_phone: null,
        project_name: "Кухня",
        valid_until: null,
        notes: null,
        advance_percent: 50,
        balance_condition: null,
        discount_type: "none",
        discount_value: 0,
      },
      client,
    );

    // Cannot publish without items
    await assert.rejects(
      () => publishProposal(kp.id, OWNER_A, client),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "publish_empty_items",
    );

    // Add item without variants -> still cannot publish
    const item = await createProposalItem(
      OWNER_A,
      kp.id,
      { name: "Остров", description: null, dimensions: "2000x900x900", quantity: 1, sort_order: 0 },
      client,
    );
    await assert.rejects(
      () => publishProposal(kp.id, OWNER_A, client),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "publish_missing_variants",
    );

    // Add variant -> publish succeeds
    await addProposalVariant(
      OWNER_A,
      item.id,
      { name: "МДФ", material: "Egger", hardware: "Blum", description: null, price: 320000, is_default: true },
      client,
    );

    const published = await publishProposal(kp.id, OWNER_A, client);
    assert.ok(published);
    assert.equal(published.status, "sent");
  });

  it("duplicates KP along with all items, variants, and option groups into a new draft KP", async () => {
    const { client } = createInMemoryMiniBase();

    const sourceKp = await createProposal(
      OWNER_A,
      {
        client_id: null,
        client_name: "Тимур",
        client_phone: "+7 701 000 0000",
        project_name: "Спальня",
        valid_until: "2026-12-31",
        notes: "Примечание",
        advance_percent: 50,
        balance_condition: "По факту",
        discount_type: "percent",
        discount_value: 5,
      },
      client,
    );

    const item = await createProposalItem(
      OWNER_A,
      sourceKp.id,
      { name: "Кровать", description: "С мягким изголовьем", dimensions: "2000x1800", quantity: 1, sort_order: 0 },
      client,
    );
    const sourceWithPhoto = await uploadProposalItemPhoto(
      OWNER_A,
      item.id,
      "original",
      Object.assign(new Blob(["source-photo"], { type: "image/png" }), { name: "source.png" }),
      client,
    );
    await addProposalVariant(
      OWNER_A,
      item.id,
      { name: "Велюр", material: "Велюр", hardware: "Подъёмный механизм", description: null, price: 420000, is_default: true },
      client,
    );
    await addItemSimpleAddOn(OWNER_A, item.id, { name: "Ортопедическое основание", price: 45000 }, client);
    const { group: customGroup } = await addItemOptionGroup(
      OWNER_A,
      item.id,
      { name: "Ткань", is_required: true },
      client,
    );
    await addItemOptionValue(
      OWNER_A,
      item.id,
      customGroup.id,
      { name: "Антикоготь", brand: "Lux", price_delta: 20000, production_days_delta: 0 },
      client,
    );

    const duplicated = await duplicateProposal(sourceKp.id, OWNER_A, client);
    assert.ok(duplicated);
    assert.notEqual(duplicated.id, sourceKp.id);
    assert.notEqual(duplicated.number, sourceKp.number);
    assert.notEqual(duplicated.public_token, sourceKp.public_token);
    assert.equal(duplicated.status, "draft");
    assert.equal(duplicated.project_name, "Спальня");

    const clonedItems = await listProposalItems(OWNER_A, duplicated.id, client);
    assert.equal(clonedItems.length, 1);
    assert.notEqual(clonedItems[0].id, item.id);
    assert.equal(clonedItems[0].name, "Кровать");
    assert.ok(sourceWithPhoto.original_image_url);
    assert.ok(clonedItems[0].original_image_url);
    assert.notEqual(clonedItems[0].original_image_url, sourceWithPhoto.original_image_url);
    const clonedPhoto = await downloadProposalItemPhoto(OWNER_A, clonedItems[0].id, "original", client);
    assert.ok(clonedPhoto);
    assert.equal(await clonedPhoto.text(), "source-photo");
    assert.equal(clonedItems[0].variants.length, 1);
    assert.equal(clonedItems[0].variants[0].item_id, clonedItems[0].id);
    assert.equal(clonedItems[0].variants[0].price, 420000);
    assert.equal(clonedItems[0].option_groups.length, 2);
    assert.equal(clonedItems[0].option_groups[0].item_id, clonedItems[0].id);
    assert.equal(clonedItems[0].option_groups[0].values.length, 2);
  });

  it("blocks update/delete on confirmed KP, allows reopening when approval snapshot exists, and streams snapshot PDF", async () => {
    const { client } = createInMemoryMiniBase();

    const kp = await createProposal(
      OWNER_A,
      {
        client_id: null,
        client_name: "Ерлан",
        client_phone: null,
        project_name: "Кабинет",
        valid_until: "2020-01-01",
        notes: null,
        advance_percent: 50,
        balance_condition: null,
        discount_type: "none",
        discount_value: 0,
      },
      client,
    );

    // Cannot reopen a draft KP
    await assert.rejects(
      () => reopenProposalForRevision(kp.id, OWNER_A, client),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "kp_not_confirmed",
    );

    // Mark KP as confirmed in storage
    await client.put(`proposals_${OWNER_A}`, kp.id, {
      ...kp,
      owner_id: OWNER_A,
      status: "confirmed",
      confirmed_at: "2026-08-25T10:00:00.000Z",
      selected_total: 750000,
      current_revision: 1,
    });

    // Update and delete are blocked for confirmed KP
    await assert.rejects(
      () =>
        updateProposal(
          kp.id,
          OWNER_A,
          {
            client_name: "Изменение",
            client_phone: null,
            project_name: "Кабинет",
            number: kp.number,
            valid_until: null,
            notes: null,
            advance_percent: 50,
            balance_condition: null,
            discount_type: "none",
            discount_value: 0,
          },
          client,
        ),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "kp_locked" && err.status === 409,
    );

    await assert.rejects(
      () => deleteProposal(kp.id, OWNER_A, client),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "kp_locked" && err.status === 409,
    );

    // Reopen fails if the confirmed revision snapshot is missing
    await assert.rejects(
      () => reopenProposalForRevision(kp.id, OWNER_A, client),
      (err: unknown) => err instanceof ProposalDomainError && err.code === "missing_revision_snapshot",
    );

    // Seed approval snapshot and PDF in MiniBase
    const snapshotId = "55555555-5555-4555-8555-555555555555";
    const pdfPath = `${kp.id}/${kp.public_token}/approval-v1.pdf`;
    await client.uploadFile(pdfPath, new Blob(["%PDF-1.4 fake pdf bytes"], { type: "application/pdf" }));
    await client.put(`proposal_snapshots_${OWNER_A}`, snapshotId, {
      owner_id: OWNER_A,
      kp_id: kp.id,
      version: 1,
      snapshot: { total: 750000 },
      total: 750000,
      advance: 375000,
      balance: 375000,
      confirmed_at: "2026-08-25T10:00:00.000Z",
      pdf_storage_path: pdfPath,
      pdf_generated_at: "2026-08-25T10:01:00.000Z",
    });

    const snapshots = await listProposalApprovalSnapshots(kp.id, OWNER_A, client);
    assert.equal(snapshots.length, 1);
    assert.equal(snapshots[0].version, 1);

    const pdfDownload = await downloadProposalSnapshotPdf(kp.id, snapshotId, OWNER_A, client);
    assert.ok(pdfDownload);
    assert.equal(pdfDownload.filename, `${kp.number}-v1.pdf`);
    assert.equal(await pdfDownload.response.text(), "%PDF-1.4 fake pdf bytes");

    // Owner B cannot download Owner A's snapshot PDF
    assert.equal(await downloadProposalSnapshotPdf(kp.id, snapshotId, OWNER_B, client), null);

    // Now reopen succeeds, increments revision to 2, resets status to sent, and extends valid_until
    const reopened = await reopenProposalForRevision(kp.id, OWNER_A, client);
    assert.ok(reopened);
    assert.equal(reopened.status, "sent");
    assert.equal(reopened.current_revision, 2);
    assert.equal(reopened.confirmed_at, null);
    assert.equal(reopened.selected_total, null);
    assert.ok(reopened.valid_until && reopened.valid_until > "2026-01-01");
  });
});
