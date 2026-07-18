"use client";

import dynamic from "next/dynamic";

const NewProposalForm = dynamic(
  () => import("@/features/proposals/new-proposal-form"),
  { ssr: false }
);

export default function NewProposalPage() {
  return <NewProposalForm />;
}
