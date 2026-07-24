import { Suspense } from "react";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { SessionRefreshClient } from "./session-refresh-client";

export const dynamic = "force-dynamic";

export default async function SessionRefreshPage() {
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);
  return (
    <Suspense
      fallback={
        <main
          aria-live="polite"
          className="mx-auto w-full max-w-3xl px-4 py-10"
        >
          <p className="text-sm text-zinc-700">{t("Refreshing session")}</p>
        </main>
      }
    >
      <SessionRefreshClient />
    </Suspense>
  );
}
