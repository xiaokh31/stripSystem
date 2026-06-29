import type { Metadata } from "next";
import { OfficeShell } from "@/components/layout/office-shell";
import { getServerCurrentUser } from "@/lib/server-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bestar Warehouse Office",
  description: "Office console for Bestar warehouse unloading operations",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const currentUser = await getServerCurrentUser();

  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <OfficeShell currentUser={currentUser}>{children}</OfficeShell>
      </body>
    </html>
  );
}
