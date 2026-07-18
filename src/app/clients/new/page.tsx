"use client";

import dynamic from "next/dynamic";

const NewClientForm = dynamic(
  () => import("@/features/clients/new-client-form"),
  { ssr: false }
);

export default function NewClientPage() {
  return <NewClientForm />;
}
