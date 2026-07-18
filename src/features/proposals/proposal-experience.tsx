"use client";

import Image from "next/image";
import { ArrowRight, CalendarDays, Check, Download, Maximize2, Ruler, UserRound } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Kp, KpItem, KpItemVariant, KpOptionGroup } from "@/types";

type ExperienceItem = KpItem & { variants: KpItemVariant[]; option_groups: KpOptionGroup[] };
type ExperienceProposal = Kp & { items: ExperienceItem[]; approval?: { pdf_storage_path: string | null } | null };

type Props = {
  proposal: ExperienceProposal;
  selectedVariants: Record<string, string>;
  selectedOptions: Record<string, string>;
  calculation: { subtotal: number; discountAmount: number; total: number; advance: number; balance: number } | null;
  confirmed: boolean;
  expired: boolean;
  consent: boolean;
  formData: { client_name: string; client_phone: string; comment: string };
  confirming: boolean;
  pdfBusy: boolean;
  submitError: string | null;
  onVariantChange: (itemId: string, variantId: string) => void;
  onOptionChange: (groupId: string, valueId: string) => void;
  onConsentChange: (value: boolean) => void;
  onFormChange: (value: Props["formData"]) => void;
  onConfirm: (event: React.FormEvent) => void;
  onDownloadPdf: () => void;
  onGeneratePdf: () => void;
};

export default function ProposalExperience(props: Props) {
  const { proposal, calculation } = props;
  const firstItem = proposal.items[0];
  const hero = firstItem?.original_image_url || firstItem?.image_url;

  return (
    <main className="proposal-canvas min-h-screen overflow-hidden text-[#28251f]">
      <div className="blueprint-lines" aria-hidden="true" />
      <header className="relative z-10 flex items-center justify-between border-b border-[#39352e]/15 px-5 py-4 md:px-10">
        <div>
          <p className="font-serif text-lg tracking-tight">ГРАНД МЕБЕЛЬ</p>
          <p className="text-[10px] uppercase tracking-[.28em] text-[#9e5633]">Персональный проект</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-[#746d62]">
          <span>01 <i className="mx-2 inline-block h-px w-8 bg-[#9e5633] align-middle" /> 04</span>
          <span className="hidden sm:inline">{proposal.number}</span>
        </div>
      </header>

      <section className="relative z-10 grid min-h-[68vh] border-b border-[#39352e]/15 lg:grid-cols-[1.08fr_.92fr]">
        <div className="relative min-h-[58vh] overflow-hidden border-[#39352e]/15 lg:border-r">
          {hero ? <Image unoptimized priority src={hero} alt={firstItem?.name || proposal.project_name} fill className="object-contain p-8 md:p-14" /> : <div className="flex h-full items-center justify-center font-serif text-3xl text-[#80786c]">Визуализация проекта</div>}
          <span className="absolute bottom-6 left-6 rotate-[-4deg] font-serif text-sm italic text-[#7e7569]">crafted for your space</span>
          {firstItem?.dimensions && <span className="absolute bottom-6 right-6 flex items-center gap-2 text-xs text-[#6d665c]"><Ruler size={15}/>{firstItem.dimensions}</span>}
        </div>
        <div className="flex flex-col justify-center px-6 py-12 md:px-12 lg:px-16">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[.3em] text-[#a85834]">Ваш проект</p>
          <h1 className="max-w-2xl font-serif text-5xl leading-[.96] tracking-[-.035em] md:text-7xl">{proposal.project_name}</h1>
          <div className="my-8 h-px w-full bg-gradient-to-r from-[#a85834] via-[#a85834]/30 to-transparent" />
          <dl className="grid gap-5 text-sm">
            <div className="flex items-center gap-4"><UserRound size={19}/><dt className="w-24 text-[#81786c]">Клиент</dt><dd className="font-medium">{proposal.client_name}</dd></div>
            <div className="flex items-center gap-4"><Ruler size={19}/><dt className="w-24 text-[#81786c]">Проект</dt><dd className="font-medium">{firstItem?.dimensions || "По индивидуальным размерам"}</dd></div>
            {proposal.valid_until && <div className="flex items-center gap-4"><CalendarDays size={19}/><dt className="w-24 text-[#81786c]">Действует до</dt><dd className="font-medium">{formatDate(proposal.valid_until)}</dd></div>}
          </dl>
          {props.confirmed && <div className="mt-9 inline-flex w-fit items-center gap-2 rounded-full bg-[#365b46] px-4 py-2 text-xs font-medium text-white"><Check size={15}/> Выбор подтверждён</div>}
        </div>
      </section>

      {proposal.items.map((item, itemIndex) => {
        const visualization = item.original_image_url || item.image_url;
        return <section key={item.id} className="relative z-10 border-b border-[#39352e]/15 px-5 py-12 md:px-10 lg:py-16">
          <div className="mb-7 flex items-end justify-between">
            <div><p className="text-[10px] uppercase tracking-[.28em] text-[#a85834]">Предмет {String(itemIndex + 1).padStart(2,"0")}</p><h2 className="mt-2 font-serif text-3xl md:text-5xl">{item.name}</h2></div>
            <span className="text-xs text-[#7c7469]">× {item.quantity}</span>
          </div>
          <div className="grid border-y border-[#39352e]/15 lg:grid-cols-2">
            <MediaPanel label="Визуализация" src={visualization} alt={item.name} className="lg:border-r" />
            <MediaPanel label="Эскиз и размеры" src={item.sketch_image_url} alt={`Эскиз ${item.name}`} sketch dimensions={item.dimensions} />
          </div>

          <div className="mt-10 grid gap-10 xl:grid-cols-[1fr_1fr]">
            <ChoiceRail title="Материалы и исполнение">
              {item.variants.map((variant) => {
                const active = props.selectedVariants[item.id] === variant.id;
                return <button key={variant.id} type="button" disabled={props.confirmed || props.expired} onClick={() => props.onVariantChange(item.id,variant.id)} className={`choice-tile group ${active?"choice-tile-active":""}`}>
                  <span className="material-swatch" style={{background: swatchFor(variant.material || variant.name)}} />
                  <span className="min-w-0 flex-1 text-left"><b className="block truncate text-sm">{variant.name}</b><small className="text-[#81786c]">{variant.material || "Авторское исполнение"}</small></span>
                  <span className="text-sm font-semibold text-[#9e5633]">{formatCurrency(variant.price)}</span>
                  {active && <Check className="absolute right-2 top-2 rounded-full bg-[#a85834] p-1 text-white" size={20}/>} 
                </button>;
              })}
            </ChoiceRail>
            <div className="space-y-8">
              {(item.option_groups || []).map((group) => <ChoiceRail key={group.id} title={group.name} compact>
                {group.values.map((value) => {
                  const active=props.selectedOptions[group.id]===value.id;
                  return <button key={value.id} type="button" disabled={props.confirmed || props.expired} onClick={()=>props.onOptionChange(group.id,value.id)} className={`hardware-tile ${active?"hardware-tile-active":""}`}>
                    <span className="hardware-dot"/><span><b className="block text-sm">{value.name}</b><small>{value.brand || (value.price_delta ? `+${formatCurrency(value.price_delta)}` : "Включено")}</small></span>{active&&<Check size={16}/>} 
                  </button>;
                })}
              </ChoiceRail>)}
            </div>
          </div>
        </section>;
      })}

      <section className="relative z-10 grid border-b border-[#39352e]/15 lg:grid-cols-[1fr_420px]">
        <div className="px-6 py-14 md:px-10 lg:py-20">
          <p className="text-xs uppercase tracking-[.28em] text-[#a85834]">Финальный шаг</p>
          <h2 className="mt-3 max-w-2xl font-serif text-4xl md:text-6xl">Проект готов стать частью вашего пространства.</h2>
          {proposal.notes && <p className="mt-6 max-w-xl leading-7 text-[#6f685e]">{proposal.notes}</p>}
        </div>
        <aside className="bg-[#f8f4eb]/80 p-6 shadow-[-20px_0_60px_rgba(67,53,38,.08)] md:p-9">
          <p className="text-sm text-[#71695f]">Итого</p><p className="mt-2 font-serif text-5xl">{calculation ? formatCurrency(calculation.total) : "—"}</p>
          {calculation && <div className="my-7 space-y-2 border-y border-[#39352e]/15 py-5 text-sm"><p className="flex justify-between"><span>Аванс {proposal.advance_percent}%</span><b>{formatCurrency(calculation.advance)}</b></p><p className="flex justify-between text-[#777066]"><span>Остаток</span><span>{formatCurrency(calculation.balance)}</span></p></div>}
          {!props.confirmed && !props.expired ? <form onSubmit={props.onConfirm} className="space-y-3">
            <input aria-label="Ваше имя" placeholder="Ваше имя" value={props.formData.client_name} onChange={e=>props.onFormChange({...props.formData,client_name:e.target.value})} className="editorial-input"/>
            <input aria-label="Телефон" placeholder="Телефон" value={props.formData.client_phone} onChange={e=>props.onFormChange({...props.formData,client_phone:e.target.value})} className="editorial-input"/>
            <textarea aria-label="Комментарий" placeholder="Комментарий или пожелание" value={props.formData.comment} onChange={e=>props.onFormChange({...props.formData,comment:e.target.value})} className="editorial-input min-h-20 resize-none"/>
            <label className="flex cursor-pointer gap-3 py-2 text-xs leading-5 text-[#686157]"><input type="checkbox" checked={props.consent} onChange={e=>props.onConsentChange(e.target.checked)} className="mt-1 accent-[#a85834]"/><span>Я проверил комплектацию и согласен с окончательной сметой.</span></label>
            {props.submitError&&<p className="text-xs text-red-700">{props.submitError}</p>}
            <button disabled={props.confirming} className="group flex w-full items-center justify-between bg-[#a6532d] px-5 py-4 text-sm font-medium text-white transition-all duration-300 hover:bg-[#75391f] hover:shadow-xl disabled:opacity-60"><span>{props.confirming?"Формируем документы…":"Подтвердить выбор"}</span><ArrowRight className="transition-transform group-hover:translate-x-1" size={19}/></button>
          </form> : <div className="mt-8"><div className="mb-5 flex items-center gap-3 text-[#365b46]"><span className="rounded-full bg-[#365b46] p-2 text-white"><Check size={18}/></span><b>Заказ подтверждён</b></div><button onClick={proposal.approval?.pdf_storage_path?props.onDownloadPdf:props.onGeneratePdf} disabled={props.pdfBusy} className="flex w-full items-center justify-center gap-2 border border-[#39352e] px-5 py-4 text-sm transition-colors hover:bg-[#28251f] hover:text-white"><Download size={17}/>{props.pdfBusy?"Подготовка PDF…":"Скачать финальное КП"}</button></div>}
        </aside>
      </section>
      <footer className="relative z-10 flex justify-between px-6 py-8 text-[10px] uppercase tracking-[.2em] text-[#81796e] md:px-10"><span>{proposal.number}</span><span>Индивидуальная мебель</span></footer>
    </main>
  );
}

function MediaPanel({label,src,alt,className="",sketch=false,dimensions}:{label:string;src?:string|null;alt:string;className?:string;sketch?:boolean;dimensions?:string|null}) {
  return <figure className={`relative min-h-[360px] p-4 md:min-h-[480px] ${className}`}><figcaption className="flex items-center justify-between border-l border-[#a85834] pl-4 text-sm"><span>{label}</span><Maximize2 size={15}/></figcaption><div className="absolute inset-x-4 bottom-4 top-14">{src?<Image unoptimized src={src} alt={alt} fill className="object-contain"/>:<div className={`flex h-full items-center justify-center ${sketch?"sketch-placeholder":"bg-[#e8e0d3]"}`}><div className="text-center"><Ruler className="mx-auto mb-3 text-[#9e5633]"/><p className="font-serif text-2xl">{dimensions||"Эскиз будет добавлен"}</p><small className="text-[#80786d]">чертёж и размерные линии</small></div></div>}</div></figure>;
}

function ChoiceRail({title,children,compact=false}:{title:string;children:React.ReactNode;compact?:boolean}) { return <fieldset><legend className="mb-4 font-serif text-2xl">{title}</legend><div className={compact?"grid gap-2 sm:grid-cols-2":"grid gap-3"}>{children}</div></fieldset>; }

function swatchFor(value:string){const text=value.toLowerCase();if(text.includes("egger")||text.includes("дуб"))return "linear-gradient(100deg,#9a6841,#c59665 18%,#805436 20%,#c89a68 50%,#8d5c3a 52%,#c79a6f)";if(text.includes("кам"))return "radial-gradient(circle at 30% 20%,#d7d0c3 0 2px,transparent 3px),#bcb5aa";if(text.includes("прем"))return "linear-gradient(135deg,#262724,#55544e)";return "linear-gradient(135deg,#d7c5aa,#9d7956)";}
