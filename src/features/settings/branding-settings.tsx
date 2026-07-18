"use client";

import { useEffect, useState } from "react";
import { Building2, ImageIcon, ShieldCheck } from "lucide-react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";

type BrandingForm = {
  id: string;
  name: string;
  logo_url: string;
  pdf_watermark_text: string;
  brand_primary_color: string;
};

export default function BrandingSettings() {
  const supabase = createClient();
  const [form, setForm] = useState<BrandingForm | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: membership, error: membershipError } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (!active) return;
      if (membershipError || !membership) {
        setMessage("Не удалось определить компанию для текущего аккаунта.");
        return;
      }
      const { data, error } = await supabase
        .from("organizations")
        .select("id,name,logo_url,pdf_watermark_text,brand_primary_color")
        .eq("id", membership.organization_id)
        .single();
      if (!active) return;
      if (error) setMessage(error.message);
      else setForm({ ...data, logo_url: data.logo_url || "", pdf_watermark_text: data.pdf_watermark_text || "" });
    })();
    return () => { active = false; };
  }, [supabase]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setMessage("");
    const { error } = await supabase.from("organizations").update({
      name: form.name.trim(),
      logo_url: form.logo_url.trim() || null,
      pdf_watermark_text: form.pdf_watermark_text.trim() || null,
      brand_primary_color: form.brand_primary_color,
      updated_at: new Date().toISOString(),
    }).eq("id", form.id);
    setSaving(false);
    setMessage(error ? error.message : "Настройки компании сохранены.");
  };

  return <AppLayout>
    <div className="mx-auto max-w-3xl">
      <p className="text-xs font-semibold uppercase tracking-[.24em] text-[#702f35]">Neo Deco · фирменный профиль</p>
      <h1 className="mt-2 text-3xl font-semibold text-[#14263d]">Настройки компании</h1>
      <p className="mt-2 text-sm text-slate-600">Эти данные отображаются в клиентском КП и защищённом PDF.</p>

      {!form ? <div className="mt-8 border border-[#c8d6db] bg-white p-6 text-sm text-slate-600">{message || "Загрузка настроек…"}</div> :
      <form onSubmit={save} className="mt-8 space-y-8 border border-[#c8d6db] bg-[#fdfbf5] p-6 shadow-[0_24px_70px_rgba(20,38,61,.08)] md:p-8">
        <section>
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#14263d]"><Building2 size={19}/> Компания</h2>
          <Input label="Название компании" value={form.name} required onChange={(e) => setForm({...form,name:e.target.value})}/>
        </section>
        <section className="border-t border-[#c8d6db] pt-7">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#14263d]"><ImageIcon size={19}/> Логотип</h2>
          <Input type="url" label="Прямая HTTPS-ссылка на логотип" placeholder="https://…/logo.png" value={form.logo_url} onChange={(e) => setForm({...form,logo_url:e.target.value})}/>
          <p className="mt-2 text-xs text-slate-500">Лучше использовать PNG с прозрачным фоном. Загрузка файла появится в следующем обновлении.</p>
        </section>
        <section className="border-t border-[#c8d6db] pt-7">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-[#14263d]"><ShieldCheck size={19}/> Защита PDF</h2>
          <Input label="Текст водяного знака" placeholder={form.name} value={form.pdf_watermark_text} onChange={(e) => setForm({...form,pdf_watermark_text:e.target.value})}/>
          <div className="mt-4 flex items-center gap-4">
            <label className="text-sm font-medium text-stone-700" htmlFor="brand-color">Фирменный цвет</label>
            <input id="brand-color" type="color" value={form.brand_primary_color} onChange={(e) => setForm({...form,brand_primary_color:e.target.value})} className="h-11 w-20 cursor-pointer border border-[#c8d6db] bg-white p-1"/>
            <code className="text-sm text-slate-500">{form.brand_primary_color}</code>
          </div>
        </section>
        {message && <p className="text-sm text-[#702f35]">{message}</p>}
        <Button disabled={saving}>{saving ? "Сохранение…" : "Сохранить настройки"}</Button>
      </form>}
    </div>
  </AppLayout>;
}
