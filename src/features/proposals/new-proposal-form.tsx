"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { kpSchema } from "@/lib/validation";
import type { Client } from "@/types";

export default function NewProposalForm() {
  const [clients, setClients] = useState<Client[]>([]);
  const [formData, setFormData] = useState({
    client_id: "",
    client_name: "",
    client_phone: "",
    project_name: "",
    number: "",
    valid_until: "",
    notes: "",
    advance_percent: 50,
    balance_condition: "при доставке",
    discount_type: "none",
    discount_value: 0,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .order("name");
      if (!cancelled && data) {
        setClients(data);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  const handleClientChange = (clientId: string) => {
    const client = clients.find((c) => c.id === clientId);
    if (client) {
      setFormData({
        ...formData,
        client_id: client.id,
        client_name: client.name,
        client_phone: client.phone || "",
      });
    } else {
      setFormData({
        ...formData,
        client_id: "",
        client_name: "",
        client_phone: "",
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const result = kpSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.issues.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      setLoading(false);
      return;
    }

    let number = formData.number;
    if (!number) {
      const { data } = await supabase.rpc("get_next_kp_number");
      number = data || `КП-${new Date().getFullYear()}-001`;
    }

    const { data: newKp, error } = await supabase
      .from("kps")
      .insert({
        number,
        client_id: formData.client_id || null,
        client_name: formData.client_name,
        client_phone: formData.client_phone || null,
        project_name: formData.project_name,
        valid_until: formData.valid_until || null,
        notes: formData.notes || null,
        advance_percent: formData.advance_percent,
        balance_condition: formData.balance_condition || null,
        discount_type: formData.discount_type,
        discount_value: formData.discount_value,
      })
      .select()
      .single();

    if (error) {
      setErrors({ root: "Ошибка сохранения: " + error.message });
      setLoading(false);
      return;
    }

    router.push(`/proposals/${newKp.id}`);
    router.refresh();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-stone-800">Новое КП</h1>

      <Card>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Select
              id="client_id"
              label="Клиент"
              value={formData.client_id}
              onChange={(e) => handleClientChange(e.target.value)}
              options={[
                { value: "", label: "Выберите клиента" },
                ...clients.map((c) => ({ value: c.id, label: c.name })),
              ]}
            />
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
              label="Номер КП (авто)"
              value={formData.number}
              onChange={(e) =>
                setFormData({ ...formData, number: e.target.value })
              }
              placeholder="КП-2026-001"
            />
            <Input
              id="valid_until"
              label="Срок действия"
              type="date"
              value={formData.valid_until}
              onChange={(e) =>
                setFormData({ ...formData, valid_until: e.target.value })
              }
            />
            <div className="grid grid-cols-2 gap-4">
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
            <div className="flex gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? "Сохранение..." : "Создать КП"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.back()}
              >
                Отмена
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
