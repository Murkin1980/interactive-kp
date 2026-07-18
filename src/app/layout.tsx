import "./globals.css";
import { AuthBoundary } from "@/features/auth/auth-boundary";

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="antialiased"><AuthBoundary>{children}</AuthBoundary></body>
    </html>
  );
}
