"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { calculateKp } from "@/lib/utils/calculation";
import ItemManager from "./item-manager";
import type { Kp, KpItem, KpItemVariant } from "@/types";

export default function ProposalDetailForm() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const supabase = createClient();

  const [kp, setKp] = useState<Kp | null>(null);
  const [items, setItems] = useState<(KpItem & { variants: KpItemVariant[] })[]>([]);
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
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
    }
  };

  const handlePublish = async () => {
    if (!kp) return;
    const { error } = await supabase
      .from("kps")
      .update({ status: "sent" })
      .eq("id", id);

    if (!error) {
      setKp({ ...kp, status: "sent" });
    }
  };

  const handleDuplicate = async () => {
    if (!kp) return;
    const { data: newKp, error: kpError } = await supabase
      .from("kps")
      .insert({
        client_name: kp.client_name,
        client_phone: kp.client_phone,
        project_name: kp.project_name,
        number: null,
        valid_until: kp.valid_until,
        notes: kp.notes,
        advance_percent: kp.advance_percent,
        balance_condition: kp.balance_condition,
        discount_type: kp.discount_type,
        discount_value: kp.discount_value,
      })
      .select()
      .single();

    if (kpError || !newKp) return;

    if (items.length > 0) {
      const newItems = items.map((item) => ({
        kp_id: newKp.id,
        name: item.name,
        description: item.description,
        dimensions: item.dimensions,
        quantity: item.quantity,
        image_url: item.image_url,
        sort_order: item.sort_order,
      }));

      const { data: newItemsData } = await supabase
        .from("kp_items")
        .insert(newItems)
        .select();

      if (newItemsData) {
        const variantInserts = items.flatMap((item, idx) => {
          const newItem = newItemsData[idx];
          if (!newItem) return [];
          return item.variants.map((variant) => ({
            item_id: newItem.id,
            name: variant.name,
            material: variant.material,
            hardware: variant.hardware,
            description: variant.description,
            price: variant.price,
            is_default: variant.is_default,
          }));
        });

        if (variantInserts.length > 0) {
          await supabase.from("kp_item_variants").insert(variantInserts);
        }
      }
    }

    router.push(`/proposals/${newKp.id}`);
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
    window.open(`https://wa.me/?${kp.client_phone ? `phone=${kp.client_phone}&` : ""}text=${text}`, "_blank");
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
          <Button variant="danger" onClick={handleDelete}>
            Удалить
          </Button>
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
                />
                <Input
                  id="client_phone"
                  label="Телефон клиента"
                  value={formData.client_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, client_phone: e.target.value })
                  }
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
                />
                <Input
                  id="number"
                  label="Номер КП"
                  value={formData.number}
                  onChange={(e) =>
                    setFormData({ ...formData, number: e.target.value })
                  }
                  placeholder="КП-2026-001"
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
              />
              {errors.root && (
                <p className="text-sm text-red-600">{errors.root}</p>
              )}
              <Button type="submit" disabled={saving}>
                {saving ? "Сохранение..." : "Сохранить изменения"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-stone-800">Позиции</h2>
        </CardHeader>
        <CardContent>
          <ItemManager kpId={id} items={items} onItemsChange={setItems} />
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
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={getPublicUrl()}
                  className="flex-1 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-600"
                />
                <Button type="button" variant="secondary" onClick={handleCopyLink}>
                  {copySuccess ? "Скопировано!" : "Копировать"}
                </Button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={handleShareWhatsApp}>
                Отправить в WhatsApp
              </Button>
              {kp.status === "draft" && (
                <Button type="button" onClick={handlePublish}>
                  Опубликовать
                </Button>
              )}
              <Button type="button" variant="secondary" onClick={handleDuplicate}>
                Дублировать
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
