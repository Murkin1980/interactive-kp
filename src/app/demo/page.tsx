import Link from "next/link";
import { ArrowRight, BookOpen, MousePointerClick } from "lucide-react";

export default function DemoHubPage() {
  return (
    <main className="demo-shell min-h-screen px-5 py-12 md:px-10 md:py-20">
      <div className="mx-auto max-w-6xl">
        <p className="text-xs font-bold uppercase tracking-[.35em] text-[#702f35]">База знаний · Гранд Мебель</p>
        <div className="mt-4 grid gap-8 border-b border-[#14263d]/15 pb-10 md:grid-cols-[1fr_auto] md:items-end">
          <div><h1 className="font-serif text-5xl text-[#14263d] md:text-7xl">Как пользоваться сервисом</h1><p className="mt-5 max-w-2xl leading-7 text-[#526071]">Короткие интерактивные инструкции. Нажимайте на подсвеченные элементы и проходите весь процесс без риска изменить настоящее КП.</p></div>
          <div className="hidden h-24 w-24 items-center justify-center rounded-full border border-[#c2a46d] md:flex"><BookOpen className="text-[#702f35]" size={34}/></div>
        </div>
        <section className="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Link href="/demo/client-proposal" className="group border border-[#14263d]/15 bg-[#f7f2e8] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#702f35] hover:shadow-xl">
            <div className="flex items-start justify-between"><MousePointerClick className="text-[#702f35]"/><span className="text-xs uppercase tracking-[.2em] text-[#7f776c]">3 шага</span></div>
            <h2 className="mt-10 font-serif text-3xl text-[#14263d]">КП глазами клиента</h2>
            <p className="mt-3 text-sm leading-6 text-[#626b75]">Визуализация, эскиз, варианты исполнения, итоговая цена и финальный PDF.</p>
            <span className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#702f35]">Открыть демо <ArrowRight className="transition group-hover:translate-x-1" size={16}/></span>
          </Link>
          <div className="border border-dashed border-[#14263d]/20 p-6 text-[#7f776c]"><p className="text-xs uppercase tracking-[.2em]">Следующим</p><h2 className="mt-10 font-serif text-3xl text-[#14263d]">Создание КП</h2><p className="mt-3 text-sm leading-6">Клиент, мебельная позиция, цена, варианты и публикация.</p></div>
          <div className="border border-dashed border-[#14263d]/20 p-6 text-[#7f776c]"><p className="text-xs uppercase tracking-[.2em]">В плане</p><h2 className="mt-10 font-serif text-3xl text-[#14263d]">Повторный расчёт</h2><p className="mt-3 text-sm leading-6">Как разблокировать подтверждённое КП и выдать новую ссылку.</p></div>
        </section>
      </div>
    </main>
  );
}
