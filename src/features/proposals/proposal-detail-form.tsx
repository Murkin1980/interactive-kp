"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { calculateKp } from "@/lib/utils/calculation";
import ItemManager from "./item-manager";
import type { Kp, KpApprovalSnapshot, KpItem, KpItemVariant } from "@/types";

export default function ProposalDetailForm() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const supabase = createClient();

  const [kp, setKp] = useState<Kp | null>(null);
  const [items, setItems] = useState<(KpItem & { variants: KpItemVariant[] })[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  const [snapshots, setSnapshots] = useState<KpApprovalSnapshot[]>([]);
  const [formData, setFormData] = useState({
    client_name: "",
    client_phone: "",
    project_name: "",
    number: "",
    valid_until: "",
    notes: "",
    advance_percent: 50,
    balance_condition: "",
    discount_type: "none" as string,
    discount_value: 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [reopenArmed, setReopenArmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);

      const { data: kpData } = await supabase
        .from("kps")
        .select("*")
        .eq("id", id)
        .single();

      if (!cancelled && kpData) {
        setKp(kpData);
        setFormData({
          client_name: kpData.client_name || "",
          client_phone: kpData.client_phone || "",
          project_name: kpData.project_name || "",
          number: kpData.number || "",
          valid_until: kpData.valid_until || "",
          notes: kpData.notes || "",
          advance_percent: kpData.advance_percent ?? 50,
          balance_condition: kpData.balance_condition || "",
          discount_type: kpData.discount_type || "none",
          discount_value: kpData.discount_value ?? 0,
        });
      }

      const { data: itemsData } = await supabase
        .from("kp_items")
        .select("*, variants:kp_item_variants(*)")
        .eq("kp_id", id)
        .order("sort_order");

      if (!cancelled && itemsData) {
        const typedItems = itemsData as (KpItem & { variants: KpItemVariant[] })[];
        setItems(typedItems);

        const defaultSelections: Record<string, string> = {};
        for (const item of typedItems) {
          const defaultVariant = item.variants.find((v) => v.is_default);
          if (defaultVariant) {
            defaultSelections[item.id] = defaultVariant.id;
          } else if (item.variants.length > 0) {
            defaultSelections[item.id] = item.variants[0].id;
          }
        }
        setSelectedVariants(defaultSelections);
      }

      const { data: snapshotData } = await supabase.from("kp_approval_snapshots").select("*").eq("kp_id", id).order("version", { ascending: false });
      if (!cancelled && snapshotData) setSnapshots(snapshotData as KpApprovalSnapshot[]);

      if (!cancelled) {
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, supabase]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kp) return;
    setSaving(true);
    setErrors({});

    if (!formData.client_name.trim()) {
      setErrors({ client_name: "Обязательное поле" });
      setSaving(false);
      return;
    }
    if (!formData.project_name.trim()) {
      setErrors({ project_name: "Обязательное поле" });
      setSaving(false);
      return;
    }

    const { error } = await supabase
      .from("kps")
      .update({
        client_name: formData.client_name,
        client_phone: formData.client_phone || null,
        project_name: formData.project_name,
        number: formData.number || null,
        valid_until: formData.valid_until || null,
        notes: formData.notes || null,
        advance_percent: formData.advance_percent,
        balance_condition: formData.balance_condition || null,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
      })
      .eq("id", id);

    if (error) {
      setErrors({ root: "Ошибка сохранения: " + error.message });
      setSaving(false);
      return;
    }

    setSaving(false);
    router.refresh();
  };

  const handleDelete = async () => {
    if (!confirm("Удалить это КП? Это действие нельзя отменить.")) return;

    const { error } = await supabase.from("kps").delete().eq("id", id);
    if (!error) {
      router.push("/proposals");
      return;
    }
    setErrors({ root: "Ошибка удаления: " + error.message });
  };

  const handlePublish = async () => {
    if (!kp) return;
    setErrors({});
    const { error } = await supabase
      .from("kps")
      .update({ status: "sent" })
      .eq("id", id);

    if (!error) {
      setKp({ ...kp, status: "sent" });
      return;
    }
    setErrors({ root: "Не удалось опубликовать КП: " + error.message });
  };

  const handleDuplicate = async () => {
    if (!kp) return;
    const { data: newKpId, error: dupError } = await supabase.rpc(
      "duplicate_kp",
      { p_kp_id: kp.id }
    );

    if (dupError || !newKpId) {
      setErrors({ root: "Ошибка дублирования: " + (dupError?.message ?? "Неизвестная ошибка") });
      return;
    }

    router.push(`/proposals/${newKpId}`);
  };

  const handleReopenRevision = async () => {
    if (!kp || kp.status !== "confirmed") return;
    if (!reopenArmed) {
      setReopenArmed(true);
      return;
    }
    setErrors({});
    const { data, error } = await supabase.rpc("reopen_kp_for_revision", { p_kp_id: kp.id });
    if (error) {
      setErrors({ root: "Не удалось создать новую редакцию: " + error.message });
      return;
    }
    const revision = (data as { revision?: number } | null)?.revision ?? kp.current_revision + 1;
    setKp({ ...kp, status: "sent", current_revision: revision, confirmed_at: null, selected_total: null });
    router.refresh();
  };

  const handleDownloadPdf = async (snapshot: KpApprovalSnapshot) => {
    if (!snapshot.pdf_storage_path) return;
    const { data, error } = await supabase.storage.from("kp-media").download(snapshot.pdf_storage_path);
    if (error) { setErrors({ root: "Не удалось скачать PDF: " + error.message }); return; }
    const url = URL.createObjectURL(data); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${kp?.number || "KP"}-v${snapshot.version}.pdf`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const getPublicUrl = () => {
    if (!kp) return "";
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    return `${baseUrl}/public/${kp.public_token}`;
  };

  const handleCopyLink = async () => {
    const url = getPublicUrl();
    try {
      await navigator.clipboard.writeText(url);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const handleShareWhatsApp = () => {
    if (!kp) return;
    const url = getPublicUrl();
    const text = encodeURIComponent(
      `Коммерческое предложение «${kp.project_name}»\n\nПросмотреть: ${url}`
    );
    const phone = kp.client_phone?.replace(/\D/g, "") || "";
    const whatsappUrl = phone
      ? `https://wa.me/${phone}?text=${text}`
      : `https://wa.me/?text=${text}`;
    window.open(whatsappUrl, "_blank", "noopener,noreferrer");
  };

  const calculation = calculateKp(
    items,
    selectedVariants,
    (formData.discount_type as "none" | "percent" | "fixed") || "none",
    formData.discount_value,
    formData.advance_percent
  );

  const statusLabels: Record<string, string> = {
    draft: "Черновик",
    sent: "Отправлено",
    viewed: "Просмотрено",
    confirmed: "Подтверждено",
    expired: "Истекло",
  };

  const statusColors: Record<string, string> = {
    draft: "bg-stone-100 text-stone-600",
    sent: "bg-amber-100 text-amber-800",
    viewed: "bg-blue-100 text-blue-800",
    confirmed: "bg-green-100 text-green-800",
    expired: "bg-red-100 text-red-800",
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-stone-500">Загрузка...</p>
      </div>
    );
  }

  if (!kp) {
    return (
      <div className="text-center py-20">
        <p className="text-stone-500">КП не найдено</p>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => router.push("/proposals")}
        >
          Назад к списку
        </Button>
      </div>
    );
  }

  const isReadOnly = kp.status === "confirmed" || kp.status === "expired";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold text-stone-800">{kp.number || "Без номера"}</h1>
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${statusColors[kp.status] || ""}`}
          >
            {statusLabels[kp.status] || kp.status}
          </span>
        </div>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => router.push("/proposals")}>
            Назад
          </Button>
          {!isReadOnly && (
            <Button variant="danger" onClick={handleDelete}>
              Удалить
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-stone-800">Данные КП</h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  id="client_name"
                  label="Имя клиента *"
                  value={formData.client_name}
                  onChange={(e) =>
                    setFormData({ ...formData, client_name: e.target.value })
                  }
                  error={errors.client_name}
                  required
                  disabled={isReadOnly}
                />
                <Input
                  id="client_phone"
                  label="Телефон клиента"
                  value={formData.client_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, client_phone: e.target.value })
                  }
                  disabled={isReadOnly}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Input
                  id="project_name"
                  label="Название проекта *"
                  value={formData.project_name}
                  onChange={(e) =>
                    setFormData({ ...formData, project_name: e.target.value })
                  }
                  error={errors.project_name}
                  placeholder="Кухня, Гардеробная и т.д."
                  required
                  disabled={isReadOnly}
                />
                <Input
                  id="number"
                  label="Номер КП"
                  value={formData.number}
                  onChange={(e) =>
                    setFormData({ ...formData, number: e.target.value })
                  }
                  placeholder="КП-2026-001"
                  disabled={isReadOnly}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Input
                  id="valid_until"
                  label="Срок действия"
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) =>
                    setFormData({ ...formData, valid_until: e.target.value })
                  }
                  disabled={isReadOnly}
                />
                <Input
                  id="advance_percent"
                  label="Аванс (%)"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.advance_percent}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      advance_percent: parseInt(e.target.value) || 0,
                    })
                  }
                  disabled={isReadOnly}
                />
                <Input
                  id="balance_condition"
                  label="Условие оплаты остатка"
                  value={formData.balance_condition}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      balance_condition: e.target.value,
                    })
                  }
                  disabled={isReadOnly}
                />
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Select
                  id="discount_type"
                  label="Тип скидки"
                  value={formData.discount_type}
                  onChange={(e) =>
                    setFormData({ ...formData, discount_type: e.target.value })
                  }
                  options={[
                    { value: "none", label: "Без скидки" },
                    { value: "percent", label: "Процентная" },
                    { value: "fixed", label: "Фиксированная" },
                  ]}
                  disabled={isReadOnly}
                />
                {formData.discount_type !== "none" && (
                  <Input
                    id="discount_value"
                    label={
                      formData.discount_type === "percent"
                        ? "Скидка (%)"
                        : "Скидка (₸)"
                    }
                    type="number"
                    min="0"
                    value={formData.discount_value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discount_value: parseInt(e.target.value) || 0,
                      })
                    }
                    disabled={isReadOnly}
                  />
                )}
              </div>
              <Textarea
                id="notes"
                label="Примечание"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                placeholder="Дополнительная информация..."
                disabled={isReadOnly}
              />
              {errors.root && (
                <p className="text-sm text-red-600">{errors.root}</p>
              )}
              {!isReadOnly && (
                <Button type="submit" disabled={saving}>
                  {saving ? "Сохранение..." : "Сохранить изменения"}
                </Button>
              )}
              {isReadOnly && (
                <p className="text-sm text-stone-500 italic">
                  {kp.status === "confirmed"
                    ? "КП подтверждено клиентом. Для изменений создайте дубликат."
                    : "Срок действия КП истёк. Для изменений создайте дубликат."}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-stone-800">Позиции</h2>
        </CardHeader>
        <CardContent>
          <ItemManager kpId={id} items={items} onItemsChange={setItems} readOnly={isReadOnly} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-stone-800">Расчёт</h2>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3">
            <div className="flex items-center justify-between">
              <dt className="text-stone-600">Сумма без скидки</dt>
              <dd className="font-medium text-stone-800">
                {formatCurrency(calculation.subtotal)}
              </dd>
            </div>
            {calculation.discountAmount > 0 && (
              <div className="flex items-center justify-between">
                <dt className="text-stone-600">
                  Скидка
                  {formData.discount_type === "percent" && (
                    <span className="text-sm text-stone-400">
                      {" "}({formData.discount_value}%)
                    </span>
                  )}
                </dt>
                <dd className="font-medium text-green-600">
                  −{formatCurrency(calculation.discountAmount)}
                </dd>
              </div>
            )}
            <div className="border-t border-stone-200 pt-3">
              <div className="flex items-center justify-between">
                <dt className="text-base font-semibold text-stone-800">Итого</dt>
                <dd className="text-lg font-bold text-stone-800">
                  {formatCurrency(calculation.total)}
                </dd>
              </div>
            </div>
            {formData.advance_percent > 0 && (
              <>
                <div className="flex items-center justify-between">
                  <dt className="text-stone-600">
                    Аванс ({formData.advance_percent}%)
                  </dt>
                  <dd className="font-medium text-amber-700">
                    {formatCurrency(calculation.advance)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-stone-600">Остаток</dt>
                  <dd className="font-medium text-stone-600">
                    {formatCurrency(calculation.balance)}
                  </dd>
                </div>
              </>
            )}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-stone-800">Действия</h2>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="rounded-lg bg-stone-50 p-4">
              <p className="mb-2 text-sm font-medium text-stone-600">
                Публичная ссылка
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={getPublicUrl()}
                  className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-600"
                />
                <Button type="button" variant="secondary" onClick={handleCopyLink}>
                  {copySuccess ? "Скопировано!" : "Копировать"}
                </Button>
                <Button type="button" variant="secondary" className="gap-2 transition-colors hover:bg-amber-100" onClick={() => window.open(getPublicUrl(), "_blank", "noopener,noreferrer")}>
                  <ExternalLink size={16} /> Открыть как клиент
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" onClick={handleShareWhatsApp} className="bg-[#25D366] text-white transition-colors hover:bg-[#1ebe5d]">
                Отправить в WhatsApp
              </Button>
              {kp.status === "draft" && !isReadOnly && (
                <Button type="button" onClick={handlePublish}>
                  Опубликовать
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={handleDuplicate}>
                Дублировать
              </Button>
              {kp.status === "confirmed" && (
                <Button type="button" onClick={handleReopenRevision}>
                  {reopenArmed ? "Подтвердить разблокировку" : "Создать новую редакцию"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
      {snapshots.length > 0 && <Card><CardHeader><h2 className="text-lg font-semibold text-stone-800">История согласованных смет</h2></CardHeader><CardContent><div className="space-y-3">{snapshots.map((snapshot) => <div key={snapshot.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-stone-200 p-4"><div><b className="text-stone-800">Редакция {snapshot.version}</b><p className="text-xs text-stone-500">{new Date(snapshot.confirmed_at).toLocaleString("ru-RU")} · {formatCurrency(snapshot.total)}</p></div>{snapshot.pdf_storage_path ? <Button type="button" variant="secondary" onClick={() => void handleDownloadPdf(snapshot)}>Скачать PDF</Button> : <span className="text-xs text-amber-700">PDF ещё не сформирован</span>}</div>)}</div></CardContent></Card>}
    </div>
  );
}
