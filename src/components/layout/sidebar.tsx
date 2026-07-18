"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Главная", href: "/dashboard" },
  { name: "Клиенты", href: "/clients" },
  { name: "КП", href: "/proposals" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleSignOut = async () => {
    const { createClient } = await import("@/lib/supabase/client");
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  };

  return (
    <div className="flex h-full w-64 flex-col border-r border-stone-200 bg-stone-50">
      <div className="flex h-16 items-center border-b border-stone-200 px-6">
        <Link href="/dashboard" className="text-lg font-semibold text-stone-800">
          Интерактивные КП
        </Link>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                "flex items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-amber-100 text-amber-900"
                  : "text-stone-600 hover:bg-stone-100 hover:text-stone-900"
              )}
            >
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-stone-200 p-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900"
        >
          Выход
        </button>
      </div>
    </div>
  );
}
