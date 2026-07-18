"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppLayout } from "@/components/layout/app-layout";
import type { Kp, KpStatus } from "@/types";

const STATUS_LABELS: Record<KpStatus, string> = {
  draft: "Черновик",
  sent: "Отправлено",
  viewed: "Просмотрено",
  confirmed: "Подтверждено",
  expired: "Истекло",
};

export default function ProposalsContent() {
  const [proposals, setProposals] = useState<Kp[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("kps")
        .select("*")
        .order("created_at", { ascending: false });
      if (!cancelled && data) {
        setProposals(data);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-stone-800">Коммерческие предложения</h1>
          <Link href="/proposals/new">
            <Button>Новое КП</Button>
          </Link>
        </div>

        {loading ? (
          <Card>
            <CardContent>
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                <span className="ml-2 text-sm text-stone-500">Загрузка...</span>
              </div>
            </CardContent>
          </Card>
        ) : proposals.length > 0 ? (
          <div className="space-y-3">
            {proposals.map((proposal) => (
              <Link key={proposal.id} href={`/proposals/${proposal.id}`}>
                <Card className="transition-colors hover:bg-stone-50">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-stone-800">
                          {proposal.number} — {proposal.project_name}
                        </div>
                        <div className="text-sm text-stone-500">
                          {proposal.client_name}
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-medium ${
                            proposal.status === "confirmed"
                              ? "bg-green-100 text-green-800"
                              : proposal.status === "draft"
                              ? "bg-stone-100 text-stone-600"
                              : proposal.status === "expired"
                              ? "bg-red-100 text-red-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {STATUS_LABELS[proposal.status]}
                        </span>
                        <span className="text-sm text-stone-400">
                          {new Date(proposal.created_at).toLocaleDateString("ru-KZ")}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent>
              <p className="text-center text-stone-500">
                Пока нет КП. Создайте первое!
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
