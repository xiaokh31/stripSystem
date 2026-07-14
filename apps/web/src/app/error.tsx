"use client";

import { useI18n } from "@/components/i18n/i18n-provider";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useI18n();

  return (
    <main className="office-main-content flex flex-1 flex-col py-6">
      <section className="border border-red-200 bg-red-50 p-5 text-red-950 shadow-sm">
        <p className="text-sm font-semibold uppercase">{t("Page error")}</p>
        <h1 className="mt-2 text-xl font-semibold">
          {t("The page failed to load.")}
        </h1>
        {error.digest ? (
          <p className="mt-3 text-xs text-red-800">
            {t("Digest")}: <span data-i18n-ignore="true">{error.digest}</span>
          </p>
        ) : null}
        <button
          className="mt-5 min-h-10 border border-red-300 bg-white px-4 text-sm font-semibold text-red-950 hover:bg-red-100"
          type="button"
          onClick={reset}
        >
          {t("Retry")}
        </button>
      </section>
    </main>
  );
}
