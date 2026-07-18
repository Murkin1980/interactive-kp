"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Kp, KpItem, KpItemVariant } from "@/types";

type KpWithVariants = Kp & {
  items: (KpItem & { variants: KpItemVariant[] })[];
};

type PublicKpData = Omit<Kp, "client_id" | "public_token" | "owner_id"> & {
  items: (KpItem & { variants: KpItemVariant[] })[];
};

export default function PublicProposalView() {
  const params = useParams();
  const token = params?.token as string;
  const supabase = createClient();

  const [proposal, setProposal] = useState<KpWithVariants | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [confirmed, setConfirmed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    client_name: "",
    client_phone: "",
    comment: "",
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!token) {
        if (!cancelled) {
          setNotFound(true);
          setLoading(false);
        }
        return;
      }

      // Use secure RPC to fetch KP data
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        "get_public_kp",
        { p_token: token }
      );

      if (!cancelled && rpcError) {
        setLoadError("Ошибка загрузки: " + rpcError.message);
        setLoading(false);
        return;
      }

      if (!cancelled && !rpcData) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (!cancelled && rpcData) {
        const kpData = rpcData as PublicKpData;

        // Check expiry
        const isExpired =
          kpData.valid_until && new Date(kpData.valid_until) < new Date();
        if (isExpired) {
          setExpired(true);
        }

        if (kpData.status === "confirmed") {
          setConfirmed(true);
        }

        // Mark as viewed via RPC (idempotent)
        if (kpData.status === "sent") {
          await supabase.rpc("mark_kp_viewed", { p_token: token });
          kpData.status = "viewed";
        }

        // Build typed items with variants
        const typedItems = (kpData.items ?? []) as (KpItem & {
          variants: KpItemVariant[];
        })[];

        // For confirmed KPs, try to restore previously selected variants
        let initialVariants: Record<string, string> = {};

        if (kpData.status === "confirmed") {
          const { data: confirmationData } = await supabase
            .from("kp_confirmations")
            .select("selected_variants")
            .eq("kp_id", kpData.id)
            .order("confirmed_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (confirmationData?.selected_variants) {
            initialVariants = confirmationData.selected_variants as Record<
              string,
              string
            >;
          }
        }

        // Fall back to default variants
        if (Object.keys(initialVariants).length === 0) {
          for (const item of typedItems) {
            const defaultVar = item.variants.find((v) => v.is_default);
            if (defaultVar) {
              initialVariants[item.id] = defaultVar.id;
            } else if (item.variants.length > 0) {
              initialVariants[item.id] = item.variants[0].id;
            }
          }
        }

        if (!cancelled) {
          setProposal({
            ...kpData,
            items: typedItems,
            client_id: null,
            public_token: token,
            owner_id: "",
          } as KpWithVariants);
          setSelectedVariants(initialVariants);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, supabase]);

  // Client-side calculation for display (server recalculates on confirm)
  const calculation = proposal
    ? calculateClientSide(proposal, selectedVariants)
    : null;

  const handleVariantChange = (itemId: string, variantId: string) => {
    if (confirmed || expired) return;
    setSelectedVariants((prev) => ({ ...prev, [itemId]: variantId }));
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposal || confirming || expired) return;

    // Validate all items have selections
    const allSelected = proposal.items.every(
      (item) => selectedVariants[item.id]
    );
    if (!allSelected) {
      setSubmitError("Выберите вариант в каждой позиции");
      return;
    }

    setConfirming(true);
    setSubmitError(null);

    const { data, error } = await supabase.rpc("confirm_public_kp", {
      p_token: token,
      p_client_name: formData.client_name || null,
      p_client_phone: formData.client_phone || null,
      p_comment: formData.comment || null,
      p_selected_variants: selectedVariants,
    });

    if (error) {
      setSubmitError("Ошибка отправки: " + error.message);
      setConfirming(false);
      return;
    }

    const result = data as {
      success: boolean;
      already_confirmed?: boolean;
      confirmed_at?: string;
      selected_total?: number;
    };

    if (result?.success) {
      setConfirmed(true);
    } else {
      setSubmitError("Неожиданный ответ сервера");
    }

    setConfirming(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-amber-600 border-t-transparent" />
          <p className="text-sm text-stone-500">Загрузка...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent>
            <div className="mb-4 text-5xl">⚠️</div>
            <h1 className="mb-2 text-xl font-bold text-stone-800">
              Ошибка загрузки
            </h1>
            <p className="text-sm text-stone-500">{loadError}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent>
            <div className="mb-4 text-5xl">📋</div>
            <h1 className="mb-2 text-xl font-bold text-stone-800">
              КП не найдено
            </h1>
            <p className="text-sm text-stone-500">
              Предложение не найдено или ссылка устарела. Пожалуйста,
              обратитесь к вашему менеджеру за актуальной ссылкой.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!proposal) return null;

  return (
    <div className="min-h-screen bg-stone-100 px-4 py-8">
      <div className="mx-auto max-w-2xl space-y-6">
        {/* Expired banner */}
        {expired && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-center">
            <p className="text-sm font-medium text-red-800">
              Срок действия данного коммерческого предложения истёк.
              Подтверждение невозможно.
            </p>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold text-stone-800">
                  {proposal.project_name}
                </h1>
                <p className="text-sm text-stone-500">
                  №{proposal.number}
                </p>
              </div>
              {confirmed && (
                <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                  Подтверждено
                </span>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-stone-500">Клиент:</span>
                <span className="font-medium text-stone-800">
                  {proposal.client_name}
                </span>
              </div>
              {proposal.valid_until && (
                <div className="flex justify-between">
                  <span className="text-stone-500">Действует до:</span>
                  <span className="font-medium text-stone-800">
                    {formatDate(proposal.valid_until)}
                  </span>
                </div>
              )}
              {proposal.notes && (
                <div className="mt-3 rounded-lg bg-stone-50 p-3">
                  <span className="text-xs font-medium text-stone-500">
                    Примечание
                  </span>
                  <p className="mt-1 text-sm text-stone-700">
                    {proposal.notes}
                  </p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-stone-800">
              Состав предложения
            </h2>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {proposal.items.map((item) => (
                <div
                  key={item.id}
                  className="space-y-3 rounded-lg border border-stone-200 p-4"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold text-stone-800">
                        {item.name}
                      </h3>
                      {item.description && (
                        <p className="mt-0.5 text-xs text-stone-500">
                          {item.description}
                        </p>
                      )}
                      {item.dimensions && (
                        <p className="mt-0.5 text-xs text-stone-400">
                          {item.dimensions}
                        </p>
                      )}
                    </div>
                    <span className="ml-3 text-xs text-stone-500">
                      ×{item.quantity}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {item.variants.map((variant) => (
                      <label
                        key={variant.id}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
                          selectedVariants[item.id] === variant.id
                            ? "border-amber-500 bg-amber-50"
                            : "border-stone-200 bg-white hover:bg-stone-50"
                        } ${confirmed || expired ? "pointer-events-none opacity-70" : ""}`}
                      >
                        <input
                          type="radio"
                          name={`item-${item.id}`}
                          value={variant.id}
                          checked={selectedVariants[item.id] === variant.id}
                          onChange={() =>
                            handleVariantChange(item.id, variant.id)
                          }
                          disabled={confirmed || expired}
                          className="h-4 w-4 border-stone-300 text-amber-600 focus:ring-amber-500"
                        />
                        <div className="flex-1">
                          <div className="flex items-baseline justify-between">
                            <span className="text-sm font-medium text-stone-800">
                              {variant.name}
                            </span>
                            <span className="text-sm font-semibold text-amber-700">
                              {formatCurrency(variant.price)}
                            </span>
                          </div>
                          <div className="mt-0.5 flex gap-3 text-xs text-stone-500">
                            {variant.material && (
                              <span>{variant.material}</span>
                            )}
                            {variant.hardware && (
                              <span>{variant.hardware}</span>
                            )}
                          </div>
                          {variant.description && (
                            <p className="mt-0.5 text-xs text-stone-400">
                              {variant.description}
                            </p>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>

                  {selectedVariants[item.id] && (
                    <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-sm">
                      <span className="text-stone-500">
                        {item.quantity} шт. ×{" "}
                        {formatCurrency(
                          item.variants.find(
                            (v) => v.id === selectedVariants[item.id]
                          )?.price ?? 0
                        )}
                      </span>
                      <span className="font-medium text-stone-800">
                        {formatCurrency(
                          (item.variants.find(
                            (v) => v.id === selectedVariants[item.id]
                          )?.price ?? 0) * item.quantity
                        )}
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {calculation && (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-stone-800">
                Итого
              </h2>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">Сумма</span>
                  <span className="text-stone-800">
                    {formatCurrency(calculation.subtotal)}
                  </span>
                </div>
                {calculation.discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-stone-500">
                      Скидка
                      {proposal.discount_type === "percent"
                        ? ` (${proposal.discount_value}%)`
                        : ""}
                    </span>
                    <span className="text-green-600">
                      −{formatCurrency(calculation.discountAmount)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between border-t border-stone-200 pt-2 text-base font-semibold">
                  <span className="text-stone-800">Итого</span>
                  <span className="text-stone-800">
                    {formatCurrency(calculation.total)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">
                    Аванс ({proposal.advance_percent}%)
                  </span>
                  <span className="text-amber-700">
                    {formatCurrency(calculation.advance)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-500">
                    Остаток
                    {proposal.balance_condition
                      ? ` (${proposal.balance_condition})`
                      : ""}
                  </span>
                  <span className="text-stone-700">
                    {formatCurrency(calculation.balance)}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!confirmed && !expired ? (
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-stone-800">
                Подтверждение
              </h2>
              <p className="text-sm text-stone-500">
                Заполните данные для подтверждения заказа
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleConfirm} className="space-y-4">
                <Input
                  id="client_name"
                  label="Ваше имя"
                  value={formData.client_name}
                  onChange={(e) =>
                    setFormData({ ...formData, client_name: e.target.value })
                  }
                  placeholder="Иван Иванов"
                />
                <Input
                  id="client_phone"
                  label="Телефон"
                  type="tel"
                  value={formData.client_phone}
                  onChange={(e) =>
                    setFormData({ ...formData, client_phone: e.target.value })
                  }
                  placeholder="+7 (___) ___-__-__"
                />
                <Textarea
                  id="comment"
                  label="Комментарий"
                  value={formData.comment}
                  onChange={(e) =>
                    setFormData({ ...formData, comment: e.target.value })
                  }
                  placeholder="Пожелания, вопросы, замечания..."
                />
                {submitError && (
                  <p className="text-sm text-red-600">{submitError}</p>
                )}
                <Button
                  type="submit"
                  size="lg"
                  disabled={confirming}
                  className="w-full"
                >
                  {confirming
                    ? "Отправка..."
                    : `Подтвердить — ${calculation ? formatCurrency(calculation.total) : ""}`}
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent>
              <div className="py-6 text-center">
                <div className="mb-4 text-5xl">✅</div>
                <h2 className="mb-2 text-xl font-bold text-stone-800">
                  {confirmed ? "Заказ подтверждён!" : "Срок действия истёк"}
                </h2>
                <p className="text-sm text-stone-500">
                  {confirmed
                    ? "Спасибо! Ваш заказ принят. Менеджер свяжется с вами для уточнения деталей."
                    : "Срок действия данного предложения истёк. Обратитесь к менеджеру за обновлённым КП."}
                </p>
                {confirmed && proposal.balance_condition && (
                  <div className="mt-4 rounded-lg bg-amber-50 p-3">
                    <p className="text-sm text-stone-700">
                      Остаток:{" "}
                      <span className="font-semibold">
                        {calculation ? formatCurrency(calculation.balance) : ""}
                      </span>
                      {` — ${proposal.balance_condition}`}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <p className="pb-4 text-center text-xs text-stone-400">
          {proposal.number} • {proposal.project_name}
        </p>
      </div>
    </div>
  );
}

// Client-side calculation for display purposes
function calculateClientSide(
  proposal: KpWithVariants,
  selectedVariants: Record<string, string>
) {
  let subtotal = 0;

  for (const item of proposal.items) {
    const selectedVariantId = selectedVariants[item.id];
    const variant = item.variants.find((v) => v.id === selectedVariantId);
    if (variant) {
      subtotal += variant.price * item.quantity;
    }
  }

  let discountAmount = 0;
  if (proposal.discount_type === "percent") {
    discountAmount = Math.round(
      (subtotal * proposal.discount_value) / 100
    );
  } else if (proposal.discount_type === "fixed") {
    discountAmount = Math.min(proposal.discount_value, subtotal);
  }

  const total = subtotal - discountAmount;
  const advance = Math.round((total * proposal.advance_percent) / 100);
  const balance = total - advance;

  return { subtotal, discountAmount, total, advance, balance };
}
