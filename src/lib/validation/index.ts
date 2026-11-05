import { z } from "zod";

const optionalNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (val) => (val === "" || val === undefined ? null : val),
    schema.optional().nullable()
  );

export const clientSchema = z.object({
  name: z.string().trim().min(1, "Обязательное поле").max(160, "Не более 160 символов"),
  phone: optionalNull(z.string().trim().max(40, "Не более 40 символов")),
  email: optionalNull(z.string().email("Некорректный email")),
  address: optionalNull(z.string().trim().max(500, "Не более 500 символов")),
  notes: optionalNull(z.string().trim().max(5000, "Не более 5000 символов")),
});

export const kpSchema = z.object({
  client_id: optionalNull(z.string().uuid()),
  client_name: z.string().trim().min(1, "Обязательное поле"),
  client_phone: optionalNull(z.string()),
  project_name: z.string().trim().min(1, "Обязательное поле"),
  number: z.string().optional(),
  valid_until: optionalNull(z.string()),
  notes: optionalNull(z.string()),
  advance_percent: z.number().min(0).max(100).default(0),
  balance_condition: optionalNull(z.string()),
  discount_type: z.enum(["none", "percent", "fixed"]).default("none"),
  discount_value: z.number().min(0).default(0),
}).refine(
  (data) => data.discount_type !== "percent" || data.discount_value <= 100,
  { message: "Процентная скидка не может превышать 100%", path: ["discount_value"] },
);

export const kpUpdateSchema = z.object({
  client_name: z.string().trim().min(1, "Обязательное поле"),
  client_phone: optionalNull(z.string()),
  project_name: z.string().trim().min(1, "Обязательное поле"),
  number: optionalNull(z.string()),
  valid_until: optionalNull(z.string()),
  notes: optionalNull(z.string()),
  advance_percent: z.number().min(0).max(100).default(0),
  balance_condition: optionalNull(z.string()),
  discount_type: z.enum(["none", "percent", "fixed"]).default("none"),
  discount_value: z.number().min(0).default(0),
}).refine(
  (data) => data.discount_type !== "percent" || data.discount_value <= 100,
  { message: "Процентная скидка не может превышать 100%", path: ["discount_value"] },
);

export const kpItemSchema = z.object({
  name: z.string().min(1, "Обязательное поле"),
  description: optionalNull(z.string()),
  dimensions: optionalNull(z.string()),
  quantity: z.number().min(1).default(1),
  sort_order: z.number().default(0),
});

export const kpItemVariantSchema = z.object({
  name: z.string().trim().min(1, "Обязательное поле").max(160, "Не более 160 символов"),
  material: optionalNull(z.string().trim().max(160, "Не более 160 символов")),
  hardware: optionalNull(z.string().trim().max(160, "Не более 160 символов")),
  description: optionalNull(z.string().trim().max(2000, "Не более 2000 символов")),
  price: z.number().min(0, "Цена не может быть отрицательной"),
  is_default: z.boolean().default(false),
});

export const kpItemUpdateSchema = z.object({
  name: z.string().trim().min(1, "Обязательное поле").max(200, "Не более 200 символов"),
  description: optionalNull(z.string().trim().max(4000, "Не более 4000 символов")),
  dimensions: optionalNull(z.string().trim().max(200, "Не более 200 символов")),
  quantity: z.number().int().min(1).default(1),
});

export const kpItemsReorderSchema = z.object({
  item_ids: z.array(z.string().uuid()).min(1).max(50),
});

export const kpOptionGroupSchema = z.object({
  name: z.string().trim().min(1, "Обязательное поле").max(80, "Не более 80 символов"),
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,49}$/).optional(),
  description: optionalNull(z.string().trim().max(1000, "Не более 1000 символов")),
  is_required: z.boolean().default(true),
  sort_order: z.number().int().min(0).optional(),
});

export const kpOptionValueSchema = z.object({
  name: z.string().trim().min(1, "Обязательное поле").max(100, "Не более 100 символов"),
  brand: optionalNull(z.string().trim().max(100, "Не более 100 символов")),
  description: optionalNull(z.string().trim().max(1000, "Не более 1000 символов")),
  image_url: optionalNull(z.string().trim().max(500, "Не более 500 символов")),
  price_delta: z.number().min(0).default(0),
  production_days_delta: z.number().int().min(0).default(0),
  is_default: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export const kpSimpleAddOnSchema = z.object({
  name: z.string().trim().min(1, "Обязательное поле").max(80, "Не более 80 символов"),
  price: z.number().gt(0, "Доплата должна быть больше 0"),
});

export type ClientFormData = z.infer<typeof clientSchema>;
export type KpFormData = z.infer<typeof kpSchema>;
export type KpUpdateData = z.infer<typeof kpUpdateSchema>;
export type KpItemFormData = z.infer<typeof kpItemSchema>;
export type KpItemUpdateData = z.infer<typeof kpItemUpdateSchema>;
export type KpItemVariantFormData = z.infer<typeof kpItemVariantSchema>;
export type KpOptionGroupFormData = z.infer<typeof kpOptionGroupSchema>;
export type KpOptionValueFormData = z.infer<typeof kpOptionValueSchema>;
export type KpSimpleAddOnFormData = z.infer<typeof kpSimpleAddOnSchema>;
