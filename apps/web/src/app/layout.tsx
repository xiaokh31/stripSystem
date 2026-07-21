import type { Metadata } from "next";
import { cookies } from "next/headers";
import { I18nProvider } from "@/components/i18n/i18n-provider";
import {
  OfficeShell,
  type OfficeShellHealth,
} from "@/components/layout/office-shell";
import { getApiHealth } from "@/lib/api-client";
import { getBrandIconMetadata } from "@/lib/brand-assets";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { getServerCurrentUser } from "@/lib/server-auth";
import {
  normalizeThemePreference,
  themeColorScheme,
  THEME_COOKIE_NAME,
} from "@/lib/theme";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);

  return {
    title: t("Bestar Warehouse Office"),
    description: t("Office console for Bestar warehouse unloading operations"),
    icons: getBrandIconMetadata(),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const locale = await getServerLocale();
  const theme = normalizeThemePreference(cookieStore.get(THEME_COOKIE_NAME)?.value);
  const [currentUser, shellHealth] = await Promise.all([
    getServerCurrentUser(),
    getShellHealth(),
  ]);

  return (
    <html
      className="h-full antialiased"
      data-theme={theme}
      lang={locale}
      style={{ colorScheme: themeColorScheme(theme) }}
      suppressHydrationWarning
    >
      <body className="min-h-full">
        <I18nProvider initialLocale={locale}>
          <OfficeShell
            currentUser={currentUser}
            health={shellHealth}
            locale={locale}
            theme={theme}
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
