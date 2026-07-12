"use client";

import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type Locale,
  type MessageKey,
} from "@/lib/i18n/catalog";
import { persistBrowserLocale } from "@/lib/i18n/browser";
import { useI18n } from "./i18n-provider";

export function LanguageSwitcher() {
  const { locale, t } = useI18n();

  function switchLocale(option: Locale) {
    if (option === locale) {
      return;
    }

    // The cookie is the SSR source of truth, then reload requests matching Server Components.
    persistBrowserLocale(option);
    window.location.reload();
  }

  return (
    <div
      aria-label={t("Language")}
      className="inline-flex min-h-9 overflow-hidden border border-white/20 bg-black/10 text-xs font-semibold"
    >
      {SUPPORTED_LOCALES.map((option) => (
        <button
          aria-pressed={locale === option}
          className={[
            "min-h-9 px-3 transition-colors",
            locale === option
              ? "bg-white text-[var(--surface-action-foreground)]"
              : "text-zinc-100 hover:bg-white/10",
          ].join(" ")}
          key={option}
          onClick={() => switchLocale(option)}
          type="button"
        >
          {t(LOCALE_LABELS[option] as MessageKey)}
        </button>
      ))}
    </div>
  );
}
