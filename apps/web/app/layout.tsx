import type { Metadata } from "next";
import "./globals.css";
import { AppearanceProvider } from "@/app/ui/appearance-provider";
import { ToastProvider } from "@/app/ui/toast-context";

export const metadata: Metadata = {
  title: "news-monitor",
  description: "Self-hosted multi-source AI news monitor",
  applicationName: "News Monitor",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "News Monitor",
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <AppearanceProvider>
          <ToastProvider>{children}</ToastProvider>
        </AppearanceProvider>
      </body>
    </html>
  );
}
