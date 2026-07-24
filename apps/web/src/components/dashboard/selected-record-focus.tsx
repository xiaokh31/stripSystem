"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { Locale } from "../../lib/i18n/catalog";
import { createTranslator } from "../../lib/i18n/translator";

export function SelectedRecordFocus({
  children,
  locale,
  recordId,
}: {
  children: ReactNode;
  locale: Locale;
  recordId: string;
}) {
  const { t } = createTranslator(locale);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    ref.current?.scrollIntoView({ behavior: "auto", block: "center" });
  }, [recordId]);

  return (
    <div
      className="border-l-4 border-amber-600 bg-amber-50 p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-700"
      data-record-id={recordId}
      data-selected-record="true"
      ref={ref}
      tabIndex={-1}
    >
      <p className="px-3 py-2 text-xs font-semibold uppercase text-amber-900">
        {t("Selected record")}
      </p>
      {children}
    </div>
  );
}
