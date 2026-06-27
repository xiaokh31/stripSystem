import type { Metadata } from "next";
import { OfficeShell } from "@/components/layout/office-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bestar Warehouse Office",
  description: "Office console for Bestar warehouse unloading operations",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <OfficeShell>{children}</OfficeShell>
      </body>
    </html>
  );
}
