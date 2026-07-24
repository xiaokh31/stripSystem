"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";
import { refreshBrowserSession } from "@/lib/api-client";
import { AUTH_REDIRECT_PARAM, safeAuthRedirectTarget } from "@/lib/auth-token";

export function SessionRefreshClient() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();

  useEffect(() => {
    void refreshBrowserSession()
      .then(() => {
        router.replace(
          safeAuthRedirectTarget(params.get(AUTH_REDIRECT_PARAM)),
        );
        router.refresh();
      })
      .catch(() => {
        router.replace("/login");
        router.refresh();
      });
  }, [params, router]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10" aria-live="polite">
      <p className="text-sm text-zinc-700">{t("Refreshing session")}</p>
    </main>
  );
}
