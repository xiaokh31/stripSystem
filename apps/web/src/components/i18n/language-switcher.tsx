"use client";

import { LOCALE_LABELS, SUPPORTED_LOCALES, type Locale } from "@/lib/i18n/catalog";
import { useI18n } from "./i18n-provider";

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  return (
    <div
      aria-label="Language"
      className="inline-flex min-h-9 overflow-hidden border border-teal-700 bg-teal-950/20 text-xs font-semibold"
    >
      {SUPPORTED_LOCALES.map((option) => (
        <button
          aria-pressed={locale === option}
          className={[
            "min-h-9 px-3 transition-colors",
            locale === option
              ? "bg-white text-teal-950"
              : "text-teal-50 hover:bg-teal-800",
          ].join(" ")}
          key={option}
          onClick={() => setLocale(option as Locale)}
          type="button"
        >
          {LOCALE_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
