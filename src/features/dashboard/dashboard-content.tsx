"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { AppLayout } from "@/components/layout/app-layout";

interface Stats {
  totalClients: number;
  totalProposals: number;
  draftProposals: number;
  confirmedProposals: number;
}

interface RecentClient {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  created_at: string;
}

interface RecentProposal {
  id: string;
  number: string;
  client_name: string;
  project_name: string;
  status: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлено",
  viewed: "Просмотрено",
  confirmed: "Подтверждено",
  expired: "Истекло",
};

export default function DashboardContent() {
  const [stats, setStats] = useState<Stats>({
    totalClients: 0,
    totalProposals: 0,
    draftProposals: 0,
    confirmedProposals: 0,
  });
  const [recentClients, setRecentClients] = useState<RecentClient[]>([]);
  const [recentProposals, setRecentProposals] = useState<RecentProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [clientsCount, proposalsCount, draftCount, confirmedCount] =
        await Promise.all([
          supabase.from("clients").select("*", { count: "exact", head: true }),
          supabase.from("kps").select("*", { count: "exact", head: true }),
          supabase
            .from("kps")
            .select("*", { count: "exact", head: true })
            .eq("status", "draft"),
          supabase
            .from("kps")
            .select("*", { count: "exact", head: true })
            .eq("status", "confirmed"),
        ]);

      if (!cancelled) {
        setStats({
          totalClients: clientsCount.count ?? 0,
          totalProposals: proposalsCount.count ?? 0,
          draftProposals: draftCount.count ?? 0,
          confirmedProposals: confirmedCount.count ?? 0,
        });
      }

      const { data: clients } = await supabase
        .from("clients")
        .select("id, name, phone, email, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (!cancelled && clients) {
        setRecentClients(clients);
      }

      const { data: proposals } = await supabase
        .from("kps")
        .select("id, number, client_name, project_name, status, created_at")
        .order("created_at", { ascending: false })
        .limit(5);

      if (!cancelled && proposals) {
        setRecentProposals(proposals);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-stone-800">Главная</h1>
          <p className="text-stone-600">Добро пожаловать!</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
            <span className="ml-2 text-sm text-stone-500">Загрузка...</span>
          </div>
        ) : (
          <>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent>
              <div className="text-2xl font-bold text-stone-800">
                {stats.totalClients}
              </div>
              <div className="text-sm text-stone-600">Клиентов</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="text-2xl font-bold text-stone-800">
                {stats.totalProposals}
              </div>
              <div className="text-sm text-stone-600">Всего КП</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="text-2xl font-bold text-stone-800">
                {stats.draftProposals}
              </div>
              <div className="text-sm text-stone-600">Черновиков</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <div className="text-2xl font-bold text-stone-800">
                {stats.confirmedProposals}
              </div>
              <div className="text-sm text-stone-600">Подтверждено</div>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-4">
          <Link href="/clients/new">
            <Button>Новый клиент</Button>
          </Link>
          <Link href="/proposals/new">
            <Button variant="secondary">Создать КП</Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-stone-800">
                Последние клиенты
              </h2>
            </CardHeader>
            <CardContent>
              {recentClients.length > 0 ? (
                <ul className="space-y-3">
                  {recentClients.map((client) => (
                    <li key={client.id}>
                      <Link
                        href={`/clients/${client.id}`}
                        className="flex items-center justify-between rounded-lg p-2 hover:bg-stone-50"
                      >
                        <div>
                          <div className="font-medium text-stone-800">
                            {client.name}
                          </div>
                          <div className="text-sm text-stone-500">
                            {client.phone || client.email || "—"}
                          </div>
                        </div>
                        <span className="text-sm text-stone-400">
                          {new Date(client.created_at).toLocaleDateString("ru-KZ")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-stone-500">Пока нет клиентов</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <h2 className="text-lg font-semibold text-stone-800">
                Последние КП
              </h2>
            </CardHeader>
            <CardContent>
              {recentProposals.length > 0 ? (
                <ul className="space-y-3">
                  {recentProposals.map((proposal) => (
                    <li key={proposal.id}>
                      <Link
                        href={`/proposals/${proposal.id}`}
                        className="flex items-center justify-between rounded-lg p-2 hover:bg-stone-50"
                      >
                        <div>
                          <div className="font-medium text-stone-800">
                            {proposal.number}
                          </div>
                          <div className="text-sm text-stone-500">
                            {proposal.client_name} — {proposal.project_name}
                          </div>
                        </div>
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
                          {STATUS_LABELS[proposal.status] ?? proposal.status}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-stone-500">Пока нет КП</p>
              )}
            </CardContent>
          </Card>
        </div>
        </>
        )}
      </div>
    </AppLayout>
  );
}
