"use client";

import { useRouter } from "next/navigation";
import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  scanLoadJobPallet,
  type LoadJobProgressResponse,
  type LoadJobResponse,
  type LoadJobScanResponse,
} from "@/lib/api-client";
import { formatOperationalDateTime } from "../../lib/date-time";
import {
  isScanSubmitDisabled,
  loadJobDisplayName,
  loadJobProgressSnapshot,
  normalizeScanInput,
  scanErrorNotice,
  scanSuccessNotice,
  type ScanNotice,
} from "./load-job-flow";
import {
  offlineQueuedNotice,
  offlineQueueCounts,
  offlineScanErrorMessage,
  queueOfflineScan,
  readOfflineScanQueue,
  markOfflineScanFailed,
  markOfflineScanSynced,
  shouldQueueOfflineScan,
  syncableOfflineScans,
  writeOfflineScanQueue,
  type OfflineScanQueueItem,
} from "./offline-scan-queue";

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
  const [offlineItems, setOfflineItems] = useState<OfflineScanQueueItem[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [qrPayload, setQrPayload] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);

  const progress = lastScan?.progress ?? loadJobProgressSnapshot(loadJob);
  const disabled = isScanSubmitDisabled({
    canScan: loadJob.canScan,
    qrPayload,
    submitting,
  });
  const currentLoadJobQueue = offlineItems.filter(
    (item) => item.loadJobId === loadJob.id,
  );
  const syncableCount = syncableOfflineScans(offlineItems).length;

  const loadOfflineQueue = useCallback(() => {
    try {
      setOfflineItems(readOfflineScanQueue(window.localStorage));
      setQueueError(null);
    } catch (error) {
      setQueueError(offlineScanErrorMessage(error));
    }
  }, []);

  const queueScanLocally = useCallback(
    (payload: string) => {
      try {
        const item = queueOfflineScan(window.localStorage, {
          deviceId: DEVICE_ID,
          loadJobId: loadJob.id,
          qrPayload: payload,
        });
        setOfflineItems(readOfflineScanQueue(window.localStorage));
        setNotice(offlineQueuedNotice(item));
        setQueueError(null);
        setQrPayload("");
      } catch (error) {
        const message = offlineScanErrorMessage(error);
        setQueueError(message);
        setNotice({
          code: "OFFLINE_QUEUE_WRITE_FAILED",
          message,
          title: "Offline queue failed",
          tone: "red",
        });
      }
    },
    [loadJob.id],
  );

  const syncQueuedScans = useCallback(async () => {
    if (syncingQueue) {
      return;
    }

    setSyncingQueue(true);
    setQueueError(null);
    let refreshedCurrentLoadJob = false;

    try {
      let items = readOfflineScanQueue(window.localStorage);
      const candidates = syncableOfflineScans(items);

      for (const item of candidates) {
        try {
          const response = await scanLoadJobPallet(item.loadJobId, {
            deviceId: item.deviceId,
            qrPayload: item.qrPayload,
          });

          items = markOfflineScanSynced(
            readOfflineScanQueue(window.localStorage),
            item.localId,
          );
          writeOfflineScanQueue(window.localStorage, items);
          setOfflineItems(items);

          if (item.loadJobId === loadJob.id) {
            setLoadJob(response.loadJob);
            setLastScan(response);
            setNotice(scanSuccessNotice(response));
            refreshedCurrentLoadJob = true;
          }
        } catch (error) {
          const message = offlineScanErrorMessage(error);
          items = markOfflineScanFailed(
            readOfflineScanQueue(window.localStorage),
            item.localId,
            message,
          );
          writeOfflineScanQueue(window.localStorage, items);
          setOfflineItems(items);

          if (item.loadJobId === loadJob.id) {
            setNotice(scanErrorNotice(error));
          }
        }
      }

      if (refreshedCurrentLoadJob) {
        router.refresh();
      }
    } catch (error) {
      setQueueError(offlineScanErrorMessage(error));
    } finally {
      setSyncingQueue(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [loadJob.id, router, syncingQueue]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(loadOfflineQueue, 0);
    return () => window.clearTimeout(timeout);
  }, [loadOfflineQueue]);

  useEffect(() => {
    function handleOnline() {
      void syncQueuedScans();
    }

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncQueuedScans]);

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

    if (isBrowserOffline()) {
      queueScanLocally(normalizedPayload);
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
      if (shouldQueueOfflineScan(error)) {
        queueScanLocally(normalizedPayload);
      } else {
        setNotice(scanErrorNotice(error));
      }
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

      <OfflineQueuePanel
        items={currentLoadJobQueue}
        queueError={queueError}
        syncableCount={syncableCount}
        syncing={syncingQueue}
        totalCounts={offlineQueueCounts(offlineItems)}
        onSync={() => {
          void syncQueuedScans();
        }}
      />

      <p className="mt-4 border-t border-zinc-100 pt-4 text-sm font-medium text-zinc-600">
        Remaining pallets are for load job {loadJobDisplayName(loadJob)}, not
        whole-container inventory.
      </p>
    </section>
  );
}

function OfflineQueuePanel({
  items,
  onSync,
  queueError,
  syncableCount,
  syncing,
  totalCounts,
}: {
  items: OfflineScanQueueItem[];
  onSync: () => void;
  queueError: string | null;
  syncableCount: number;
  syncing: boolean;
  totalCounts: { failed: number; pending: number; synced: number };
}) {
  return (
    <div className="mt-4 border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            Offline scan queue
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Pending scans stay local and do not change inventory until the API
            accepts them.
          </p>
        </div>
        <button
          className="min-h-11 border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={syncing || syncableCount === 0}
          onClick={onSync}
          type="button"
        >
          {syncing ? "Syncing" : "Sync queue"}
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric label="Pending" value={totalCounts.pending} />
        <Metric label="Synced" value={totalCounts.synced} />
        <Metric label="Failed" value={totalCounts.failed} />
      </dl>

      {queueError ? (
        <div
          className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-950"
          role="alert"
        >
          <p className="font-semibold">Offline queue error</p>
          <p className="mt-1">{queueError}</p>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-4 border border-dashed border-zinc-300 bg-white p-3 text-sm text-zinc-600">
          No offline scans are stored for this load job.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="border-y border-zinc-200 bg-white text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Load job</th>
                <th className="px-3 py-3 font-semibold">Scanned at</th>
                <th className="px-3 py-3 font-semibold">QR payload</th>
                <th className="px-3 py-3 font-semibold">Last error</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {items.map((item) => (
                <tr key={item.localId} className="align-top">
                  <td className="px-3 py-3">
                    <QueueStatusBadge status={item.syncStatus} />
                  </td>
                  <td className="px-3 py-3 break-all font-semibold text-zinc-950">
                    {item.loadJobId}
                  </td>
                  <td className="px-3 py-3 text-zinc-700">
                    {formatOperationalDateTime(item.scannedAt)}
                  </td>
                  <td className="px-3 py-3 break-all font-mono text-xs text-zinc-700">
                    {item.qrPayload}
                  </td>
                  <td className="px-3 py-3 text-zinc-700">
                    {item.lastError ?? "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
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

function QueueStatusBadge({ status }: { status: OfflineScanQueueItem["syncStatus"] }) {
  const styles = {
    failed: "border-red-200 bg-red-50 text-red-800",
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    synced: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[status];

  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2 text-xs font-semibold uppercase ${styles}`}
    >
      {status}
    </span>
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

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
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
