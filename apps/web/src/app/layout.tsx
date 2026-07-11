import type { Metadata } from "next";
import { cookies } from "next/headers";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import {
  OfficeShell,
  type OfficeShellHealth,
} from "@/components/layout/office-shell";
import { getApiHealth } from "@/lib/api-client";
import { LOCALE_COOKIE_NAME } from "@/lib/i18n/catalog";
import { normalizeLocale } from "@/lib/i18n/translator";
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
  const cookieStore = await cookies();
  const locale = normalizeLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value);
  const [currentUser, shellHealth] = await Promise.all([
    getServerCurrentUser(),
    getShellHealth(),
  ]);

  return (
    <html lang={locale} className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        <I18nProvider initialLocale={locale}>
          <OfficeShell
            currentUser={currentUser}
            health={shellHealth}
            locale={locale}
          >
            {children}
          </OfficeShell>
        </I18nProvider>
      </body>
    </html>
  );
}

async function getShellHealth(): Promise<OfficeShellHealth> {
  try {
    const health = await getApiHealth();
    return {
      apiStatus: health.status,
      databaseStatus: health.database.status,
      version: health.version,
    };
  } catch {
    return {
      apiStatus: "down",
      databaseStatus: "unknown",
    };
  }
}
