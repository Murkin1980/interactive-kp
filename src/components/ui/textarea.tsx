import { cn } from "@/lib/utils";

interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export function Textarea({
  className,
  label,
  error,
  id,
  ...props
}: TextareaProps) {
  return (
    <div className="space-y-1">
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-stone-700"
        >
          {label}
        </label>
      )}
      <textarea
        id={id}
        className={cn(
          "flex min-h-[80px] w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm",
          "placeholder:text-stone-400",
          "focus:outline-none focus:ring-2 focus:ring-amber-600 focus:border-transparent",
          "disabled:cursor-not-allowed disabled:opacity-50",
          error && "border-red-500 focus:ring-red-500",
          className
        )}
        {...props}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
