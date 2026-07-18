"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showReserve, setShowReserve] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  const handleGoogle = async () => {
    setLoading(true); setError(null);
    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/dashboard` },
    });
    if (oauthError) { setError(oauthError.message); setLoading(false); }
  };

  const handleReserveLogin = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(null);
    const { error: loginError } = await createClient().auth.signInWithPassword({ email, password });
    if (loginError) { setError("Неверный email или пароль"); setLoading(false); return; }
    router.push("/dashboard"); router.refresh();
  };

  return <main className="proposal-canvas grid min-h-screen lg:grid-cols-[1.12fr_.88fr]">
    <section className="relative hidden overflow-hidden border-r border-[#39352e]/15 p-12 lg:flex lg:flex-col lg:justify-between">
      <div className="blueprint-lines"/><div className="relative z-10"><p className="font-serif text-xl">ГРАНД МЕБЕЛЬ</p><p className="mt-1 text-[10px] uppercase tracking-[.3em] text-[#a85834]">Interactive proposals</p></div>
      <div className="relative z-10 max-w-2xl"><p className="mb-5 text-xs uppercase tracking-[.3em] text-[#a85834]">Рабочая студия</p><h1 className="font-serif text-7xl leading-[.94] tracking-[-.04em]">От эскиза<br/>до согласованного проекта.</h1><p className="mt-8 max-w-md font-sans leading-7 text-[#71695f]">Клиенты, проекты, комплектации и финальные документы — в одном защищённом пространстве.</p></div>
      <p className="relative z-10 text-xs text-[#81796e]">Персональный кабинет мебельной студии</p>
    </section>
    <section className="flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-12 lg:hidden"><p className="font-serif text-xl">ГРАНД МЕБЕЛЬ</p><p className="text-[10px] uppercase tracking-[.3em] text-[#a85834]">Interactive proposals</p></div>
        <p className="text-xs uppercase tracking-[.3em] text-[#a85834]">Вход для менеджера</p><h2 className="mt-3 font-serif text-5xl tracking-[-.03em]">Добро пожаловать</h2><p className="mt-4 leading-7 text-[#71695f]">Войдите через свой Google-аккаунт. Пароль от сервиса запоминать не потребуется.</p>
        <button type="button" onClick={()=>void handleGoogle()} disabled={loading} className="group mt-9 flex w-full items-center gap-4 border border-[#39352e] bg-[#fbf7ee] px-5 py-4 text-left transition-all duration-300 hover:bg-[#28251f] hover:text-white disabled:opacity-60">
          {loading?<Loader2 className="animate-spin"/>:<GoogleMark/>}<span className="flex-1 font-sans text-sm font-medium">Продолжить с Google</span><ArrowRight size={18} className="transition-transform group-hover:translate-x-1"/>
        </button>
        <div className="mt-5 flex items-center gap-2 text-xs text-[#777066]"><ShieldCheck size={15} className="text-[#365b46]"/>Безопасная авторизация через Supabase</div>
        {error&&<p className="mt-5 border-l-2 border-red-700 pl-3 text-sm text-red-800">{error}</p>}
        <button type="button" onClick={()=>setShowReserve(value=>!value)} className="mt-10 flex items-center gap-2 text-xs text-[#777066] underline decoration-[#777066]/30 underline-offset-4 transition-colors hover:text-[#a85834]"><KeyRound size={14}/>Резервный вход администратора</button>
        {showReserve&&<form onSubmit={handleReserveLogin} className="mt-5 space-y-3 border-t border-[#39352e]/15 pt-5"><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email" className="editorial-input"/><input type="password" required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Пароль" className="editorial-input"/><button disabled={loading} className="w-full bg-[#a6532d] px-5 py-3 text-sm text-white transition-colors hover:bg-[#75391f]">Войти резервным способом</button></form>}
      </div>
    </section>
  </main>;
}

function GoogleMark(){return <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.4Z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.6A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.4H3.1a10 10 0 0 0 0 9.2L6.5 14Z"/><path fill="#EA4335" d="M12 5.9c1.5 0 2.8.5 3.9 1.5l2.9-2.8A9.7 9.7 0 0 0 3.1 7.4l3.4 2.7A5.9 5.9 0 0 1 12 5.9Z"/></svg>}
