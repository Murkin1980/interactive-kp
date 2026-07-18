"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { clientSchema } from "@/lib/validation";
import type { Client } from "@/types";

export default function ClientDetailForm() {
  const params = useParams();
  const id = params.id as string;
  const [client, setClient] = useState<Client | null>(null);
  const [editing, setEditing] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
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
        .eq("id", id)
        .single();
      if (!cancelled && data) {
        setClient(data);
        setFormData({
          name: data.name,
          phone: data.phone || "",
          email: data.email || "",
          address: data.address || "",
          notes: data.notes || "",
        });
      }
    })();
    return () => { cancelled = true; };
  }, [id, supabase]);

  const refetch = async () => {
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("id", id)
      .single();
    if (data) {
      setClient(data);
      setFormData({
        name: data.name,
        phone: data.phone || "",
        email: data.email || "",
        address: data.address || "",
        notes: data.notes || "",
      });
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrors({});

    const result = clientSchema.safeParse(formData);
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

    const { error } = await supabase
      .from("clients")
      .update({
        name: formData.name,
        phone: formData.phone || null,
        email: formData.email || null,
        address: formData.address || null,
        notes: formData.notes || null,
      })
      .eq("id", id);

    if (error) {
      setErrors({ root: "Ошибка сохранения" });
      setLoading(false);
      return;
    }

    setEditing(false);
    await refetch();
    setLoading(false);
  };

  const handleDelete = async () => {
    if (!confirm("Удалить клиента?")) return;

    const { error } = await supabase.from("clients").delete().eq("id", id);

    if (!error) {
      router.push("/clients");
    }
  };

  if (!client) {
    return <div className="text-stone-500">Загрузка...</div>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-stone-800">{client.name}</h1>
        <div className="flex gap-3">
          <Button variant="secondary" onClick={() => setEditing(!editing)}>
            {editing ? "Отмена" : "Редактировать"}
          </Button>
          <Button variant="danger" onClick={handleDelete}>
            Удалить
          </Button>
        </div>
      </div>

      {editing ? (
        <Card>
          <CardContent>
            <form onSubmit={handleUpdate} className="space-y-4">
              <Input
                id="name"
                label="Имя *"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                error={errors.name}
                required
              />
              <Input
                id="phone"
                label="Телефон"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
              />
              <Input
                id="email"
                label="Email"
                type="email"
                value={formData.email}
                onChange={(e) =>
                  setFormData({ ...formData, email: e.target.value })
                }
              />
              <Input
                id="address"
                label="Адрес"
                value={formData.address}
                onChange={(e) =>
                  setFormData({ ...formData, address: e.target.value })
                }
              />
              <Textarea
                id="notes"
                label="Примечание"
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
              />
              {errors.root && (
                <p className="text-sm text-red-600">{errors.root}</p>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "Сохранение..." : "Сохранить"}
              </Button>
            </form>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-stone-500">Телефон</dt>
                <dd className="text-stone-800">{client.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-stone-500">Email</dt>
                <dd className="text-stone-800">{client.email || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-stone-500">Адрес</dt>
                <dd className="text-stone-800">{client.address || "—"}</dd>
              </div>
              <div>
                <dt className="text-sm text-stone-500">Примечание</dt>
                <dd className="text-stone-800">{client.notes || "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
