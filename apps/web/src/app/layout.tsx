import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: "BarStock — Beverage Inventory Platform",
  description: "Real-time inventory tracking for bars and restaurants",
};

export const viewport: Viewport = {
  themeColor: "#0B1623",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-[var(--navy-bg)] antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
