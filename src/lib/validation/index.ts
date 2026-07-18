import { z } from "zod";

const optionalNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (val) => (val === "" || val === undefined ? null : val),
    schema.optional().nullable()
  );

export const clientSchema = z.object({
  name: z.string().min(1, "Обязательное поле"),
  phone: optionalNull(z.string()),
  email: optionalNull(z.string().email("Некорректный email")),
  address: optionalNull(z.string()),
  notes: optionalNull(z.string()),
});

export const kpSchema = z.object({
  client_id: optionalNull(z.string().uuid()),
  client_name: z.string().min(1, "Обязательное поле"),
  client_phone: optionalNull(z.string()),
  project_name: z.string().min(1, "Обязательное поле"),
  number: z.string().optional(),
  valid_until: optionalNull(z.string()),
  notes: optionalNull(z.string()),
  advance_percent: z.number().min(0).max(100).default(0),
  balance_condition: optionalNull(z.string()),
  discount_type: z.enum(["none", "percent", "fixed"]).default("none"),
  discount_value: z.number().min(0).default(0),
});

export const kpItemSchema = z.object({
  name: z.string().min(1, "Обязательное поле"),
  description: optionalNull(z.string()),
  dimensions: optionalNull(z.string()),
  quantity: z.number().min(1).default(1),
  sort_order: z.number().default(0),
});

export const kpItemVariantSchema = z.object({
  name: z.string().min(1, "Обязательное поле"),
  material: optionalNull(z.string()),
  hardware: optionalNull(z.string()),
  description: optionalNull(z.string()),
  price: z.number().min(0, "Цена не может быть отрицательной"),
  is_default: z.boolean().default(false),
});

export type ClientFormData = z.infer<typeof clientSchema>;
export type KpFormData = z.infer<typeof kpSchema>;
export type KpItemFormData = z.infer<typeof kpItemSchema>;
export type KpItemVariantFormData = z.infer<typeof kpItemVariantSchema>;
