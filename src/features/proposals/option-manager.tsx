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

  const removeGroup = async (id: string) => {
    if (!confirm("Удалить группу и все её варианты?")) return;
    const { error } = await supabase.from("kp_option_groups").delete().eq("id", id);
    if (error) alert(error.message); else await load();
  };

  return (
    <section className="mt-5 border-t border-stone-200 pt-4">
      <div className="mb-3 flex items-center justify-between">
        <div><h4 className="font-semibold text-stone-800">Комплектация</h4><p className="text-xs text-stone-500">Фасады, фурнитура, столешница и другие опции</p></div>
      </div>
      <div className="space-y-3">
        {groups.map((group) => {
          const draft = valueDrafts[group.id] ?? { name: "", brand: "", price: "" };
          return <div key={group.id} className="rounded-lg border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-center justify-between"><b className="text-sm text-stone-700">{group.name}</b>{!readOnly && <button type="button" onClick={() => void removeGroup(group.id)} className="text-xs text-red-500 hover:text-red-700">Удалить</button>}</div>
            <div className="mt-2 flex flex-wrap gap-2">{group.values.sort((a,b) => a.sort_order-b.sort_order).map((value) => <span key={value.id} className={`rounded-full border px-3 py-1.5 text-xs ${value.is_default ? "border-amber-300 bg-amber-50" : "border-stone-200 bg-white"}`}>{value.name}{value.brand ? ` · ${value.brand}` : ""}{value.price_delta > 0 ? ` +${money.format(value.price_delta)} ₸` : ""}</span>)}</div>
            {!readOnly && <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_130px_auto]">
              <Input placeholder="Вариант" value={draft.name} onChange={(e) => setValueDrafts((c) => ({ ...c, [group.id]: { ...draft, name: e.target.value } }))} />
              <Input placeholder="Бренд" value={draft.brand} onChange={(e) => setValueDrafts((c) => ({ ...c, [group.id]: { ...draft, brand: e.target.value } }))} />
              <Input type="number" min="0" placeholder="Доплата" value={draft.price} onChange={(e) => setValueDrafts((c) => ({ ...c, [group.id]: { ...draft, price: e.target.value } }))} />
              <Button type="button" size="sm" disabled={busy} onClick={() => void addValue(group)}>+Вариант</Button>
            </div>}
          </div>;
        })}
      </div>
      {!readOnly && <div className="mt-3 flex gap-2"><Input placeholder="Новая группа, например «Фурнитура»" value={groupName} onChange={(e) => setGroupName(e.target.value)} /><Button type="button" variant="secondary" disabled={busy || !groupName.trim()} onClick={() => void addGroup()}>Добавить группу</Button></div>}
    </section>
  );
}
