import Link from "next/link";
import { formatDateTime } from "@/components/imports/import-detail-flow";
import {
  loadJobLineLabel,
  mobileLoadJobScanHref,
} from "@/components/mobile/load-job-flow";
import type { LoadJobResponse } from "@/lib/api-client";
import { LoadJobManagementPanel } from "./load-job-management-panel";

export function LoadJobCard({
  loadJob,
  showManagement = true,
}: {
  loadJob: LoadJobResponse;
  showManagement?: boolean;
}) {
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
            {(loadJob.destinationRegion ?? "No destination region") +
              " / " +
              (loadJob.truckNo ?? "No truck")}
          </p>
        </div>
        <StatusBadge status={loadJob.status} />
      </div>

      <dl className="mt-4 grid gap-2 text-sm md:grid-cols-6">
        <DetailItem
          label="Departure"
          value={formatOptionalDate(loadJob.scheduledDepartureAt)}
        />
        <DetailItem label="Dock" value={loadJob.dockNo ?? "No dock"} />
        <DetailItem label="Carrier" value={loadJob.carrier ?? "No carrier"} />
        <DetailItem
          label="System pallets"
          value={String(loadJob.plannedPalletCount)}
        />
        <DetailItem
          label="External pallets"
          value={String(loadJob.externalPalletCount)}
        />
        <DetailItem
          label="Loaded pallets"
          value={String(loadJob.palletCount)}
        />
      </dl>

      <ul className="mt-4 grid gap-2 text-sm text-zinc-700">
        {visibleLines.map((line) => (
          <li
            className="border-l-4 border-zinc-300 bg-white px-3 py-2"
            key={line.id}
          >
            <span className="font-semibold">
              {line.externalTransfer ? "External transfer" : "System pallet"}
            </span>
            <span className="ml-2 break-all">{loadJobLineLabel(line)}</span>
          </li>
        ))}
        {hiddenLineCount ? (
          <li className="text-xs font-semibold uppercase text-zinc-500">
            {hiddenLineCount} more plan lines
          </li>
        ) : null}
      </ul>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        {loadJob.canScan ? (
          <Link
            className="inline-flex min-h-10 items-center border border-teal-700 bg-white px-4 text-sm font-semibold text-teal-900 hover:bg-teal-50"
            href={mobileLoadJobScanHref(loadJob.id)}
          >
            Open scan page
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

function StatusBadge({ status }: { status: string }) {
  const styles =
    status === "IN_PROGRESS"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : status === "COMPLETED"
        ? "border-zinc-200 bg-zinc-50 text-zinc-700"
        : "border-amber-200 bg-amber-50 text-amber-800";

  return (
    <span
      className={`inline-flex min-h-8 items-center border px-2.5 text-xs font-semibold uppercase ${styles}`}
    >
      {status}
    </span>
  );
}

function formatOptionalDate(value: string | null): string {
  return value ? formatDateTime(value) : "Not scheduled";
}
