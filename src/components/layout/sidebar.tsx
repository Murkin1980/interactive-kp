"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { FileText, LayoutDashboard, LogOut, Settings, UsersRound, X } from "lucide-react";

const navigation = [
  { name: "Обзор", href: "/dashboard", icon: LayoutDashboard },
  { name: "Клиенты", href: "/clients", icon: UsersRound },
  { name: "Коммерческие предложения", href: "/proposals", icon: FileText },
  { name: "Настройки", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [showLogoutNotice, setShowLogoutNotice] = useState(false);

  return (
    <>
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
            type="button"
            onClick={() => setShowLogoutNotice(true)}
            className="flex w-full items-center gap-3 px-3 py-3 text-sm font-medium text-[#c8d6db] transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut size={18} strokeWidth={1.6}/>
            Выход
          </button>
        </div>
      </div>

      {showLogoutNotice && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-md border border-[#39352e]/30 bg-[#fbf7ee] p-6 text-[#28251f] shadow-xl">
            <div className="flex items-center justify-between border-b border-[#39352e]/15 pb-3">
              <h3 className="font-serif text-lg font-semibold">Управление сессией</h3>
              <button
                type="button"
                onClick={() => setShowLogoutNotice(false)}
                className="text-[#71695f] hover:text-[#28251f]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm leading-relaxed text-[#71695f]">
              <p>
                Авторизация в системе защищена шлюзом <strong>Cloudflare Access</strong>.
              </p>
              <p>
                Чтобы завершить текущую корпоративную сессию или сменить аккаунт, перейдите на страницу выхода шлюза Cloudflare или закройте окно браузера.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => {
                  setShowLogoutNotice(false);
                  router.push("/login");
                }}
                className="border border-[#39352e]/30 px-4 py-2 text-xs font-medium text-[#28251f] transition-colors hover:bg-[#39352e]/10"
              >
                На страницу входа
              </button>
              <a
                href="/cdn-cgi/access/logout"
                className="border border-[#39352e] bg-[#28251f] px-4 py-2 text-center text-xs font-medium text-white transition-colors hover:bg-[#39352e]"
              >
                Выйти из Cloudflare Access
              </a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
