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
          "bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-600":
            variant === "primary",
          "bg-stone-200 text-stone-800 hover:bg-stone-300 focus-visible:ring-stone-400":
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
