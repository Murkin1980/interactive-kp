"use client";

import dynamic from "next/dynamic";

const PublicProposalView = dynamic(
  () => import("@/features/proposals/public-proposal-view"),
  { ssr: false }
);

export default function PublicProposalPage() {
  return <PublicProposalView />;
}
