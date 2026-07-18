import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(amount: number): string {
  return (
    new Intl.NumberFormat("ru-KZ", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount) + " ₸"
  );
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat("ru-KZ", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(date));
}

export function generateKpNumber(date: Date, sequence: number): string {
  const year = date.getFullYear();
  const num = String(sequence).padStart(3, "0");
  return `КП-${year}-${num}`;
}
