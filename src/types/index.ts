export type KpStatus = "draft" | "sent" | "viewed" | "confirmed" | "expired";
export type DiscountType = "none" | "percent" | "fixed";

export interface Client {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Kp {
  id: string;
  number: string;
  client_id: string | null;
  client_name: string;
  client_phone: string | null;
  project_name: string;
  created_at: string;
  valid_until: string | null;
  status: KpStatus;
  notes: string | null;
  advance_percent: number;
  balance_condition: string | null;
  discount_type: DiscountType;
  discount_value: number;
  public_token: string;
  confirmed_at: string | null;
  selected_total: number | null;
}

export interface KpItem {
  id: string;
  kp_id: string;
  name: string;
  description: string | null;
  dimensions: string | null;
  quantity: number;
  image_url: string | null;
  sort_order: number;
}

export interface KpItemVariant {
  id: string;
  item_id: string;
  name: string;
  material: string | null;
  hardware: string | null;
  description: string | null;
  price: number;
  is_default: boolean;
  sort_order: number;
}

export interface KpConfirmation {
  id: string;
  kp_id: string;
  client_name: string | null;
  client_phone: string | null;
  comment: string | null;
  selected_variants: Record<string, string>;
  selected_total: number;
  confirmed_at: string;
}

export interface KpWithItems extends Kp {
  items: (KpItem & { variants: KpItemVariant[] })[];
}

export interface CalculationResult {
  subtotal: number;
  discountAmount: number;
  total: number;
  advance: number;
  balance: number;
}
