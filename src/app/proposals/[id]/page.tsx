"use client";

import dynamic from "next/dynamic";

const ProposalDetailForm = dynamic(
  () => import("@/features/proposals/proposal-detail-form"),
  { ssr: false }
);

export default function ProposalDetailPage() {
  return <ProposalDetailForm />;
}
