import type { KpItem, KpItemVariant, CalculationResult, DiscountType } from "@/types";

export function calculateKp(
  items: (KpItem & { variants: KpItemVariant[] })[],
  selectedVariants: Record<string, string>,
  discountType: DiscountType,
  discountValue: number,
  advancePercent: number
): CalculationResult {
  let subtotal = 0;

  for (const item of items) {
    const selectedVariantId = selectedVariants[item.id];
    let variant = item.variants.find((v) => v.id === selectedVariantId);
    if (!variant) {
      variant = item.variants.find((v) => v.is_default);
    }
    if (!variant && item.variants.length > 0) {
      variant = item.variants[0];
    }
    if (variant) {
      subtotal += variant.price * item.quantity;
    }
  }

  let discountAmount = 0;
  if (discountType === "percent") {
    discountAmount = Math.round((subtotal * discountValue) / 100);
  } else if (discountType === "fixed") {
    discountAmount = Math.min(discountValue, subtotal);
  }

  const total = subtotal - discountAmount;
  const advance = Math.round((total * advancePercent) / 100);
  const balance = total - advance;

  return { subtotal, discountAmount, total, advance, balance };
}
