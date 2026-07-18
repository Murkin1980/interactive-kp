"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { FileText, LayoutDashboard, LogOut, Settings, UsersRound } from "lucide-react";

const navigation = [
  { name: "Обзор", href: "/dashboard", icon: LayoutDashboard },
  { name: "Клиенты", href: "/clients", icon: UsersRound },
  { name: "Коммерческие предложения", href: "/proposals", icon: FileText },
  { name: "Настройки", href: "/settings", icon: Settings },
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
    <div className="hidden h-full w-72 flex-col border-r border-[#29455b] bg-[#14263d] text-white md:flex">
      <div className="flex h-20 items-center border-b border-white/10 px-6">
        <Link href="/dashboard" className="leading-tight">
          <span className="block text-lg font-semibold tracking-wide">INTERACTIVE KP</span>
          <span className="text-[10px] uppercase tracking-[.24em] text-[#c2a46d]">Furniture proposal studio</span>
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
                "flex items-center gap-3 border-l-2 px-3 py-3 text-sm font-medium transition-all duration-200",
                isActive
                  ? "border-[#c2a46d] bg-white/10 text-white"
                  : "border-transparent text-[#c8d6db] hover:border-white/30 hover:bg-white/5 hover:text-white"
              )}
            >
              <item.icon size={18} strokeWidth={1.6}/>
              {item.name}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 px-3 py-3 text-sm font-medium text-[#c8d6db] transition-colors hover:bg-white/5 hover:text-white"
        >
          <LogOut size={18} strokeWidth={1.6}/>
          Выход
        </button>
      </div>
    </div>
  );
}
