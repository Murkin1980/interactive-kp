"use client";

import dynamic from "next/dynamic";

const DashboardContent = dynamic(
  () => import("@/features/dashboard/dashboard-content"),
  { ssr: false }
);

export default function DashboardPage() {
  return <DashboardContent />;
}
