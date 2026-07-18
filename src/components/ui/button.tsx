import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-lg font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        {
          "bg-[#14263d] text-white hover:bg-[#263f55] focus-visible:ring-[#14263d]":
            variant === "primary",
          "border border-[#c8d6db] bg-[#f6f8f8] text-[#14263d] hover:bg-[#dde7ea] focus-visible:ring-[#77afc5]":
            variant === "secondary",
          "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600":
            variant === "danger",
          "text-stone-600 hover:bg-stone-100 focus-visible:ring-stone-400":
            variant === "ghost",
        },
        {
          "h-8 px-3 text-sm": size === "sm",
          "h-10 px-4 text-sm": size === "md",
          "h-12 px-6 text-base": size === "lg",
        },
        className
      )}
      {...props}
    />
  );
}
