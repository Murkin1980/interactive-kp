"use client";

import React, { useState, useCallback } from "react";
import type { KpItem, KpItemVariant } from "@/types";
import { createClient } from "@/lib/supabase/client";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

interface ItemManagerProps {
  kpId: string;
  items: (KpItem & { variants: KpItemVariant[] })[];
  onItemsChange: (items: (KpItem & { variants: KpItemVariant[] })[]) => void;
}

interface ItemFormState {
  name: string;
  description: string;
  dimensions: string;
  quantity: number;
}

interface VariantFormState {
  name: string;
  material: string;
  hardware: string;
  description: string;
  price: number;
  is_default: boolean;
}

const EMPTY_ITEM_FORM: ItemFormState = {
  name: "",
  description: "",
  dimensions: "",
  quantity: 1,
};

const EMPTY_VARIANT_FORM: VariantFormState = {
  name: "",
  material: "",
  hardware: "",
  description: "",
  price: 0,
  is_default: false,
};

const MAX_ITEMS = 50;
const MAX_VARIANTS = 3;

export default function ItemManager({
  kpId,
  items,
  onItemsChange,
}: ItemManagerProps) {
  const supabase = createClient();

  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [addingVariantForItemId, setAddingVariantForItemId] = useState<
    string | null
  >(null );

  const [itemForm, setItemForm] = useState<ItemFormState>(EMPTY_ITEM_FORM);
  const [variantForm, setVariantForm] =
    useState<VariantFormState>(EMPTY_VARIANT_FORM);

  const [submitting, setSubmitting] = useState(false);

  const getMaxSortOrder = useCallback(
    () => (items.length > 0 ? Math.max(...items.map((i) => i.sort_order ?? 0)) + 1 : 0),
    [items]
  );

  const getMaxVariantSortOrder = useCallback(
    (itemId: string) => {
      const item = items.find((i) => i.id === itemId);
      if (!item || item.variants.length === 0) return 0;
      return Math.max(...item.variants.map((v) => v.sort_order ?? 0)) + 1;
    },
    [items]
  );

  const resetItemForm = () => {
    setItemForm({ ...EMPTY_ITEM_FORM });
    setAddingItem(false);
    setEditingItemId(null);
  };

  const resetVariantForm = () => {
    setVariantForm({ ...EMPTY_VARIANT_FORM });
    setAddingVariantForItemId(null);
    setEditingVariantId(null);
  };

  const showError = (message: string) => {
    console.error("[ItemManager]", message);
    alert(message);
  };

  const getErrorMessage = (err: unknown): string =>
    err instanceof Error ? err.message : String(err);

  /* ─── Item CRUD ─── */

  const handleAddItem = async () => {
    if (!itemForm.name.trim()) {
      showError("Введите название позиции");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("kp_items")
        .insert({
          kp_id: kpId,
          name: itemForm.name.trim(),
          description: itemForm.description.trim() || null,
          dimensions: itemForm.dimensions.trim() || null,
          quantity: itemForm.quantity,
          sort_order: getMaxSortOrder(),
        })
        .select()
        .single();

      if (error) throw error;

      onItemsChange([...items, { ...data, variants: [] }]);
      resetItemForm();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      showError(message || "Не удалось добавить позицию");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditItem = async (itemId: string) => {
    if (!itemForm.name.trim()) {
      showError("Введите название позиции");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("kp_items")
        .update({
          name: itemForm.name.trim(),
          description: itemForm.description.trim() || null,
          dimensions: itemForm.dimensions.trim() || null,
          quantity: itemForm.quantity,
        })
        .eq("id", itemId);

      if (error) throw error;

      onItemsChange(
        items.map((i) =>
          i.id === itemId
            ? {
                ...i,
                name: itemForm.name.trim(),
                description: itemForm.description.trim() || null,
                dimensions: itemForm.dimensions.trim() || null,
                quantity: itemForm.quantity,
              }
            : i
        )
      );
      resetItemForm();
    } catch (err: unknown) {
      showError(getErrorMessage(err) || "Не удалось обновить позицию");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    if (!confirm("Удалить позицию и все её варианты?")) return;
    setSubmitting(true);
    try {
      await supabase
        .from("kp_item_variants")
        .delete()
        .eq("item_id", itemId);

      const { error } = await supabase
        .from("kp_items")
        .delete()
        .eq("id", itemId);

      if (error) throw error;

      onItemsChange(items.filter((i) => i.id !== itemId));
      if (editingItemId === itemId) resetItemForm();
    } catch (err: unknown) {
      showError(getErrorMessage(err) || "Не удалось удалить позицию");
    } finally {
      setSubmitting(false);
    }
  };

  const handleMoveItem = async (itemId: string, direction: "up" | "down") => {
    const sorted = [...items].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
    const idx = sorted.findIndex((i) => i.id === itemId);
    if (idx < 0) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;

    const current = sorted[idx];
    const other = sorted[swapIdx];

    const currentOrder = current.sort_order ?? 0;
    const otherOrder = other.sort_order ?? 0;

    setSubmitting(true);
    try {
      await supabase
        .from("kp_items")
        .update({ sort_order: otherOrder })
        .eq("id", current.id);

      await supabase
        .from("kp_items")
        .update({ sort_order: currentOrder })
        .eq("id", other.id);

      const updated = sorted.map((i) => {
        if (i.id === current.id) return { ...i, sort_order: otherOrder };
        if (i.id === other.id) return { ...i, sort_order: currentOrder };
        return i;
      });
      onItemsChange(updated);
    } catch (err: unknown) {
      showError(getErrorMessage(err) || "Не удалось переместить позицию");
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Variant CRUD ─── */

  const handleAddVariant = async (itemId: string) => {
    if (!variantForm.name.trim()) {
      showError("Введите название варианта");
      return;
    }
    if (variantForm.price < 0) {
      showError("Цена не может быть отрицательной");
      return;
    }
    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from("kp_item_variants")
        .insert({
          item_id: itemId,
          name: variantForm.name.trim(),
          material: variantForm.material.trim() || null,
          hardware: variantForm.hardware.trim() || null,
          description: variantForm.description.trim() || null,
          price: variantForm.price,
          is_default: variantForm.is_default,
          sort_order: getMaxVariantSortOrder(itemId),
        })
        .select()
        .single();

      if (error) throw error;

      if (variantForm.is_default) {
        await supabase
          .from("kp_item_variants")
          .update({ is_default: false })
          .eq("item_id", itemId)
          .neq("id", data.id);

        onItemsChange(
          items.map((i) => {
            if (i.id !== itemId) return i;
            return {
              ...i,
              variants: [
                ...i.variants.map((v) => ({ ...v, is_default: false })),
                data,
              ],
            };
          })
        );
      } else {
        onItemsChange(
          items.map((i) =>
            i.id === itemId
              ? { ...i, variants: [...i.variants, data] }
              : i
          )
        );
      }
      resetVariantForm();
    } catch (err: unknown) {
      showError(getErrorMessage(err) || "Не удалось добавить вариант");
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditVariant = async (
    itemId: string,
    variantId: string
  ) => {
    if (!variantForm.name.trim()) {
      showError("Введите название варианта");
      return;
    }
    if (variantForm.price < 0) {
      showError("Цена не может быть отрицательной");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("kp_item_variants")
        .update({
          name: variantForm.name.trim(),
          material: variantForm.material.trim() || null,
          hardware: variantForm.hardware.trim() || null,
          description: variantForm.description.trim() || null,
          price: variantForm.price,
          is_default: variantForm.is_default,
        })
        .eq("id", variantId);

      if (error) throw error;

      if (variantForm.is_default) {
        await supabase
          .from("kp_item_variants")
          .update({ is_default: false })
          .eq("item_id", itemId)
          .neq("id", variantId);
      }

      onItemsChange(
        items.map((i) => {
          if (i.id !== itemId) return i;
          return {
            ...i,
            variants: i.variants.map((v) => {
              if (v.id !== variantId)
                return variantForm.is_default
                  ? { ...v, is_default: false }
                  : v;
              return {
                ...v,
                name: variantForm.name.trim(),
                material: variantForm.material.trim() || null,
                hardware: variantForm.hardware.trim() || null,
                description: variantForm.description.trim() || null,
                price: variantForm.price,
                is_default: variantForm.is_default,
              };
            }),
          };
        })
      );
      resetVariantForm();
    } catch (err: unknown) {
      showError(getErrorMessage(err) || "Не удалось обновить вариант");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteVariant = async (
    itemId: string,
    variantId: string
  ) => {
    if (!confirm("Удалить вариант?")) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("kp_item_variants")
        .delete()
        .eq("id", variantId);

      if (error) throw error;

      onItemsChange(
        items.map((i) =>
          i.id === itemId
            ? { ...i, variants: i.variants.filter((v) => v.id !== variantId) }
            : i
        )
      );
      if (editingVariantId === variantId) resetVariantForm();
    } catch (err: unknown) {
      showError(getErrorMessage(err) || "Не удалось удалить вариант");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (
    itemId: string,
    variantId: string
  ) => {
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("kp_item_variants")
        .update({ is_default: true })
        .eq("id", variantId);

      if (error) throw error;

      await supabase
        .from("kp_item_variants")
        .update({ is_default: false })
        .eq("item_id", itemId)
        .neq("id", variantId);

      onItemsChange(
        items.map((i) => {
          if (i.id !== itemId) return i;
          return {
            ...i,
            variants: i.variants.map((v) => ({
              ...v,
              is_default: v.id === variantId,
            })),
          };
        })
      );
    } catch (err: unknown) {
      showError(getErrorMessage(err) || "Не удалось изменить вариант по умолчанию");
    } finally {
      setSubmitting(false);
    }
  };

  /* ─── Render helpers ─── */

  const sortedItems = [...items].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)
  );

  const renderItemForm = (
    form: ItemFormState,
    onChange: (f: ItemFormState) => void,
    onSubmit: () => void,
    onCancel: () => void,
    label: string
  ) => (
    <div className="space-y-3 p-4 rounded-xl bg-stone-50 border border-stone-200">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Название *
          </label>
          <Input
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="Название позиции"
            className="border-stone-200 focus:border-amber-400 focus:ring-amber-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Размеры
          </label>
          <Input
            value={form.dimensions}
            onChange={(e) =>
              onChange({ ...form, dimensions: e.target.value })
            }
            placeholder='2400 × 1200 × 600 мм'
            className="border-stone-200 focus:border-amber-400 focus:ring-amber-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Количество
          </label>
          <Input
            type="number"
            min={1}
            value={form.quantity}
            onChange={(e) =>
              onChange({
                ...form,
                quantity: Math.max(1, parseInt(e.target.value) || 1),
              })
            }
            className="border-stone-200 focus:border-amber-400 focus:ring-amber-400"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Описание
          </label>
          <Textarea
            value={form.description}
            onChange={(e) =>
              onChange({ ...form, description: e.target.value })
            }
            placeholder="Описание позиции..."
            rows={2}
            className="border-stone-200 focus:border-amber-400 focus:ring-amber-400 resize-none"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-stone-500 hover:text-stone-700"
        >
          Отмена
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={submitting}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          {submitting ? "Сохранение..." : label}
        </Button>
      </div>
    </div>
  );

  const renderVariantForm = (
    form: VariantFormState,
    onChange: (f: VariantFormState) => void,
    onSubmit: () => void,
    onCancel: () => void,
    label: string
  ) => (
    <div className="space-y-3 p-3 rounded-lg bg-amber-50/50 border border-amber-100">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Название *
          </label>
          <Input
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="Название варианта"
            className="border-stone-200 focus:border-amber-400 focus:ring-amber-400 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Материал
          </label>
          <Input
            value={form.material}
            onChange={(e) =>
              onChange({ ...form, material: e.target.value })
            }
            placeholder="ДСП, МДФ..."
            className="border-stone-200 focus:border-amber-400 focus:ring-amber-400 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Фурнитура
          </label>
          <Input
            value={form.hardware}
            onChange={(e) =>
              onChange({ ...form, hardware: e.target.value })
            }
            placeholder="Blum, Hettich..."
            className="border-stone-200 focus:border-amber-400 focus:ring-amber-400 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Цена *
          </label>
          <Input
            type="number"
            min={0}
            step={0.01}
            value={form.price || ""}
            onChange={(e) =>
              onChange({
                ...form,
                price: parseFloat(e.target.value) || 0,
              })
            }
            placeholder="0.00"
            className="border-stone-200 focus:border-amber-400 focus:ring-amber-400 text-sm"
          />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer">
            <input
              type="checkbox"
              checked={form.is_default}
              onChange={(e) =>
                onChange({ ...form, is_default: e.target.checked })
              }
              className="rounded border-stone-300 text-amber-500 focus:ring-amber-400"
            />
            По умолчанию
          </label>
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-stone-600 mb-1">
            Описание
          </label>
          <Textarea
            value={form.description}
            onChange={(e) =>
              onChange({ ...form, description: e.target.value })
            }
            placeholder="Описание варианта..."
            rows={2}
            className="border-stone-200 focus:border-amber-400 focus:ring-amber-400 text-sm resize-none"
          />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          className="text-stone-500 hover:text-stone-700"
        >
          Отмена
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onSubmit}
          disabled={submitting}
          className="bg-amber-500 hover:bg-amber-600 text-white"
        >
          {submitting ? "Сохранение..." : label}
        </Button>
      </div>
    </div>
  );

  /* ─── Main render ─── */

  return (
    <div className="space-y-3">
      {sortedItems.length === 0 && !addingItem && (
        <div className="text-center py-8 text-stone-400">
          Нет позиций. Добавьте первую позицию ниже.
        </div>
      )}

      {sortedItems.map((item, index) => {
        const isEditing = editingItemId === item.id;
        const isAddingVariant = addingVariantForItemId === item.id;

        return (
          <Card
            key={item.id}
            className="border-stone-200 bg-white shadow-sm overflow-hidden"
          >
            <CardHeader className="flex flex-row items-center justify-between p-4 pb-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex flex-col gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-stone-400 hover:text-stone-700"
                    disabled={submitting || index === 0}
                    onClick={() => handleMoveItem(item.id, "up")}
                    title="Переместить вверх"
                  >
                    ▲
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-stone-400 hover:text-stone-700"
                    disabled={
                      submitting || index === sortedItems.length - 1
                    }
                    onClick={() => handleMoveItem(item.id, "down")}
                    title="Переместить вниз"
                  >
                    ▼
                  </Button>
                </div>

                {isEditing ? null : (
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-stone-800 truncate">
                      {item.name}
                    </h3>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-500">
                      {item.dimensions && <span>{item.dimensions}</span>}
                      <span>Кол-во: {item.quantity}</span>
                    </div>
                  </div>
                )}
              </div>

              {!isEditing && (
                <div className="flex gap-1 shrink-0">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-stone-500 hover:text-amber-600"
                    disabled={submitting}
                    onClick={() => {
                      setEditingItemId(item.id);
                      setItemForm({
                        name: item.name,
                        description: item.description || "",
                        dimensions: item.dimensions || "",
                        quantity: item.quantity ?? 1,
                      });
                    }}
                  >
                    ✎
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-stone-500 hover:text-red-500"
                    disabled={submitting}
                    onClick={() => handleDeleteItem(item.id)}
                  >
                    ✕
                  </Button>
                </div>
              )}
            </CardHeader>

            <CardContent className="px-4 pb-4 pt-0">
              {isEditing
                ? renderItemForm(
                    itemForm,
                    setItemForm,
                    () => handleEditItem(item.id),
                    resetItemForm,
                    "Сохранить"
                  )
                : null}

              <div className="space-y-2 mt-2">
                {item.variants.length > 0 && (
                  <div className="text-xs font-medium text-stone-500 uppercase tracking-wide">
                    Варианты
                  </div>
                )}

                {[...item.variants]
                  .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map((variant) => {
                    const isEditingVariant =
                      editingVariantId === variant.id;

                    return (
                      <div
                        key={variant.id}
                        className={`flex items-start justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                          variant.is_default
                            ? "bg-amber-50 border border-amber-200"
                            : "bg-stone-50 border border-stone-100"
                        }`}
                      >
                        {isEditingVariant ? (
                          <div className="w-full">
                            {renderVariantForm(
                              variantForm,
                              setVariantForm,
                              () => handleEditVariant(item.id, variant.id),
                              resetVariantForm,
                              "Сохранить"
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-stone-700 truncate">
                                  {variant.name}
                                </span>
                                {variant.is_default && (
                                  <span
                                    className="text-amber-500 text-xs font-semibold"
                                    title="Вариант по умолчанию"
                                  >
                                    ✓
                                  </span>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-stone-500 mt-0.5">
                                {variant.material && (
                                  <span>{variant.material}</span>
                                )}
                                {variant.hardware && (
                                  <span>{variant.hardware}</span>
                                )}
                                <span className="font-semibold text-stone-700">
                                  {variant.price.toLocaleString("ru-RU", {
                                    style: "currency",
                                    currency: "KZT",
                                    minimumFractionDigits: 0,
                                  })}
                                </span>
                              </div>
                              {variant.description && (
                                <p className="text-xs text-stone-400 mt-1 line-clamp-2">
                                  {variant.description}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 shrink-0 ml-2">
                              {!variant.is_default && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 text-xs text-stone-400 hover:text-amber-600"
                                  disabled={submitting}
                                  onClick={() =>
                                    handleSetDefault(item.id, variant.id)
                                  }
                                  title="Сделать по умолчанию"
                                >
                                  ☆
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-stone-400 hover:text-amber-600"
                                disabled={submitting}
                                onClick={() => {
                                  setEditingVariantId(variant.id);
                                  setVariantForm({
                                    name: variant.name,
                                    material: variant.material || "",
                                    hardware: variant.hardware || "",
                                    description: variant.description || "",
                                    price: variant.price ?? 0,
                                    is_default: variant.is_default,
                                  });
                                }}
                              >
                                ✎
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs text-stone-400 hover:text-red-500"
                                disabled={submitting}
                                onClick={() =>
                                  handleDeleteVariant(item.id, variant.id)
                                }
                              >
                                ✕
                              </Button>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}

                {isAddingVariant
                  ? renderVariantForm(
                      variantForm,
                      setVariantForm,
                      () => handleAddVariant(item.id),
                      resetVariantForm,
                      "Добавить"
                    )
                  : null}
              </div>

              {!isEditing && !isAddingVariant && (
                <div className="mt-3 pt-3 border-t border-stone-100 flex justify-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 text-xs"
                    disabled={
                      submitting || item.variants.length >= MAX_VARIANTS
                    }
                    onClick={() => {
                      setAddingVariantForItemId(item.id);
                      setEditingVariantId(null);
                      setVariantForm({ ...EMPTY_VARIANT_FORM });
                    }}
                  >
                    + Добавить вариант
                    {item.variants.length >= MAX_VARIANTS
                      ? ` (макс. ${MAX_VARIANTS})`
                      : ` (${item.variants.length}/${MAX_VARIANTS})`}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}

      {addingItem
        ? renderItemForm(
            itemForm,
            setItemForm,
            handleAddItem,
            resetItemForm,
            "Добавить"
          )
        : null}

      {!addingItem && items.length < MAX_ITEMS && (
        <Button
          type="button"
          variant="secondary"
          className="w-full border-dashed border-stone-300 text-stone-500 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50"
          disabled={submitting}
          onClick={() => {
            setAddingItem(true);
            setEditingItemId(null);
            resetVariantForm();
            setItemForm({ ...EMPTY_ITEM_FORM });
          }}
        >
          + Добавить позицию
        </Button>
      )}
    </div>
  );
}
