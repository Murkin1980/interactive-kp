"use client";

import Link from "next/link";
import { ArrowRight, ShieldCheck } from "lucide-react";

export default function LoginForm() {
  return (
    <main className="proposal-canvas grid min-h-screen lg:grid-cols-[1.12fr_.88fr]">
      <section className="relative hidden overflow-hidden border-r border-[#39352e]/15 p-12 lg:flex lg:flex-col lg:justify-between">
        <div className="blueprint-lines" />
        <div className="relative z-10">
          <p className="font-serif text-xl">ГРАНД МЕБЕЛЬ</p>
          <p className="mt-1 text-[10px] uppercase tracking-[.3em] text-[#a85834]">
            Interactive proposals
          </p>
        </div>
        <div className="relative z-10 max-w-2xl">
          <p className="mb-5 text-xs uppercase tracking-[.3em] text-[#a85834]">
            Рабочая студия
          </p>
          <h1 className="font-serif text-7xl leading-[.94] tracking-[-.04em]">
            От эскиза
            <br />
            до согласованного проекта.
          </h1>
          <p className="mt-8 max-w-md font-sans leading-7 text-[#71695f]">
            Клиенты, проекты, комплектации и финальные документы — в одном защищённом пространстве.
          </p>
        </div>
        <p className="relative z-10 text-xs text-[#81796e]">
          Персональный кабинет мебельной студии
        </p>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-12 lg:hidden">
            <p className="font-serif text-xl">ГРАНД МЕБЕЛЬ</p>
            <p className="text-[10px] uppercase tracking-[.3em] text-[#a85834]">
              Interactive proposals
            </p>
          </div>

          <p className="text-xs uppercase tracking-[.3em] text-[#a85834]">
            Вход для менеджера
          </p>
          <h2 className="mt-3 font-serif text-5xl tracking-[-.03em]">
            Рабочий кабинет
          </h2>
          <p className="mt-4 leading-7 text-[#71695f]">
            Вход в рабочую студию защищён шлюзом Cloudflare Access. Авторизация выполняется корпоративным провайдером при открытии кабинета.
          </p>

          <Link
            href="/dashboard"
            className="group mt-9 flex w-full items-center justify-between border border-[#39352e] bg-[#28251f] px-5 py-4 text-left text-white transition-all duration-300 hover:bg-[#39352e]"
          >
            <span className="font-sans text-sm font-medium">Перейти в рабочий кабинет</span>
            <ArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
          </Link>

          <div className="mt-5 flex items-center gap-2 text-xs text-[#777066]">
            <ShieldCheck size={15} className="text-[#365b46]" />
            Защита периметра Cloudflare Zero Trust (Access)
          </div>

          <div className="mt-8 border-t border-[#39352e]/15 pt-6 text-xs leading-relaxed text-[#71695f]">
            <p className="font-semibold text-[#39352e]">Как работает авторизация:</p>
            <p className="mt-1">
              Если сессия в Cloudflare Access активна, система мгновенно откроет рабочее пространство. Если срок сессии истёк или вход выполняется впервые, Cloudflare предложит авторизоваться перед переходом.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
