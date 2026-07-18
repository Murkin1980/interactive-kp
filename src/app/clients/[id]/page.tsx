"use client";

import dynamic from "next/dynamic";

const ClientDetailForm = dynamic(
  () => import("@/features/clients/client-detail-form"),
  { ssr: false }
);

export default function ClientDetailPage() {
  return <ClientDetailForm />;
}
