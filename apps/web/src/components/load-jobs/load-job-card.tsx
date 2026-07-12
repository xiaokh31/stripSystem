import Link from "next/link";
import { formatDateTime } from "@/components/imports/import-detail-flow";
import {
  loadJobLineLabel,
  mobileLoadJobScanHref,
} from "@/components/mobile/load-job-flow";
import type { LoadJobResponse } from "@/lib/api-client";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/catalog";
import { loadJobStatusLabel } from "@/lib/i18n/status-labels";
import { createTranslator } from "@/lib/i18n/translator";
import { LoadJobManagementPanel } from "./load-job-management-panel";

export function LoadJobCard({
  locale,
  loadJob,
  showManagement = true,
}: {
  locale?: Locale;
  loadJob: LoadJobResponse;
  showManagement?: boolean;
}) {
  const { format, t } = createTranslator(locale ?? DEFAULT_LOCALE);
  const visibleLines = loadJob.lines.slice(0, 5);
  const hiddenLineCount = Math.max(
    0,
    loadJob.lines.length - visibleLines.length,
  );

  return (
    <article className="border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="break-all text-lg font-semibold text-zinc-950">
            {loadJob.loadNo ?? loadJob.id}
          </h3>
          <p className="mt-1 text-sm font-medium text-zinc-600">
            {format("i18n.loadJobs.regionTruck", {
              region: loadJob.destinationRegion ?? t("No destination region"),
              truck: loadJob.truckNo ?? t("No truck"),
            })}
          </p>
        </div>
        <StatusBadge locale={locale} status={loadJob.status} />
      </div>

      <dl className="mt-4 grid gap-2 text-sm md:grid-cols-6">
        <DetailItem
          label={t("Departure")}
          value={formatOptionalDate(loadJob.scheduledDepartureAt, locale)}
        />
        <DetailItem label={t("Dock")} value={loadJob.dockNo ?? t("No dock")} />
        <DetailItem
          label={t("Carrier")}
          value={loadJob.carrier ?? t("No carrier")}
        />
        <DetailItem
          label={t("System pallets")}
          value={String(loadJob.plannedPalletCount)}
        />
        <DetailItem
          label={t("External pallets")}
          value={String(loadJob.externalPalletCount)}
        />
        <DetailItem
          label={t("Loaded pallets")}
          value={String(loadJob.palletCount)}
        />
        <DetailItem
          label={t("Loaded by")}
          value={loadJobOperatorLabel(loadJob, locale)}
        />
        <DetailItem
          label={t("Loaded at")}
          value={formatOptionalDate(loadJob.completedAt ?? loadJob.closedAt, locale)}
        />
      </dl>

      <ul className="mt-4 grid gap-2 text-sm text-zinc-700">
        {visibleLines.map((line) => (
          <li
            className="border-l-4 border-zinc-300 bg-white px-3 py-2"
            key={line.id}
          >
            <span className="font-semibold">
              {line.externalTransfer
                ? t("External transfer")
                : t("System pallet")}
            </span>
            <span className="ml-2 break-all">
              {loadJobLineLabel(line, locale)}
            </span>
          </li>
        ))}
        {hiddenLineCount ? (
          <li className="text-xs font-semibold uppercase text-zinc-500">
            {format("i18n.loadJobs.morePlanLines", {
              count: hiddenLineCount,
            })}
          </li>
        ) : null}
      </ul>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {loadJob.canScan ? (
          <Link
            className="inline-flex min-h-10 items-center border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50"
            href={mobileLoadJobScanHref(loadJob.id)}
          >
            {t("Open scan page")}
          </Link>
        ) : null}
      </div>

      {showManagement ? <LoadJobManagementPanel loadJob={loadJob} /> : null}
    </article>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-200 bg-white p-3">
      <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-zinc-950">{value}</dd>
    </div>
  );
}

function StatusBadge({
  locale,
  status,
}: {
  locale?: Locale;
  status: string;
}) {
  const styles =
    status === "IN_PROGRESS"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "COMPLETED"
        ? "border-zinc-200 bg-zinc-50 text-zinc-700"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <span
      className={`inline-flex min-h-8 items-center border px-2.5 text-xs font-semibold uppercase ${styles}`}
      title={loadJobStatusLabel(status, locale)}
    >
      {loadJobStatusLabel(status, locale)}
    </span>
  );
}

function formatOptionalDate(value: string | null, locale?: Locale): string {
  return value
    ? formatDateTime(value)
    : createTranslator(locale ?? DEFAULT_LOCALE).t("Not scheduled");
}

function loadJobOperatorLabel(loadJob: LoadJobResponse, locale?: Locale): string {
  const { t } = createTranslator(locale ?? DEFAULT_LOCALE);

  return (
    loadJob.completedBy?.name ??
    loadJob.completedBy?.email ??
    loadJob.completedById ??
    (loadJob.status === "COMPLETED"
      ? t("Unknown operator")
      : t("Not completed"))
  );
}
