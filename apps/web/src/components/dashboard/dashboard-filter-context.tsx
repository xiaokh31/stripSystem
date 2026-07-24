import Link from "next/link";
import type { Locale } from "@/lib/i18n/catalog";
import { createTranslator } from "@/lib/i18n/translator";
import {
  dashboardDrilldownLabel,
  type DashboardDrilldownContext,
} from "./drilldown-flow";

export function DashboardFilterContext({
  clearHref,
  context,
  locale,
}: {
  clearHref: string;
  context: DashboardDrilldownContext;
  locale: Locale;
}) {
  const { t } = createTranslator(locale);
  return (
    <section
      className="flex flex-wrap items-center justify-between gap-3 border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950"
      data-drilldown-code={context.code}
    >
      <p>
        <span className="font-semibold">{t("From operations dashboard")}</span>
        <span aria-hidden="true"> · </span>
        <span>{dashboardDrilldownLabel(context.code, locale)}</span>
      </p>
      <Link
        className="inline-flex min-h-9 items-center border border-teal-700 bg-white px-3 font-semibold text-teal-900 hover:bg-teal-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        href={clearHref}
      >
        {t("View all")}
      </Link>
    </section>
  );
}
