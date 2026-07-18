"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Kp, KpItem, KpItemVariant, KpOptionGroup } from "@/types";
import type { jsPDF as JsPdf } from "jspdf";
import ProposalExperience from "@/features/proposals/proposal-experience";

type PublicItem = KpItem & { variants: KpItemVariant[]; option_groups: KpOptionGroup[] };

type KpWithVariants = Kp & {
  items: PublicItem[];
  approval?: { version: number; snapshot: Record<string, unknown>; pdf_storage_path: string | null } | null;
};

type PublicKpData = Omit<Kp, "client_id" | "public_token" | "owner_id"> & {
  items: PublicItem[];
  is_expired?: boolean;
  selected_variants?: Record<string, string>;
  approval?: { version: number; snapshot: Record<string, unknown>; pdf_storage_path: string | null } | null;
};

type ApprovalSnapshotData = {
  items?: Array<{
    item_id?: string;
    variant?: { id?: string };
    options?: Array<{ group_id?: string; value_id?: string }>;
  }>;
};

type ProposalBranding = {
  company_name: string;
  logo_url: string | null;
  watermark_text: string;
  primary_color: string;
};

export default function PublicProposalView() {
  const params = useParams();
  const token = params?.token as string;
  const supabase = createClient();

  const [proposal, setProposal] = useState<KpWithVariants | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<
    Record<string, string>
  >({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [consent, setConsent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [integrityError, setIntegrityError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [branding, setBranding] = useState<ProposalBranding>({
    company_name: "ГРАНД МЕБЕЛЬ",
    logo_url: null,
    watermark_text: "ГРАНД МЕБЕЛЬ",
    primary_color: "#14263D",
  });

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
      const { data: brandingData } = await supabase.rpc("get_public_kp_branding", { p_token: token });
      if (!cancelled && brandingData) setBranding(brandingData as ProposalBranding);

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
        const isExpired = kpData.is_expired ?? false;
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
        const typedItems = await Promise.all(((kpData.items ?? []) as PublicItem[]).map(async (item) => {
          const signMedia = async (path: string | null | undefined) => {
            if (!path || /^https?:\/\//.test(path)) return path;
            const { data } = await supabase.storage.from("kp-media").createSignedUrl(path, 3600);
            return data?.signedUrl || path;
          };
          const [original, sketch] = await Promise.all([
            signMedia(item.original_image_url || item.image_url),
            signMedia(item.sketch_image_url),
          ]);
          return { ...item, image_url: original, original_image_url: original, sketch_image_url: sketch };
        }));

        // For confirmed KPs, try to restore previously selected variants
        let initialVariants: Record<string, string> = {};
        let validationFailed = false;

        if (kpData.status === "confirmed") {
          if (kpData.selected_variants) {
            initialVariants = kpData.selected_variants as Record<
              string,
              string
            >;

            // Validate integrity: every item must have a selection in initialVariants, and that variant must exist in item.variants
            for (const item of typedItems) {
              const selectedVarId = initialVariants[item.id];
              const variantExists = item.variants.some((v) => v.id === selectedVarId);
              if (!selectedVarId || !variantExists) {
                validationFailed = true;
                break;
              }
            }
          } else {
            validationFailed = true;
          }
        }

        if (validationFailed) {
          if (!cancelled) {
            setIntegrityError(true);
            setLoading(false);
          }
          return;
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

        const initialOptions: Record<string, string> = {};
        for (const item of typedItems) {
          for (const group of item.option_groups ?? []) {
            const defaultValue = group.values.find((value) => value.is_default) ?? group.values[0];
            if (defaultValue) initialOptions[group.id] = defaultValue.id;
          }
        }

        // A confirmed proposal must always render and regenerate its immutable
        // approved configuration, never today's defaults.
        if (kpData.status === "confirmed" && kpData.approval?.snapshot) {
          const approved = kpData.approval.snapshot as ApprovalSnapshotData;
          for (const approvedItem of approved.items ?? []) {
            if (approvedItem.item_id && approvedItem.variant?.id) {
              initialVariants[approvedItem.item_id] = approvedItem.variant.id;
            }
            for (const option of approvedItem.options ?? []) {
              if (option.group_id && option.value_id) initialOptions[option.group_id] = option.value_id;
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
          setSelectedOptions(initialOptions);
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
    ? calculateClientSide(proposal, selectedVariants, selectedOptions)
    : null;

  const handleVariantChange = (itemId: string, variantId: string) => {
    if (confirmed || expired) return;
    setSelectedVariants((prev) => ({ ...prev, [itemId]: variantId }));
  };

  const handleOptionChange = (groupId: string, valueId: string) => {
    if (confirmed || expired) return;
    setSelectedOptions((previous) => ({ ...previous, [groupId]: valueId }));
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
    const allRequiredOptionsSelected = proposal.items.every((item) =>
      (item.option_groups ?? []).every((group) => !group.is_required || selectedOptions[group.id])
    );
    if (!allRequiredOptionsSelected) {
      setSubmitError("Выберите значение в каждой обязательной группе");
      return;
    }
    if (!consent) {
      setSubmitError("Подтвердите согласие с окончательной сметой");
      return;
    }

    setConfirming(true);
    setSubmitError(null);

    const { data, error } = await supabase.rpc("approve_public_kp", {
      p_token: token,
      p_client_name: formData.client_name || null,
      p_client_phone: formData.client_phone || null,
      p_comment: formData.comment || null,
      p_selected_variants: selectedVariants,
      p_selected_options: selectedOptions,
      p_consent: consent,
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
      total?: number;
      revision?: number;
      snapshot?: Record<string, unknown>;
    };

    if (result?.success) {
      if (!result.already_confirmed && result.revision) {
        try {
          await generateAndStorePdf(result.revision);
        } catch (pdfError) {
          console.error("[PDF]", pdfError);
          setSubmitError("Смета подтверждена, но PDF не удалось сохранить. Менеджер сможет повторить формирование.");
        }
      }
      setConfirmed(true);
    } else {
      setSubmitError("Неожиданный ответ сервера");
    }

    setConfirming(false);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const generateAndStorePdf = async (revision: number) => {
    if (!proposal || !calculation) return;
    setPdfBusy(true);
    try {
      const { jsPDF } = await import("jspdf");
      const [regularFont, boldFont] = await Promise.all([
        fetch("/fonts/NotoSans-Regular.ttf").then((response) => response.arrayBuffer()),
        fetch("/fonts/NotoSans-Bold.ttf").then((response) => response.arrayBuffer()),
      ]);
      const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
      pdf.addFileToVFS("NotoSans-Regular.ttf", arrayBufferToBase64(regularFont));
      pdf.addFileToVFS("NotoSans-Bold.ttf", arrayBufferToBase64(boldFont));
      pdf.addFont("NotoSans-Regular.ttf", "NotoSans", "normal");
      pdf.addFont("NotoSans-Bold.ttf", "NotoSans", "bold");
      const [pdfImages, logoDataUrl] = await Promise.all([
        loadPdfImages(proposal),
        branding.logo_url ? imageUrlToDataUrl(branding.logo_url).catch(() => undefined) : Promise.resolve(undefined),
      ]);
      renderEstimatePdf(pdf, proposal, selectedVariants, selectedOptions, calculation, revision, pdfImages, branding, logoDataUrl);
      applyPdfProtection(pdf, proposal, revision, branding.watermark_text || branding.company_name);
      const blob = pdf.output("blob");
      const path = `${proposal.id}/${token}/approval-v${revision}.pdf`;
      const { error: uploadError } = await supabase.storage.from("kp-media").upload(path, blob, { contentType: "application/pdf", upsert: false });
      if (uploadError && !uploadError.message.toLowerCase().includes("already exists")) throw uploadError;
      const { error: attachError } = await supabase.rpc("attach_approval_pdf", { p_token: token, p_revision: revision, p_storage_path: path });
      if (attachError && !attachError.message.toLowerCase().includes("already attached")) throw attachError;
      setProposal((current) => current ? { ...current, approval: { version: revision, snapshot: {}, pdf_storage_path: path } } : current);
      downloadBlob(blob, `${proposal.number || "KP"}-v${revision}.pdf`);
    } finally { setPdfBusy(false); }
  };

  const handleDownloadStoredPdf = async () => {
    const path = proposal?.approval?.pdf_storage_path;
    if (!proposal || !path) return;
    setPdfBusy(true);
    const { data, error } = await supabase.storage.from("kp-media").download(path);
    setPdfBusy(false);
    if (error) { setSubmitError("Не удалось скачать PDF: " + error.message); return; }
    downloadBlob(data, `${proposal.number || "KP"}-v${proposal.approval?.version ?? 1}.pdf`);
  };

  const handleGenerateMissingPdf = async () => {
    if (!proposal) return;
    setSubmitError("");
    try {
      await generateAndStorePdf(proposal.current_revision);
    } catch (error) {
      console.error("[PDF]", error);
      setSubmitError("Не удалось сформировать PDF. Попробуйте ещё раз или обратитесь к менеджеру.");
    }
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

  if (integrityError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-stone-100 px-4">
        <Card className="w-full max-w-md text-center">
          <CardContent>
            <div className="mb-4 text-5xl">⚠️</div>
            <h1 className="mb-2 text-xl font-bold text-stone-800">
              Ошибка целостности данных
            </h1>
            <p className="text-sm text-stone-500">
              Выбранные ранее варианты комплектации для этого предложения не найдены или повреждены. Пожалуйста, обратитесь к менеджеру.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!proposal) return null;

  const editorialExperienceEnabled = true;
  if (editorialExperienceEnabled) {
    return <ProposalExperience
      proposal={proposal}
      selectedVariants={selectedVariants}
      selectedOptions={selectedOptions}
      calculation={calculation}
      confirmed={confirmed}
      expired={expired}
      consent={consent}
      formData={formData}
      confirming={confirming}
      pdfBusy={pdfBusy}
      submitError={submitError}
      onVariantChange={handleVariantChange}
      onOptionChange={handleOptionChange}
      onConsentChange={setConsent}
      onFormChange={setFormData}
      onConfirm={handleConfirm}
      onDownloadPdf={() => void handleDownloadStoredPdf()}
      onGeneratePdf={() => void handleGenerateMissingPdf()}
    />;
  }

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
                  {(item.original_image_url || item.image_url || item.sketch_image_url) && (
                    <div className={`grid gap-3 ${(item.original_image_url || item.image_url) && item.sketch_image_url ? "sm:grid-cols-2" : "grid-cols-1"}`}>
                      {(item.original_image_url || item.image_url) && <figure>
                        <figcaption className="mb-1 text-xs font-medium text-stone-500">Визуализация мебели</figcaption>
                        <Image unoptimized src={item.original_image_url || item.image_url || ""} alt={`Визуализация: ${item.name}`} width={900} height={650} className="h-64 w-full rounded-xl bg-stone-100 object-contain sm:h-72" />
                      </figure>}
                      {item.sketch_image_url && <figure>
                        <figcaption className="mb-1 text-xs font-medium text-stone-500">Эскиз с размерами</figcaption>
                        <Image unoptimized src={item.sketch_image_url} alt={`Эскиз с размерами: ${item.name}`} width={900} height={650} className="h-64 w-full rounded-xl bg-stone-100 object-contain sm:h-72" />
                      </figure>}
                    </div>
                  )}
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

                  {(item.option_groups ?? []).map((group) => (
                    <fieldset key={group.id} className="space-y-2 border-t border-stone-200 pt-3">
                      <legend className="mb-2 flex w-full items-center justify-between text-sm font-semibold text-stone-700">
                        <span>{group.name}</span>
                        {group.is_required && <span className="text-xs font-normal text-amber-700">Обязательный выбор</span>}
                      </legend>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.values.map((value) => (
                          <label key={value.id} className={`cursor-pointer rounded-lg border p-3 transition-colors ${selectedOptions[group.id] === value.id ? "border-amber-500 bg-amber-50" : "border-stone-200 bg-white hover:bg-stone-50"} ${confirmed || expired ? "pointer-events-none opacity-70" : ""}`}>
                            <span className="flex items-start gap-2">
                              <input type="radio" name={`group-${group.id}`} checked={selectedOptions[group.id] === value.id} onChange={() => handleOptionChange(group.id, value.id)} disabled={confirmed || expired} className="mt-0.5 h-4 w-4 text-amber-600" />
                              <span className="flex-1"><b className="block text-sm text-stone-800">{value.name}</b>{value.brand && <small className="text-stone-500">{value.brand}</small>}</span>
                              <b className="text-xs text-amber-700">{value.price_delta > 0 ? `+${formatCurrency(value.price_delta)}` : "Включено"}</b>
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}

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
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4">
                  <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-1 h-4 w-4 accent-amber-600" />
                  <span className="text-sm leading-6 text-stone-700">Я проверил выбранную комплектацию и согласен с окончательной сметой на сумму <b>{calculation ? formatCurrency(calculation.total) : ""}</b>.</span>
                </label>
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
                    : `Согласовать и сформировать PDF — ${calculation ? formatCurrency(calculation.total) : ""}`}
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
                {confirmed && proposal.approval?.pdf_storage_path && (
                  <Button type="button" className="mt-4" disabled={pdfBusy} onClick={() => void handleDownloadStoredPdf()}>
                    {pdfBusy ? "Подготовка PDF..." : "Скачать финальное КП (PDF)"}
                  </Button>
                )}
                {confirmed && !proposal.approval?.pdf_storage_path && (
                  <Button type="button" className="mt-4" disabled={pdfBusy} onClick={() => void handleGenerateMissingPdf()}>
                    {pdfBusy ? "Подготовка PDF..." : "Сформировать финальное КП (PDF)"}
                  </Button>
                )}
                {submitError && <p className="mt-3 text-sm text-red-600">{submitError}</p>}
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

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer); let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(binary);
}

type PdfItemImages = Record<string, { original?: string; sketch?: string }>;

async function imageUrlToDataUrl(url: string) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Не удалось загрузить изображение (${response.status})`);
  const blob = await response.blob();
  return `data:${blob.type || "image/jpeg"};base64,${arrayBufferToBase64(await blob.arrayBuffer())}`;
}

async function loadPdfImages(proposal: KpWithVariants): Promise<PdfItemImages> {
  const entries = await Promise.all(proposal.items.map(async (item) => {
    const result: { original?: string; sketch?: string } = {};
    const originalUrl = item.original_image_url || item.image_url;
    await Promise.all([
      originalUrl ? imageUrlToDataUrl(originalUrl).then((data) => { result.original = data; }).catch(() => undefined) : undefined,
      item.sketch_image_url ? imageUrlToDataUrl(item.sketch_image_url).then((data) => { result.sketch = data; }).catch(() => undefined) : undefined,
    ]);
    return [item.id, result] as const;
  }));
  return Object.fromEntries(entries);
}

function renderEstimatePdf(pdf: JsPdf, proposal: KpWithVariants, selectedVariants: Record<string,string>, selectedOptions: Record<string,string>, calculation: {subtotal:number;discountAmount:number;total:number;advance:number;balance:number}, revision: number, pdfImages: PdfItemImages, branding: ProposalBranding, logoDataUrl?: string) {
  const left=16, right=194, pageBottom=278; let y=18;
  const text=(value:string,x:number,size=10,style:"normal"|"bold"="normal",color:[number,number,number]=[35,35,31])=>{pdf.setFont("NotoSans",style);pdf.setFontSize(size);pdf.setTextColor(...color);pdf.text(value,x,y);};
  const line=()=>{pdf.setDrawColor(205,198,184);pdf.line(left,y,right,y);y+=5;};
  const space=(needed:number)=>{if(y+needed>pageBottom){pdf.addPage();y=18;}};
  if (logoDataUrl) {
    try { pdf.addImage(logoDataUrl, logoDataUrl.startsWith("data:image/png") ? "PNG" : "JPEG", left, 11, 26, 10, undefined, "FAST"); } catch { /* Fall back to the company name below. */ }
  }
  text(branding.company_name.toLocaleUpperCase("ru-RU"), logoDataUrl ? 46 : left, 9,"bold",[20,58,86]); text("ФИНАЛЬНАЯ СМЕТА",140,9,"normal",[90,87,80]); y+=10;
  text(proposal.project_name,left,20,"bold"); y+=9; text(`${proposal.number} · редакция ${revision}`,left,9); text(proposal.client_name,140,9,"bold"); y+=8; line();
  proposal.items.forEach((item,index)=>{space(40);const variant=item.variants.find(v=>v.id===selectedVariants[item.id]);const options=(item.option_groups??[]).map(group=>({group,value:group.values.find(v=>v.id===selectedOptions[group.id])})).filter(entry=>entry.value);const itemTotal=((variant?.price??0)+options.reduce((sum,e)=>sum+(e.value?.price_delta??0),0))*item.quantity;
    text(`${index+1}. ${item.name}`,left,13,"bold"); text(formatCurrency(itemTotal),158,11,"bold"); y+=7;text(`${item.dimensions||"Размер по проекту"} · ${item.quantity} шт.`,left,8,"normal",[115,111,104]);y+=7;
    const media = pdfImages[item.id]; const mediaEntries = [["Визуализация",media?.original],["Эскиз с размерами",media?.sketch]].filter((entry): entry is [string,string]=>Boolean(entry[1]));
    if(mediaEntries.length){space(43);const rowY=y;const gap=6;const cellWidth=mediaEntries.length===2?86:178;const maxHeight=31;mediaEntries.forEach(([label,data],mediaIndex)=>{const x=left+mediaIndex*(cellWidth+gap);pdf.setFont("NotoSans","normal");pdf.setFontSize(7);pdf.setTextColor(115,111,104);pdf.text(label,x,rowY);try{const properties=pdf.getImageProperties(data);const scale=Math.min(cellWidth/properties.width,maxHeight/properties.height);const width=properties.width*scale;const height=properties.height*scale;const format=data.startsWith("data:image/png")?"PNG":"JPEG";pdf.addImage(data,format,x,rowY+2,width,height);}catch{/* PDF remains usable if an image format is unsupported. */}});y=rowY+maxHeight+5;}
    text("Исполнение",left,8,"normal",[115,111,104]);text(`${variant?.name||""}${variant?.material?` · ${variant.material}`:""}`,65,9);text(formatCurrency((variant?.price??0)*item.quantity),158,9,"bold");y+=6;
    options.forEach(({group,value})=>{space(7);text(group.name,left,8,"normal",[115,111,104]);text(`${value?.name||""}${value?.brand?` · ${value.brand}`:""}`,65,9);text(value&&value.price_delta>0?`+${formatCurrency(value.price_delta*item.quantity)}`:"включено",158,9,"bold");y+=6;});y+=3;line();
  });
  space(55);y+=3;text("Сумма",105,9);text(formatCurrency(calculation.subtotal),158,9,"bold");y+=7;if(calculation.discountAmount>0){text("Скидка",105,9);text(`-${formatCurrency(calculation.discountAmount)}`,158,9,"bold",[30,120,70]);y+=7;}pdf.setDrawColor(35,35,31);pdf.line(105,y,194,y);y+=7;text("ИТОГО",105,12,"bold");text(formatCurrency(calculation.total),158,12,"bold");y+=8;text(`Аванс ${proposal.advance_percent}%`,105,9);text(formatCurrency(calculation.advance),158,9,"bold");y+=7;text("Остаток",105,9);text(formatCurrency(calculation.balance),158,9,"bold");y+=13;
  space(35);pdf.setFillColor(248,246,240);pdf.rect(left,y,right-left,23,"F");y+=7;const consent=pdf.splitTextToSize("Клиент проверил выбранную комплектацию и согласился с окончательной сметой.",165);pdf.setFont("NotoSans","normal");pdf.setFontSize(8);pdf.text(consent,left+4,y);y+=20;text(`Дата формирования: ${new Date().toLocaleString("ru-RU")}`,left,7,"normal",[115,111,104]);
}

/**
 * Adds print-safe ownership marks after all estimate pages have been rendered.
 * The pale vector watermark survives browser printing and PDF re-export without
 * making furniture images, specifications, or prices difficult to read.
 */
function applyPdfProtection(
  pdf: JsPdf,
  proposal: KpWithVariants,
  revision: number,
  companyName: string
) {
  const pageCount = pdf.getNumberOfPages();
  const watermark = companyName.toLocaleUpperCase("ru-RU");
  const footer = `${proposal.number} · редакция ${revision} · ${proposal.client_name}`;

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);

    // A vector watermark is more reliable in print than CSS transparency.
    pdf.setFont("NotoSans", "bold");
    pdf.setFontSize(31);
    pdf.setTextColor(232, 235, 238);
    pdf.text(watermark, 105, 151, { align: "center", angle: 34 });

    pdf.setDrawColor(198, 164, 109);
    pdf.setLineWidth(0.25);
    pdf.line(16, 286, 194, 286);

    pdf.setFont("NotoSans", "normal");
    pdf.setFontSize(6.5);
    pdf.setTextColor(92, 100, 106);
    pdf.text(footer, 16, 291);
    pdf.text("Персональное коммерческое предложение", 105, 291, { align: "center" });
    pdf.text(`${page} / ${pageCount}`, 194, 291, { align: "right" });
  }
}

// Client-side calculation for display purposes
function calculateClientSide(
  proposal: KpWithVariants,
  selectedVariants: Record<string, string>,
  selectedOptions: Record<string, string>
) {
  let subtotal = 0;

  for (const item of proposal.items) {
    const selectedVariantId = selectedVariants[item.id];
    const variant = item.variants.find((v) => v.id === selectedVariantId);
    if (variant) {
      subtotal += variant.price * item.quantity;
    }
    for (const group of item.option_groups ?? []) {
      const value = group.values.find((candidate) => candidate.id === selectedOptions[group.id]);
      if (value) subtotal += value.price_delta * item.quantity;
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
