"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useRef, useState } from "react";
import {
  scanLoadJobPallet,
  type LoadJobProgressResponse,
  type LoadJobResponse,
  type LoadJobScanResponse,
} from "@/lib/api-client";
import {
  isScanSubmitDisabled,
  loadJobDisplayName,
  loadJobProgressSnapshot,
  normalizeScanInput,
  scanErrorNotice,
  scanSuccessNotice,
  type ScanNotice,
} from "./load-job-flow";

const DEVICE_ID = "web-mobile-scan";

export function MobileScanPanel({
  initialLoadJob,
}: {
  initialLoadJob: LoadJobResponse;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [loadJob, setLoadJob] = useState(initialLoadJob);
  const [lastScan, setLastScan] = useState<LoadJobScanResponse | null>(null);
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [qrPayload, setQrPayload] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const progress = lastScan?.progress ?? loadJobProgressSnapshot(loadJob);
  const disabled = isScanSubmitDisabled({
    canScan: loadJob.canScan,
    qrPayload,
    submitting,
  });

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedPayload = normalizeScanInput(qrPayload);

    if (
      isScanSubmitDisabled({
        canScan: loadJob.canScan,
        qrPayload: normalizedPayload,
        submitting,
      })
    ) {
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      const response = await scanLoadJobPallet(loadJob.id, {
        deviceId: DEVICE_ID,
        qrPayload: normalizedPayload,
      });
      setLoadJob(response.loadJob);
      setLastScan(response);
      setNotice(scanSuccessNotice(response));
      setQrPayload("");
      router.refresh();
    } catch (error) {
      setNotice(scanErrorNotice(error));
    } finally {
      setSubmitting(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <label className="grid gap-2 text-base font-semibold text-zinc-950">
            Pallet QR scan
            <input
              ref={inputRef}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className="min-h-16 w-full border-2 border-teal-700 bg-white px-4 text-xl font-semibold text-zinc-950 outline-none focus:border-teal-900 focus:ring-4 focus:ring-teal-100"
              disabled={!loadJob.canScan || submitting}
              inputMode="text"
              onChange={(event) => setQrPayload(event.target.value)}
              placeholder="Scan pallet QR, then Enter"
              spellCheck={false}
              type="text"
              value={qrPayload}
            />
          </label>

          <button
            className="min-h-16 w-full border border-teal-800 bg-teal-800 px-5 text-lg font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={disabled}
            type="submit"
          >
            {submitting ? "Submitting scan" : "Submit scan"}
          </button>

          {!loadJob.canScan ? (
            <div
              className="border border-amber-200 bg-amber-50 p-4 text-base text-amber-950"
              role="alert"
            >
              <p className="font-semibold">Load job closed</p>
              <p className="mt-1">
                This load job is not open for scanning. Select an open load job.
              </p>
            </div>
          ) : null}

          {notice ? <ScanNoticePanel notice={notice} /> : null}
        </form>

        <div className="grid gap-4">
          <ProgressPanel progress={progress} />
          <LastScanPanel scan={lastScan} />
        </div>
      </div>

      <p className="mt-4 border-t border-zinc-100 pt-4 text-sm font-medium text-zinc-600">
        Remaining pallets are for load job {loadJobDisplayName(loadJob)}, not
        whole-container inventory.
      </p>
    </section>
  );
}

function ScanNoticePanel({ notice }: { notice: ScanNotice }) {
  const styles = {
    amber: "border-amber-200 bg-amber-50 text-amber-950",
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950",
    red: "border-red-200 bg-red-50 text-red-950",
    zinc: "border-zinc-200 bg-zinc-50 text-zinc-900",
  }[notice.tone];

  return (
    <div className={`border p-4 text-base ${styles}`} role="status">
      <p className="text-lg font-semibold">{notice.title}</p>
      {notice.code ? (
        <p className="mt-1 text-xs font-semibold uppercase">{notice.code}</p>
      ) : null}
      <p className="mt-2 leading-6">{notice.message}</p>
    </div>
  );
}

function ProgressPanel({ progress }: { progress: LoadJobProgressResponse }) {
  return (
    <div className="border border-zinc-200 bg-zinc-50 p-4">
      <h2 className="text-base font-semibold text-zinc-950">
        Current load job progress
      </h2>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric label="Plan" value={progress.totalPallets} />
        <Metric label="Loaded" value={progress.loadedPallets} />
        <Metric label="Remaining" value={progress.remainingPallets} />
      </dl>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-zinc-200 bg-white p-3">
      <dt className="text-xs font-semibold uppercase text-zinc-500">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums text-zinc-950">
        {value}
      </dd>
    </div>
  );
}

function LastScanPanel({ scan }: { scan: LoadJobScanResponse | null }) {
  if (!scan) {
    return (
      <div className="border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
        No pallet has been accepted for this screen session yet.
      </div>
    );
  }

  return (
    <div className="border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-semibold text-zinc-950">Last pallet</h2>
      <dl className="mt-4 grid gap-3 text-sm">
        <DetailRow label="Container" value={scan.pallet.containerNo} />
        <DetailRow label="Destination" value={scan.pallet.destinationCode} />
        <DetailRow label="Pallet No." value={scan.pallet.palletNo} />
        <DetailRow label="Pallet ID" value={scan.pallet.palletId} wrap />
        <DetailRow
          label="Remaining in plan"
          value={scan.progress.remainingPallets}
        />
      </dl>
    </div>
  );
}

function DetailRow({
  label,
  value,
  wrap = false,
}: {
  label: string;
  value: number | string;
  wrap?: boolean;
}) {
  return (
    <div className="grid gap-1 border-t border-zinc-100 pt-3">
      <dt className="text-xs font-semibold uppercase text-zinc-500">
        {label}
      </dt>
      <dd
        className={[
          "font-semibold text-zinc-950",
          wrap ? "break-all" : "",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
