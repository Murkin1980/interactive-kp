"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AppLayout } from "@/components/layout/app-layout";
import type { Client } from "@/types";

export default function ClientsContent() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("clients")
        .select("*")
        .order("created_at", { ascending: false });
      if (!cancelled && data) {
        setClients(data);
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-stone-800">Клиенты</h1>
          <Link href="/clients/new">
            <Button>Новый клиент</Button>
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
        ) : clients.length > 0 ? (
          <div className="space-y-3">
            {clients.map((client) => (
              <Link key={client.id} href={`/clients/${client.id}`}>
                <Card className="transition-colors hover:bg-stone-50">
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="font-medium text-stone-800">
                          {client.name}
                        </div>
                        <div className="text-sm text-stone-500">
                          {[client.phone, client.email, client.address]
                            .filter(Boolean)
                            .join(" • ") || "—"}
                        </div>
                      </div>
                      <span className="text-sm text-stone-400">
                        {new Date(client.created_at).toLocaleDateString("ru-KZ")}
                      </span>
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
                Пока нет клиентов. Создайте первого!
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
