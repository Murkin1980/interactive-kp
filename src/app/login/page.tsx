"use client";

import dynamic from "next/dynamic";

const LoginForm = dynamic(
  () => import("@/features/auth/login-form"),
  { ssr: false }
);

export default function LoginPage() {
  return <LoginForm />;
}
