"use client";

import dynamic from "next/dynamic";

const ClientsList = dynamic(
  () => import("@/features/clients/clients-list"),
  { ssr: false }
);

export default function ClientsPage() {
  return <ClientsList />;
}
