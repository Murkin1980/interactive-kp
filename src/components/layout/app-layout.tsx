import { Sidebar } from "./sidebar";
import Link from "next/link";
import { FileText, LayoutDashboard, Settings, UsersRound } from "lucide-react";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen bg-[#f3efe4]">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <nav className="sticky top-0 z-30 flex items-center justify-between border-b border-[#c8d6db] bg-[#14263d] px-3 py-2 text-white md:hidden">
          <Link href="/dashboard" aria-label="Обзор" className="p-2 text-[#c2a46d]"><LayoutDashboard size={20}/></Link>
          <Link href="/clients" aria-label="Клиенты" className="p-2"><UsersRound size={20}/></Link>
          <Link href="/proposals" aria-label="Коммерческие предложения" className="p-2"><FileText size={20}/></Link>
          <Link href="/settings" aria-label="Настройки" className="p-2"><Settings size={20}/></Link>
        </nav>
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-7 lg:px-10">
          {children}
        </div>
      </main>
    </div>
  );
}
