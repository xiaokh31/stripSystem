import Link from "next/link";
import {
  INVENTORY_READ_PERMISSION,
  canReviewUnloadingSummary,
  canReviewUnloadingWage,
  canReviewWorkHours,
  hasPermission,
} from "@/lib/permissions";
import { getServerLocale } from "@/lib/i18n/server";
import { createTranslator } from "@/lib/i18n/translator";
import { getServerCurrentUser } from "@/lib/server-auth";

export default async function ReportsPage() {
  const locale = await getServerLocale();
  const { t } = createTranslator(locale);
  const currentUser = await getServerCurrentUser();
  const showInventory = hasPermission(currentUser, INVENTORY_READ_PERMISSION);
  const showWorkHours = canReviewWorkHours(currentUser);
  const showUnloadingWage = canReviewUnloadingWage(currentUser);
  const showUnloadingSummary = canReviewUnloadingSummary(currentUser);

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 sm:px-6 lg:px-8">
      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <p className="text-sm font-semibold uppercase text-teal-700">
          {t("Reports")}
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">
          {t("Warehouse reports")}
        </h1>
      </section>

      <section className="border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="grid gap-3">
          {showInventory ? (
            <ReportLink
              href="/reports/inventory"
              openLabel={t("Open report")}
              title={t("Inventory report")}
            />
          ) : null}
          {showWorkHours ? (
            <ReportLink
              href="/work-hours"
              openLabel={t("Open report")}
              title={t("HR Work Hours Settlement")}
            />
          ) : null}
          {showUnloadingWage ? (
            <ReportLink
              href="/unloading-wage"
              openLabel={t("Open report")}
              title={t("Warehouse Unloading Wage Settlement")}
            />
          ) : null}
          {showUnloadingSummary ? (
            <ReportLink
              href="/unloading-summary"
              openLabel={t("Open report")}
              title={t("Monthly Unloading Data Summary")}
            />
          ) : null}
          {!showInventory &&
          !showWorkHours &&
          !showUnloadingWage &&
          !showUnloadingSummary ? (
            <p className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {t("No report permission is assigned to the current account.")}
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function ReportLink({
  href,
  openLabel,
  title,
}: {
  href: string;
  openLabel: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 py-3 last:border-0">
      <h2 className="text-base font-semibold text-zinc-950">{title}</h2>
      <Link
        className="inline-flex min-h-10 items-center border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900"
        href={href}
      >
        {openLabel}
      </Link>
    </div>
  );
}
