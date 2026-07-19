"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KpOptionGroup } from "@/types";

const money = new Intl.NumberFormat("ru-RU");

export default function OptionManager({ itemId, readOnly }: { itemId: string; readOnly: boolean }) {
  const supabase = createClient();
  const [groups, setGroups] = useState<KpOptionGroup[]>([]);
  const [groupName, setGroupName] = useState("");
  const [addOnDraft, setAddOnDraft] = useState({ name: "", price: "" });
  const [valueDrafts, setValueDrafts] = useState<Record<string, { name: string; brand: string; price: string }>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("kp_option_groups")
      .select("*, values:kp_option_values(*)")
      .eq("item_id", itemId)
      .order("sort_order");
    if (error) throw error;
    setGroups((data ?? []) as KpOptionGroup[]);
  }, [itemId, supabase]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from("kp_option_groups")
        .select("*, values:kp_option_values(*)")
        .eq("item_id", itemId)
        .order("sort_order");
      if (error) console.error("[OptionManager]", error);
      else if (!cancelled) setGroups((data ?? []) as KpOptionGroup[]);
    })();
    return () => { cancelled = true; };
  }, [itemId, supabase]);

  const addGroup = async () => {
    const name = groupName.trim();
    if (!name) return;
    setBusy(true);
    const slugBase = name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "");
    const slug = `${slugBase || "option"}-${Date.now().toString(36)}`.replace(/[а-я]/gi, "opt").slice(0, 50);
    const { error } = await supabase.from("kp_option_groups").insert({ item_id: itemId, name, slug, sort_order: groups.length });
    if (error) alert(error.message); else { setGroupName(""); await load(); }
    setBusy(false);
  };

  const addValue = async (group: KpOptionGroup) => {
    const draft = valueDrafts[group.id];
    if (!draft?.name.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("kp_option_values").insert({
      group_id: group.id,
      name: draft.name.trim(),
      brand: draft.brand.trim() || null,
      price_delta: Number(draft.price) || 0,
      is_default: group.values.length === 0,
      sort_order: group.values.length,
    });
    if (error) alert(error.message); else { setValueDrafts((current) => ({ ...current, [group.id]: { name: "", brand: "", price: "" } })); await load(); }
    setBusy(false);
  };

  const addSimpleAddOn = async () => {
    const name = addOnDraft.name.trim();
    const price = Number(addOnDraft.price);
    if (!name || !Number.isFinite(price) || price <= 0) return;
    setBusy(true);
    const slug = `addon-${Date.now().toString(36)}`;
    const { data: group, error: groupError } = await supabase
      .from("kp_option_groups")
      .insert({ item_id: itemId, name, slug, is_required: false, sort_order: groups.length })
      .select("id")
      .single();
    if (groupError || !group) {
      alert(groupError?.message || "Не удалось создать дополнительную опцию");
      setBusy(false);
      return;
    }
    const { error: valuesError } = await supabase.from("kp_option_values").insert([
      { group_id: group.id, name: `Без ${name.toLocaleLowerCase("ru-RU")}`, price_delta: 0, is_default: true, sort_order: 0 },
      { group_id: group.id, name, price_delta: price, is_default: false, sort_order: 1 },
    ]);
    if (valuesError) {
      await supabase.from("kp_option_groups").delete().eq("id", group.id);
      alert(valuesError.message);
    } else {
      setAddOnDraft({ name: "", price: "" });
      await load();
    }
    setBusy(false);
  };

  const removeGroup = async (id: string) => {
    if (!confirm("Удалить группу и все её варианты?")) return;
    const { error } = await supabase.from("kp_option_groups").delete().eq("id", id);
    if (error) alert(error.message); else await load();
  };

  return (
    <section className="mt-5 border-t border-[#c8d6db] pt-5">
      <div className="mb-3 flex items-center justify-between">
        <div><h4 className="font-semibold text-[#14263d]">Дополнительный выбор клиента</h4><p className="text-xs text-slate-500">Опции и доплаты сверх готовой цены позиции</p></div>
      </div>
      {!readOnly && <div className="mb-5 border border-[#c2a46d]/50 bg-[#f7f2e8] p-4">
        <div className="mb-3"><b className="text-sm text-[#14263d]">Быстро добавить доплату</b><p className="mt-1 text-xs leading-5 text-slate-600">Для подсветки, каменной столешницы и других независимых дополнений. Клиент сможет нажать опцию, а сумма сразу добавится к итогу.</p></div>
        <div className="grid gap-2 sm:grid-cols-[1fr_160px_auto]">
          <Input placeholder="Например: Подсветка" value={addOnDraft.name} onChange={(e) => setAddOnDraft((current) => ({ ...current, name: e.target.value }))}/>
          <Input type="number" min="1" placeholder="Доплата, ₸" value={addOnDraft.price} onChange={(e) => setAddOnDraft((current) => ({ ...current, price: e.target.value }))}/>
          <Button type="button" disabled={busy || !addOnDraft.name.trim() || Number(addOnDraft.price) <= 0} onClick={() => void addSimpleAddOn()}>Добавить доплату</Button>
        </div>
      </div>}
      <div className="mb-4 bg-[#e6edef] p-3 text-xs leading-5 text-[#405465]">
        <b>Сложный выбор:</b> нижняя форма нужна, когда варианты взаимоисключающие — например, «Цвет фасадов» с вариантами «Белый» и «Красный». Сначала создайте вопрос, затем обязательно добавьте внутрь не менее двух вариантов.
      </div>
      <div className="space-y-3">
        {groups.map((group) => {
          const draft = valueDrafts[group.id] ?? { name: "", brand: "", price: "" };
          return <div key={group.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-center justify-between"><b className="text-sm text-stone-700">{group.name}</b>{!readOnly && <button type="button" onClick={() => void removeGroup(group.id)} className="text-xs text-red-500 hover:text-red-700">Удалить</button>}</div>
            {group.values.length === 0 && <p className="mt-2 border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Добавьте варианты ниже — пока клиенту нечего выбирать и доплата не участвует в расчёте.</p>}
            <div className="mt-2 flex flex-wrap gap-2">{group.values.sort((a,b) => a.sort_order-b.sort_order).map((value) => <span key={value.id} className={`rounded-full border px-3 py-1.5 text-xs ${value.is_default ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"}`}>{value.name}{value.brand ? ` · ${value.brand}` : ""}{value.price_delta > 0 ? ` +${money.format(value.price_delta)} ₸` : ""}</span>)}</div>
            {!readOnly && <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_130px_auto]">
              <Input placeholder="Например: Красные фасады" value={draft.name} onChange={(e) => setValueDrafts((c) => ({ ...c, [group.id]: { ...draft, name: e.target.value } }))} />
              <Input placeholder="Материал или бренд" value={draft.brand} onChange={(e) => setValueDrafts((c) => ({ ...c, [group.id]: { ...draft, brand: e.target.value } }))} />
              <Input type="number" min="0" placeholder="Доплата, ₸" value={draft.price} onChange={(e) => setValueDrafts((c) => ({ ...c, [group.id]: { ...draft, price: e.target.value } }))} />
              <Button type="button" size="sm" disabled={busy} onClick={() => void addValue(group)}>Добавить</Button>
            </div>}
          </div>;
        })}
      </div>
      {!readOnly && <div className="mt-3 flex gap-2"><Input placeholder="Вопрос клиенту, например: Цвет фасадов" value={groupName} onChange={(e) => setGroupName(e.target.value)} /><Button type="button" variant="secondary" disabled={busy || !groupName.trim()} onClick={() => void addGroup()}>Создать группу вариантов</Button></div>}
    </section>
  );
}
