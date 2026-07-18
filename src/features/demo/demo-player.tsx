"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Home, RotateCcw, X } from "lucide-react";
import Link from "next/link";

type DemoHotspot = {
  x: number;
  y: number;
  width: number;
  height: number;
  next?: number;
  label: string;
};

type DemoStep = {
  image: string;
  title: string;
  description: string;
  hotspot?: DemoHotspot;
};

export type DemoDefinition = {
  slug: string;
  title: string;
  description: string;
  duration: string;
  steps: DemoStep[];
};

export function DemoPlayer({ demo }: { demo: DemoDefinition }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [started, setStarted] = useState(false);
  const step = demo.steps[stepIndex];
  const progress = useMemo(() => ((stepIndex + 1) / demo.steps.length) * 100, [stepIndex, demo.steps.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight" && stepIndex < demo.steps.length - 1) setStepIndex((value) => value + 1);
      if (event.key === "ArrowLeft" && stepIndex > 0) setStepIndex((value) => value - 1);
      if (event.key === "Escape") setStarted(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [demo.steps.length, stepIndex]);

  const goNext = () => {
    if (stepIndex === demo.steps.length - 1) return;
    setStepIndex(step.hotspot?.next ?? stepIndex + 1);
  };

  if (!started) {
    return (
      <main className="demo-shell flex min-h-screen items-center justify-center p-5">
        <section className="w-full max-w-3xl border border-[#c2a46d]/40 bg-[#f7f2e8] p-7 shadow-2xl md:p-12">
          <p className="text-xs font-bold uppercase tracking-[.32em] text-[#702f35]">Интерактивное обучение</p>
          <h1 className="mt-4 font-serif text-4xl leading-tight text-[#14263d] md:text-6xl">{demo.title}</h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-[#526071]">{demo.description}</p>
          <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-[#526071]">
            <span>{demo.steps.length} шага</span><span className="h-1 w-1 rounded-full bg-[#c2a46d]"/><span>{demo.duration}</span>
          </div>
          <div className="mt-9 flex flex-wrap gap-3">
            <button onClick={() => setStarted(true)} className="inline-flex items-center gap-2 bg-[#14263d] px-6 py-3 text-sm font-semibold text-[#f3efe4] transition hover:bg-[#40233a]">
              Начать демо <ArrowRight size={17}/>
            </button>
            <Link href="/demo" className="inline-flex items-center gap-2 border border-[#14263d]/25 px-6 py-3 text-sm text-[#14263d] transition hover:border-[#702f35] hover:bg-white">
              <Home size={17}/> Все инструкции
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="demo-shell min-h-screen p-3 md:p-6">
      <div className="mx-auto max-w-[1500px] overflow-hidden border border-[#c2a46d]/35 bg-[#101d2e] shadow-2xl">
        <header className="flex items-center gap-4 border-b border-white/10 px-4 py-3 text-[#f3efe4] md:px-6">
          <button onClick={() => setStarted(false)} aria-label="Закрыть демо" className="rounded-full p-2 transition hover:bg-white/10"><X size={19}/></button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{demo.title}</p>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15"><div className="h-full bg-[#c2a46d] transition-all duration-500" style={{ width: `${progress}%` }}/></div>
          </div>
          <span className="text-xs text-[#c8d6db]">{stepIndex + 1} / {demo.steps.length}</span>
        </header>

        <section className="grid lg:grid-cols-[1fr_320px]">
          <div className="relative overflow-hidden bg-[#d9d3c7]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={step.image} alt={step.title} className="block h-auto w-full select-none" draggable={false}/>
            {step.hotspot && (
              <button
                onClick={goNext}
                aria-label={step.hotspot.label}
                className="demo-hotspot absolute border-2 border-[#f2c875] bg-[#c2a46d]/20 transition hover:bg-[#c2a46d]/35"
                style={{ left: `${step.hotspot.x}%`, top: `${step.hotspot.y}%`, width: `${step.hotspot.width}%`, height: `${step.hotspot.height}%` }}
              >
                <span className="absolute -right-3 -top-3 flex h-7 w-7 items-center justify-center rounded-full bg-[#702f35] text-xs font-bold text-white shadow-lg">{stepIndex + 1}</span>
              </button>
            )}
          </div>
          <aside className="flex min-h-64 flex-col border-l border-white/10 bg-[#14263d] p-6 text-[#f3efe4]">
            <p className="text-xs uppercase tracking-[.25em] text-[#c2a46d]">Шаг {stepIndex + 1}</p>
            <h2 className="mt-3 font-serif text-2xl">{step.title}</h2>
            <p className="mt-3 text-sm leading-6 text-[#c8d6db]">{step.description}</p>
            {step.hotspot && <p className="mt-5 border-l-2 border-[#c2a46d] pl-3 text-sm">Нажмите на подсвеченную область: «{step.hotspot.label}»</p>}
            <div className="mt-auto flex gap-2 pt-8">
              <button disabled={stepIndex === 0} onClick={() => setStepIndex((value) => value - 1)} className="rounded-full border border-white/20 p-3 transition hover:bg-white/10 disabled:opacity-30"><ArrowLeft size={18}/></button>
              {stepIndex < demo.steps.length - 1 ? (
                <button onClick={goNext} className="flex flex-1 items-center justify-center gap-2 bg-[#c2a46d] px-4 py-3 text-sm font-semibold text-[#14263d] transition hover:bg-[#d8bd8b]">Далее <ArrowRight size={17}/></button>
              ) : (
                <button onClick={() => setStepIndex(0)} className="flex flex-1 items-center justify-center gap-2 bg-[#35644e] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#2a543f]"><Check size={17}/> Пройти ещё раз</button>
              )}
              <button onClick={() => setStepIndex(0)} aria-label="Сначала" className="rounded-full border border-white/20 p-3 transition hover:bg-white/10"><RotateCcw size={18}/></button>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
