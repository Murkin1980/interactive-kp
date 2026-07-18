"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isPublic = pathname === "/login" || pathname.startsWith("/public/") || pathname.startsWith("/auth/");
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (isPublic) return;
    let active = true;
    void (async () => {
      const { data } = await createClient().auth.getUser();
      if (!active) return;
      if (!data.user) router.replace("/login");
      else setAuthenticated(true);
    })();
    return () => { active = false; };
  }, [isPublic, router]);

  if (!isPublic && !authenticated) return <div className="proposal-canvas flex min-h-screen items-center justify-center"><div className="text-center"><Loader2 className="mx-auto animate-spin text-[#a85834]"/><p className="mt-3 text-sm text-[#71695f]">Проверяем доступ…</p></div></div>;
  return children;
}
