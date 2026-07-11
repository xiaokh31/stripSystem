"use client";

import {
  LOCALE_LABELS,
  SUPPORTED_LOCALES,
  type Locale,
} from "@/lib/i18n/catalog";
import { persistBrowserLocale } from "@/lib/i18n/browser";
import { useI18n } from "./i18n-provider";

export function LanguageSwitcher() {
  const { locale } = useI18n();

  function switchLocale(option: Locale) {
    if (option === locale) {
      return;
    }

    persistBrowserLocale(option);
    window.location.reload();
  }

  return (
    <div
      aria-label="Language"
      className="inline-flex min-h-9 overflow-hidden border border-white/20 bg-black/10 text-xs font-semibold"
    >
      {SUPPORTED_LOCALES.map((option) => (
        <button
          aria-pressed={locale === option}
          className={[
            "min-h-9 px-3 transition-colors",
            locale === option
              ? "bg-white text-[var(--dock-steel)]"
              : "text-zinc-100 hover:bg-white/10",
          ].join(" ")}
          key={option}
          onClick={() => switchLocale(option)}
          type="button"
        >
          {LOCALE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
