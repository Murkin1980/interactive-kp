"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import { calculateKp } from "@/lib/utils/calculation";
import type { Kp, KpItem, KpItemVariant } from "@/types";

type KpWithVariants = Kp & {
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

      const { data: kpData, error: kpError } = await supabase
        .from("kps")
        .select("*")
        .eq("public_token", token)
        .single();

      if (!cancelled && (kpError || !kpData)) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      if (!cancelled && kpData) {
        if (kpData.valid_until && new Date(kpData.valid_until) < new Date()) {
          setExpired(true);
          setLoading(false);
          return;
        }

        if (kpData.status === "sent") {
          const { error: statusError } = await supabase
            .from("kps")
            .update({ status: "viewed" })
            .eq("id", kpData.id);
          if (!statusError) {
            kpData.status = "viewed";
          }
        }

        if (kpData.status === "confirmed") {
          setConfirmed(true);
        }

        const { data: itemsData } = await supabase
          .from("kp_items")
          .select("*, variants:kp_item_variants(*)")
          .eq("kp_id", kpData.id)
          .order("sort_order");

        const typedItems = (itemsData ?? []) as (KpItem & {
          variants: KpItemVariant[];
        })[];

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
            initialVariants = confirmationData.selected_variants as Record<string, string>;
          }
        }

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
          setProposal({ ...kpData, items: typedItems });
          setSelectedVariants(initialVariants);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, supabase]);

  const calculation = proposal
    ? calculateKp(
        proposal.items,
        selectedVariants,
        proposal.discount_type,
        proposal.discount_value,
        proposal.advance_percent
      )
    : null;

  const handleVariantChange = (itemId: string, variantId: string) => {
    if (confirmed) return;
    setSelectedVariants((prev) => ({ ...prev, [itemId]: variantId }));
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proposal || confirming) return;

    setConfirming(true);
    setSubmitError(null);

    const { error } = await supabase.from("kp_confirmations").insert({
      kp_id: proposal.id,
      client_name: formData.client_name || null,
      client_phone: formData.client_phone || null,
      comment: formData.comment || null,
      selected_variants: selectedVariants,
      selected_total: calculation?.total ?? 0,
    });

    if (error) {
      setSubmitError("Ошибка отправки: " + error.message);
      setConfirming(false);
      return;
    }

    const { error: statusError } = await supabase
      .from("kps")
      .update({
        status: "confirmed",
        confirmed_at: new Date().toISOString(),
        selected_total: calculation?.total ?? 0,
      })
      .eq("id", proposal.id);

    if (statusError) {
      setSubmitError("Заказ сохранён, но статус не обновился: " + statusError.message);
    }

    setConfirmed(true);
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

  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent>
            <div className="mb-4 text-5xl">⏰</div>
            <h1 className="mb-2 text-xl font-bold text-stone-800">
              Срок действия истёк
            </h1>
            <p className="text-sm text-stone-500">
              Срок действия данного коммерческого предложения истёк. Пожалуйста,
              обратитесь к вашему менеджеру для получения обновлённого
              предложения.
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
                        } ${confirmed ? "pointer-events-none opacity-70" : ""}`}
                      >
                        <input
                          type="radio"
                          name={`item-${item.id}`}
                          value={variant.id}
                          checked={selectedVariants[item.id] === variant.id}
                          onChange={() =>
                            handleVariantChange(item.id, variant.id)
                          }
                          disabled={confirmed}
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

        {!confirmed ? (
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
                  Заказ подтверждён!
                </h2>
                <p className="text-sm text-stone-500">
                  Спасибо! Ваш заказ принят. Менеджер свяжется с вами для
                  уточнения деталей.
                </p>
                {proposal.balance_condition && (
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
