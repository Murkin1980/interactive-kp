"use client";

import dynamic from "next/dynamic";

const ProposalsContent = dynamic(
  () => import("@/features/proposals/proposals-list"),
  { ssr: false }
);

export default function ProposalsPage() {
  return <ProposalsContent />;
}
