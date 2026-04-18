import type { Metadata } from "next";
import "./globals.css";
import { ToastProvider } from "@/app/ui/toast-context";

export const metadata: Metadata = {
  title: "news-monitor",
  description: "Self-hosted multi-source AI news monitor",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
