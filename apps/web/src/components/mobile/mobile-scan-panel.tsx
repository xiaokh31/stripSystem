"use client";

import jsQR from "jsqr";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  closeLoadJob,
  getLoadJobLoadedPallets,
  reverseLoadJobScan,
  scanLoadJobPallet,
  updateLoadJob,
  type AuthUserResponse,
  type LoadJobProgressResponse,
  type LoadJobResponse,
  type LoadJobScanResponse,
  type ScannedPalletResponse,
} from "@/lib/api-client";
import type { Locale } from "@/lib/i18n/catalog";
import { roleDisplayLabel } from "@/lib/i18n/status-labels";
import type { Translator } from "@/lib/i18n/translator";
import { formatOperationalDateTime } from "../../lib/date-time";
import {
  isReverseScanDisabled,
  isScanSubmitDisabled,
  cameraQrScannerMode,
  isCompleteLoadJobDisabled,
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
  offlineScanErrorCode,
  offlineScanErrorMessage,
  offlineScanSyncStatusLabel,
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
const idleDockSaveState: DockSaveState = { message: "", status: "idle" };
const idleCompleteLoadJobState: CompleteLoadJobState = {
  message: "",
  status: "idle",
};

interface CameraScanState {
  message: string;
  status: "error" | "idle" | "scanning" | "starting";
}

interface DockSaveState {
  message: string;
  status: "error" | "idle" | "saving" | "saved";
}

interface CompleteLoadJobState {
  message: string;
  status: "completed" | "error" | "idle" | "saving";
}

export interface MobileScanPermissions {
  canCompleteLoadJob: boolean;
  canReverseScan: boolean;
  canSaveDockNo: boolean;
  canScan: boolean;
  canSupervisorOverride: boolean;
}

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}

type BarcodeDetectorConstructor = new (options?: {
  formats?: string[];
}) => BarcodeDetectorLike;

export function MobileScanPanel({
  currentUser,
  initialLoadJob,
  permissions,
}: {
  currentUser: AuthUserResponse;
  initialLoadJob: LoadJobResponse;
  permissions: MobileScanPermissions;
}) {
  const { format, locale, t } = useI18n();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const cameraFrameRef = useRef<number | null>(null);
  const cameraActiveRef = useRef(false);
  const [loadJob, setLoadJob] = useState(initialLoadJob);
  const [lastScan, setLastScan] = useState<LoadJobScanResponse | null>(null);
  const [loadedPallets, setLoadedPallets] = useState<ScannedPalletResponse[]>(
    [],
  );
  const [loadedPalletsError, setLoadedPalletsError] = useState<string | null>(
    null,
  );
  const [notice, setNotice] = useState<ScanNotice | null>(null);
  const [offlineItems, setOfflineItems] = useState<OfflineScanQueueItem[]>([]);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [dockNo, setDockNo] = useState(initialLoadJob.dockNo ?? "");
  const [dockSaveState, setDockSaveState] =
    useState<DockSaveState>(idleDockSaveState);
  const [completeLoadJobState, setCompleteLoadJobState] =
    useState<CompleteLoadJobState>(idleCompleteLoadJobState);
  const [qrPayload, setQrPayload] = useState("");
  const [cameraScan, setCameraScan] = useState<CameraScanState>({
    message: "",
    status: "idle",
  });
  const [reverseConfirmed, setReverseConfirmed] = useState(false);
  const [reverseReason, setReverseReason] = useState("");
  const [selectedReversePalletId, setSelectedReversePalletId] = useState("");
  const [overridePayload, setOverridePayload] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reversingScan, setReversingScan] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);

  const progress = lastScan?.progress ?? loadJobProgressSnapshot(loadJob);
  const canSaveDockNo = loadJob.canScan && permissions.canSaveDockNo;
  const canCompleteLoadJob =
    loadJob.canScan && permissions.canCompleteLoadJob;
  const canScanThisLoadJob = loadJob.canScan && permissions.canScan;
  const canReverseThisLoadJob = loadJob.canScan && permissions.canReverseScan;
  const disabled = isScanSubmitDisabled({
    canScan: canScanThisLoadJob,
    qrPayload,
    submitting,
  });
  const dockSaving = dockSaveState.status === "saving";
  const completingLoadJob = completeLoadJobState.status === "saving";
  const completeLoadJobDisabled = isCompleteLoadJobDisabled({
    canComplete: canCompleteLoadJob,
    completing: completingLoadJob,
    dockNo,
  });
  const dockNoRequiredForCompletion =
    canCompleteLoadJob && dockNo.trim().length === 0;
  const currentLoadJobQueue = offlineItems.filter(
    (item) => item.loadJobId === loadJob.id,
  );
  const syncableCount = syncableOfflineScans(offlineItems).length;
  const selectedReversePallet =
    loadedPallets.find((pallet) => pallet.id === selectedReversePalletId) ??
    null;
  const reverseDisabled = isReverseScanDisabled({
    canScan: canReverseThisLoadJob,
    confirmed: reverseConfirmed,
    reason: reverseReason,
    reversing: reversingScan,
    scan: selectedReversePallet ? { result: "LOADED" } : null,
  });

  const stopCameraScan = useCallback((message = "") => {
    cameraActiveRef.current = false;

    if (cameraFrameRef.current !== null) {
      window.cancelAnimationFrame(cameraFrameRef.current);
      cameraFrameRef.current = null;
    }

    if (cameraStreamRef.current) {
      for (const track of cameraStreamRef.current.getTracks()) {
        track.stop();
      }
      cameraStreamRef.current = null;
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    setCameraScan({ message, status: "idle" });
  }, []);

  const refreshLoadedPallets = useCallback(async () => {
    try {
      const response = await getLoadJobLoadedPallets(loadJob.id);
      setLoadedPallets(response.items);
      setLoadedPalletsError(null);
      setSelectedReversePalletId((current) =>
        current && response.items.some((pallet) => pallet.id === current)
          ? current
          : (response.items[0]?.id ?? ""),
      );
    } catch (error) {
      setLoadedPalletsError(scanErrorNotice(error, locale).message);
    }
  }, [loadJob.id, locale]);

  const loadOfflineQueue = useCallback(() => {
    try {
      setOfflineItems(readOfflineScanQueue(window.localStorage));
      setQueueError(null);
    } catch (error) {
      setQueueError(offlineScanErrorMessage(error, locale));
    }
  }, [locale]);

  const queueScanLocally = useCallback(
    (payload: string) => {
      try {
        const item = queueOfflineScan(window.localStorage, {
          deviceId: DEVICE_ID,
          loadJobId: loadJob.id,
          qrPayload: payload,
        });
        setOfflineItems(readOfflineScanQueue(window.localStorage));
        setNotice(offlineQueuedNotice(item, locale));
        setQueueError(null);
        setQrPayload("");
      } catch (error) {
        const message = offlineScanErrorMessage(error, locale);
        setQueueError(message);
        setNotice({
          code: "OFFLINE_QUEUE_WRITE_FAILED",
          message,
          title: t("Offline queue failed"),
          tone: "red",
        });
      }
    },
    [loadJob.id, locale, t],
  );

  const syncQueuedScans = useCallback(async () => {
    if (syncingQueue) {
      return;
    }

    if (!permissions.canScan) {
      setQueueError(
        t("Sign in as a user with scan permission before syncing queued scans."),
      );
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
            setNotice(scanSuccessNotice(response, locale));
            if (response.result === "LOADED") {
              setLoadedPallets((items) => [
                response.pallet,
                ...items.filter((pallet) => pallet.id !== response.pallet.id),
              ]);
              setSelectedReversePalletId(response.pallet.id);
              setLoadedPalletsError(null);
            }
            refreshedCurrentLoadJob = true;
          }
        } catch (error) {
          const errorCode = offlineScanErrorCode(error);
          items = markOfflineScanFailed(
            readOfflineScanQueue(window.localStorage),
            item.localId,
            errorCode,
          );
          writeOfflineScanQueue(window.localStorage, items);
          setOfflineItems(items);

          if (item.loadJobId === loadJob.id) {
            setNotice(scanErrorNotice(error, locale));
          }
        }
      }

      if (refreshedCurrentLoadJob) {
        router.refresh();
      }
    } catch (error) {
      setQueueError(offlineScanErrorMessage(error, locale));
    } finally {
      setSyncingQueue(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [loadJob.id, locale, permissions.canScan, router, syncingQueue, t]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => stopCameraScan();
  }, [stopCameraScan]);

  useEffect(() => {
    const timeout = window.setTimeout(loadOfflineQueue, 0);
    return () => window.clearTimeout(timeout);
  }, [loadOfflineQueue]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void refreshLoadedPallets();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [refreshLoadedPallets]);

  useEffect(() => {
    function handleOnline() {
      void syncQueuedScans();
    }

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [syncQueuedScans]);

  async function submitPayload(payload: string) {
    const normalizedPayload = normalizeScanInput(payload);

    if (
      isScanSubmitDisabled({
        canScan: canScanThisLoadJob,
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
      setNotice(scanSuccessNotice(response, locale));
      if (response.result === "LOADED") {
        setLoadedPallets((items) => [
          response.pallet,
          ...items.filter((pallet) => pallet.id !== response.pallet.id),
        ]);
        setSelectedReversePalletId(response.pallet.id);
        setLoadedPalletsError(null);
      }
      setQrPayload("");
      setReverseConfirmed(false);
      setReverseReason("");
      router.refresh();
    } catch (error) {
      if (shouldQueueOfflineScan(error)) {
        queueScanLocally(normalizedPayload);
      } else {
        if (
          error instanceof ApiClientError &&
          error.code === "PALLET_ALREADY_LOADED" &&
          permissions.canSupervisorOverride
        ) {
          setOverridePayload(normalizedPayload);
          setOverrideConfirmed(false);
          setOverrideReason("");
        }
        setNotice(scanErrorNotice(error, locale));
      }
    } finally {
      setSubmitting(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPayload(qrPayload);
  }

  async function submitSupervisorOverride() {
    const normalizedPayload = normalizeScanInput(overridePayload);
    const reason = overrideReason.trim();
    if (
      submitting ||
      !permissions.canSupervisorOverride ||
      !overrideConfirmed ||
      !normalizedPayload ||
      !reason
    ) {
      return;
    }

    setSubmitting(true);
    setNotice(null);

    try {
      const response = await scanLoadJobPallet(loadJob.id, {
        deviceId: DEVICE_ID,
        overrideReason: reason,
        qrPayload: normalizedPayload,
        supervisorOverride: true,
      });
      setLoadJob(response.loadJob);
      setLastScan(response);
      setNotice({
        code: "SUPERVISOR_OVERRIDE",
        message: t("Supervisor override accepted and audited."),
        title: t("Override accepted"),
        tone: "amber",
      });
      setLoadedPallets((items) => [
        response.pallet,
        ...items.filter((pallet) => pallet.id !== response.pallet.id),
      ]);
      setSelectedReversePalletId(response.pallet.id);
      setLoadedPalletsError(null);
      setQrPayload("");
      setOverridePayload("");
      setOverrideReason("");
      setOverrideConfirmed(false);
      router.refresh();
    } catch (error) {
      setNotice(scanErrorNotice(error, locale));
    } finally {
      setSubmitting(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function saveDockNo() {
    if (dockSaving || !canSaveDockNo) {
      return;
    }

    setDockSaveState({ message: t("Saving dock number."), status: "saving" });

    try {
      const result = await updateLoadJob(loadJob.id, {
        dockNo: dockNo.trim(),
      });
      setLoadJob(result);
      setDockNo(result.dockNo ?? "");
      setDockSaveState({
        message: result.dockNo
          ? format("i18n.mobile.dockSaved", { dockNo: result.dockNo })
          : t("i18n.mobile.dockSavedEmpty"),
        status: "saved",
      });
      router.refresh();
    } catch (error) {
      setDockSaveState({
        message: dockSaveErrorMessage(error, t),
        status: "error",
      });
    } finally {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function completeLoadJobFromMobile() {
    if (completingLoadJob || !canCompleteLoadJob) {
      return;
    }

    const normalizedDockNo = dockNo.trim();
    if (!normalizedDockNo) {
      setCompleteLoadJobState({
        message: t("Dock No. is required before completing this load job."),
        status: "error",
      });
      return;
    }

    setCompleteLoadJobState({
      message: t("Completing load job..."),
      status: "saving",
    });

    try {
      stopCameraScan();
      const result = await closeLoadJob(loadJob.id, {
        dockNo: normalizedDockNo,
        note: "Completed from mobile scan page.",
        reason: "Warehouse loading completed.",
      });
      setLoadJob(result);
      setDockNo(result.dockNo ?? normalizedDockNo);
      setCompleteLoadJobState({
        message: format("i18n.mobile.completedBy", {
          user: currentUser.name ?? currentUser.email ?? currentUser.id,
        }),
        status: "completed",
      });
      setNotice({
        code: "LOAD_JOB_COMPLETED",
        message: t("This load job is now completed and closed for scanning."),
        title: t("Loading completed"),
        tone: "emerald",
      });
      router.refresh();
    } catch (error) {
      setCompleteLoadJobState({
        message: completeLoadJobErrorMessage(error, t),
        status: "error",
      });
    } finally {
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  async function startCameraScan() {
    if (!canScanThisLoadJob || submitting || cameraScan.status === "starting") {
      return;
    }

    const mode = cameraQrScannerMode({
      hasBarcodeDetector: barcodeDetectorConstructor() !== null,
      hasCanvas: browserCanDecodeVideoWithCanvas(),
      hasGetUserMedia: Boolean(navigator.mediaDevices?.getUserMedia),
    });

    if (mode === "unsupported") {
      setCameraScan({
        message: t(
          "This browser cannot open or decode camera QR scans. Use a scanner or manual input.",
        ),
        status: "error",
      });
      return;
    }

    stopCameraScan();
    setCameraScan({ message: t("Opening camera..."), status: "starting" });

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "environment" } },
      });
      cameraStreamRef.current = stream;

      if (!videoRef.current) {
        stopCameraScan(t("Camera view is not available."));
        return;
      }

      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      const BarcodeDetector = barcodeDetectorConstructor();
      const detector =
        mode === "native" && BarcodeDetector
          ? new BarcodeDetector({ formats: ["qr_code"] })
          : null;
      const canvas = cameraCanvasRef.current ?? document.createElement("canvas");
      cameraCanvasRef.current = canvas;
      cameraActiveRef.current = true;
      setCameraScan({
        message:
          mode === "native"
            ? t("Point the camera at a pallet QR label.")
            : t("Point the camera at a pallet QR label. Canvas QR scanning is active."),
        status: "scanning",
      });

      const detectFrame = async () => {
        if (!cameraActiveRef.current || !videoRef.current) {
          return;
        }

        try {
          const rawValue = (
            await detectQrFromVideo(videoRef.current, detector, canvas)
          )?.trim();

          if (rawValue) {
            stopCameraScan(t("QR captured."));
            await submitPayload(rawValue);
            return;
          }
        } catch {
          stopCameraScan(
            t("Camera QR scanning failed. Use a scanner or manual input."),
          );
          return;
        }

        cameraFrameRef.current = window.requestAnimationFrame(detectFrame);
      };

      cameraFrameRef.current = window.requestAnimationFrame(detectFrame);
    } catch {
      stopCameraScan();
      setCameraScan({
        message: t("Camera permission was denied or unavailable."),
        status: "error",
      });
    }
  }

  async function reverseSelectedPallet() {
    if (reverseDisabled || !selectedReversePallet) {
      return;
    }

    setReversingScan(true);
    setNotice(null);

    try {
      const response = await reverseLoadJobScan(loadJob.id, {
        confirm: true,
        deviceId: DEVICE_ID,
        palletRecordId: selectedReversePallet.id,
        reason: reverseReason.trim(),
      });
      setLoadJob(response.loadJob);
      setLastScan(response);
      setNotice(scanSuccessNotice(response, locale));
      const nextSelectedPalletId =
        loadedPallets.find((pallet) => pallet.id !== selectedReversePallet.id)
          ?.id ?? "";
      setLoadedPallets((items) =>
        items.filter((pallet) => pallet.id !== selectedReversePallet.id),
      );
      setSelectedReversePalletId(nextSelectedPalletId);
      setLoadedPalletsError(null);
      setReverseConfirmed(false);
      setReverseReason("");
      router.refresh();
    } catch (error) {
      setNotice(scanErrorNotice(error, locale));
    } finally {
      setReversingScan(false);
      window.setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-4 shadow-sm sm:p-5">
      <MobileScanUserPanel
        currentUser={currentUser}
        permissions={permissions}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 border border-zinc-200 bg-zinc-50 p-3">
            <label className="grid gap-2 text-base font-semibold text-zinc-950">
              {t("Dock No.")}
              <input
                className="min-h-14 w-full border border-zinc-300 bg-white px-4 text-xl font-semibold text-zinc-950 outline-none focus:border-teal-700 focus:ring-4 focus:ring-teal-100 disabled:bg-zinc-100 disabled:text-zinc-500"
                disabled={!canSaveDockNo || dockSaving}
                onChange={(event) => setDockNo(event.target.value)}
                placeholder={t("Dock door")}
                type="text"
                value={dockNo}
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                className="min-h-12 border border-teal-800 bg-white px-4 text-base font-semibold text-teal-900 hover:bg-teal-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-500"
                disabled={!canSaveDockNo || dockSaving}
                onClick={() => {
                  void saveDockNo();
                }}
                type="button"
              >
                {dockSaving ? t("Saving dock") : t("Save dock")}
              </button>
              <button
                className="min-h-12 border border-emerald-800 bg-emerald-800 px-4 text-base font-semibold text-white hover:bg-emerald-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
                disabled={
                  completeLoadJobDisabled
                }
                onClick={() => {
                  void completeLoadJobFromMobile();
                }}
                type="button"
              >
                {completingLoadJob ? t("Completing") : t("Complete loading")}
              </button>
            </div>
            {dockNoRequiredForCompletion ? (
              <div
                className="border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950"
                role="alert"
              >
                {t("Dock No. is required before completing this load job.")}
              </div>
            ) : null}
            {dockSaveState.message ? (
              <div
                className={`border p-3 text-sm font-medium ${
                  dockSaveState.status === "error"
                    ? "border-red-200 bg-red-50 text-red-950"
                    : "border-emerald-200 bg-emerald-50 text-emerald-950"
                }`}
                role={dockSaveState.status === "error" ? "alert" : "status"}
              >
                {dockSaveState.message}
              </div>
            ) : null}
            {completeLoadJobState.message ? (
              <div
                className={`border p-3 text-sm font-medium ${
                  completeLoadJobState.status === "error"
                    ? "border-red-200 bg-red-50 text-red-950"
                    : "border-emerald-200 bg-emerald-50 text-emerald-950"
                }`}
                role={
                  completeLoadJobState.status === "error" ? "alert" : "status"
                }
              >
                {completeLoadJobState.message}
              </div>
            ) : null}
          </div>

          <label className="grid gap-2 text-base font-semibold text-zinc-950">
            {t("Pallet QR scan")}
            <input
              ref={inputRef}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className="min-h-16 w-full border-2 border-teal-700 bg-white px-4 text-xl font-semibold text-zinc-950 outline-none focus:border-teal-900 focus:ring-4 focus:ring-teal-100"
              disabled={!canScanThisLoadJob || submitting}
              inputMode="text"
              onChange={(event) => setQrPayload(event.target.value)}
              placeholder={t("Scan pallet QR, then Enter")}
              spellCheck={false}
              type="text"
              value={qrPayload}
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <button
              className="min-h-12 border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-950 hover:border-teal-700 hover:text-teal-900 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
              disabled={!canScanThisLoadJob || submitting}
              onClick={() => {
                void startCameraScan();
              }}
              type="button"
            >
              {t("Camera scan")}
            </button>
            <button
              className="min-h-12 border border-zinc-300 bg-white px-4 text-base font-semibold text-zinc-950 hover:border-zinc-500 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
              disabled={cameraScan.status === "idle"}
              onClick={() => stopCameraScan()}
              type="button"
            >
              {t("Stop camera")}
            </button>
          </div>

          <CameraScanPanel cameraScan={cameraScan} videoRef={videoRef} />

          <button
            className="min-h-16 w-full border border-teal-800 bg-teal-800 px-5 text-lg font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={disabled}
            type="submit"
          >
            {submitting ? t("Submitting scan") : t("Submit scan")}
          </button>

          {!loadJob.canScan ? (
            <div
              className="border border-amber-200 bg-amber-50 p-4 text-base text-amber-950"
              role="alert"
            >
              <p className="font-semibold">{t("Load job closed")}</p>
              <p className="mt-1">
                {t("This load job is not open for scanning. Select an open load job.")}
              </p>
            </div>
          ) : null}

          {loadJob.canScan && !permissions.canScan ? (
            <div
              className="border border-red-200 bg-red-50 p-4 text-base text-red-950"
              role="alert"
            >
              <p className="font-semibold">{t("Scan permission required")}</p>
              <p className="mt-1">
                {t("This account can view the load job but cannot scan pallets.")}
              </p>
            </div>
          ) : null}

          {overridePayload && permissions.canSupervisorOverride ? (
            <SupervisorOverridePanel
              confirmed={overrideConfirmed}
              disabled={
                submitting ||
                !overrideConfirmed ||
                overrideReason.trim().length === 0
              }
              onCancel={() => {
                setOverridePayload("");
                setOverrideReason("");
                setOverrideConfirmed(false);
              }}
              onConfirmChange={setOverrideConfirmed}
              onReasonChange={setOverrideReason}
              onSubmit={() => {
                void submitSupervisorOverride();
              }}
              payload={overridePayload}
              reason={overrideReason}
              submitting={submitting}
            />
          ) : null}

          {notice ? <ScanNoticePanel notice={notice} /> : null}
        </form>

        <div className="grid gap-4">
          <ProgressPanel progress={progress} />
          <LastScanPanel scan={lastScan} />
          <ReverseScanPanel
            canReverse={canReverseThisLoadJob}
            confirmed={reverseConfirmed}
            disabled={reverseDisabled}
            error={loadedPalletsError}
            loadedPallets={loadedPallets}
            reason={reverseReason}
            reversing={reversingScan}
            selectedPalletId={selectedReversePalletId}
            onConfirmChange={setReverseConfirmed}
            onReasonChange={setReverseReason}
            onReverse={() => {
              void reverseSelectedPallet();
            }}
            onSelectedPalletChange={setSelectedReversePalletId}
          />
        </div>
      </div>

      <OfflineQueuePanel
        canSync={permissions.canScan}
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
        {format("i18n.mobile.remainingForLoadJob", {
          loadJob: loadJobDisplayName(loadJob),
        })}
      </p>
    </section>
  );
}

function CameraScanPanel({
  cameraScan,
  videoRef,
}: {
  cameraScan: CameraScanState;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const { t } = useI18n();
  const isActive =
    cameraScan.status === "scanning" || cameraScan.status === "starting";
  const messageStyles =
    cameraScan.status === "error"
      ? "border-red-200 bg-red-50 text-red-950"
      : "border-zinc-200 bg-zinc-50 text-zinc-700";

  return (
    <div className="grid gap-2">
      <video
        ref={videoRef}
        aria-label={t("Camera QR scanner")}
        className={[
          "aspect-[4/3] w-full border border-zinc-300 bg-zinc-950 object-cover",
          isActive ? "block" : "hidden",
        ].join(" ")}
        muted
        playsInline
      />
      {cameraScan.message ? (
        <div className={`border p-3 text-sm font-medium ${messageStyles}`}>
          {cameraScan.message}
        </div>
      ) : null}
    </div>
  );
}

function SupervisorOverridePanel({
  confirmed,
  disabled,
  onCancel,
  onConfirmChange,
  onReasonChange,
  onSubmit,
  payload,
  reason,
  submitting,
}: {
  confirmed: boolean;
  disabled: boolean;
  onCancel: () => void;
  onConfirmChange: (value: boolean) => void;
  onReasonChange: (value: string) => void;
  onSubmit: () => void;
  payload: string;
  reason: string;
  submitting: boolean;
}) {
  const { t } = useI18n();

  return (
    <section className="border border-amber-300 bg-amber-50 p-4 text-base text-amber-950">
      <h2 className="font-semibold">{t("Supervisor override required")}</h2>
      <p className="mt-2 text-sm leading-6">
        {t(
          "This pallet is already assigned to another load job. A supervisor can move it to this load job only after confirming the reason.",
        )}
      </p>
      <p className="mt-2 break-all text-xs font-medium">
        {t("Payload:")} {payload}
      </p>
      <label className="mt-3 grid gap-1 text-sm font-semibold">
        {t("Override reason")}
        <textarea
          className="min-h-20 border border-amber-300 bg-white px-3 py-2 text-zinc-950 outline-none focus:border-amber-700"
          onChange={(event) => onReasonChange(event.target.value)}
          value={reason}
        />
      </label>
      <label className="mt-3 flex min-h-10 items-start gap-2 text-sm font-medium">
        <input
          checked={confirmed}
          className="mt-1 h-4 w-4 accent-amber-700"
          onChange={(event) => onConfirmChange(event.target.checked)}
          type="checkbox"
        />
        {t(
          "I confirm this supervisor override should move the pallet to the current load job and create an audit event.",
        )}
      </label>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          className="min-h-11 border border-amber-800 bg-amber-800 px-4 text-sm font-semibold text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={disabled}
          onClick={onSubmit}
          type="button"
        >
          {submitting ? t("Submitting override") : t("Submit override")}
        </button>
        <button
          className="min-h-11 border border-amber-300 bg-white px-4 text-sm font-semibold text-amber-950 hover:bg-amber-100"
          onClick={onCancel}
          type="button"
        >
          {t("Cancel override")}
        </button>
      </div>
    </section>
  );
}

function MobileScanUserPanel({
  currentUser,
  permissions,
}: {
  currentUser: AuthUserResponse;
  permissions: MobileScanPermissions;
}) {
  const { format, locale, t } = useI18n();
  const displayName = currentUser.name ?? currentUser.email ?? currentUser.id;
  const permissionSummary = [
    permissions.canSaveDockNo ? t("Dock") : null,
    permissions.canCompleteLoadJob ? t("Complete") : null,
    permissions.canScan ? t("Scan") : null,
    permissions.canSupervisorOverride ? t("Supervisor override") : null,
    permissions.canReverseScan ? t("Reverse scan") : null,
  ]
    .filter((label): label is string => Boolean(label));
  const roleText = format("i18n.mobile.roles", {
    roles: localizedList(
      currentUser.roles.map((role) => roleDisplayLabel(role, locale)),
      locale,
    ) || t("None"),
  });
  const permissionText = format("i18n.mobile.permissions", {
    permissions: localizedList(permissionSummary, locale) || t("Read only"),
  });

  return (
    <div className="mb-4 border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
      <p className="font-semibold text-zinc-950">
        {t("Signed in as")} {displayName}
      </p>
      <p className="mt-1 break-all">{roleText}</p>
      <p className="mt-1">{permissionText}</p>
    </div>
  );
}

function dockSaveErrorMessage(error: unknown, t: Translator["t"]): string {
  if (error instanceof ApiClientError) {
    if (error.code === "NOT_FOUND" && error.message.includes("Cannot PATCH")) {
      return t(
        "The running API has not loaded load job edit routes. Restart the API service and try again.",
      );
    }
  }

  return t("Dock number could not be saved.");
}

function completeLoadJobErrorMessage(
  error: unknown,
  t: Translator["t"],
): string {
  if (error instanceof ApiClientError) {
    if (error.code === "LOAD_JOB_DOCK_NO_REQUIRED_FOR_COMPLETED") {
      return t("Dock No. is required before completing this load job.");
    }
  }

  return t("The load job could not be completed.");
}

function ReverseScanPanel({
  canReverse,
  confirmed,
  disabled,
  error,
  loadedPallets,
  onConfirmChange,
  onReasonChange,
  onReverse,
  onSelectedPalletChange,
  reason,
  reversing,
  selectedPalletId,
}: {
  canReverse: boolean;
  confirmed: boolean;
  disabled: boolean;
  error: string | null;
  loadedPallets: ScannedPalletResponse[];
  onConfirmChange: (value: boolean) => void;
  onReasonChange: (value: string) => void;
  onReverse: () => void;
  onSelectedPalletChange: (value: string) => void;
  reason: string;
  reversing: boolean;
  selectedPalletId: string;
}) {
  const { t } = useI18n();
  const selectedPallet =
    loadedPallets.find((pallet) => pallet.id === selectedPalletId) ?? null;

  return (
    <div className="border border-amber-200 bg-amber-50 p-4">
      <h2 className="text-base font-semibold text-amber-950">
        {t("Adjust current progress")}
      </h2>
      <p className="mt-1 text-sm text-amber-950">
        {t(
          "Remove a loaded pallet from this load job only when it will not be loaded.",
        )}
      </p>
      {!canReverse ? (
        <p
          className="mt-3 border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-950"
          role="alert"
        >
          {t("This account can view loaded pallets but cannot reverse scans.")}
        </p>
      ) : null}

      {error ? (
        <p
          className="mt-3 border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-950"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {loadedPallets.length === 0 ? (
        <p className="mt-3 border border-amber-300 bg-white p-3 text-sm font-medium text-amber-950">
          {t("No loaded pallets are currently attached to this load job.")}
        </p>
      ) : null}

      {loadedPallets.length > 0 ? (
        <div className="mt-4 grid gap-3">
          <label className="grid gap-2 text-sm font-semibold text-amber-950">
            {t("Loaded pallet")}
            <select
              className="min-h-12 w-full border border-amber-300 bg-white px-3 text-base text-zinc-950 outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
              disabled={!canReverse || reversing}
              onChange={(event) => onSelectedPalletChange(event.target.value)}
              value={selectedPallet?.id ?? ""}
            >
              {loadedPallets.map((pallet) => (
                <option key={pallet.id} value={pallet.id}>
                  {loadedPalletLabel(pallet)}
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-2 text-sm font-semibold text-amber-950">
            {t("Reason")}
            <textarea
              className="min-h-24 w-full border border-amber-300 bg-white p-3 text-base text-zinc-950 outline-none focus:border-amber-700 focus:ring-4 focus:ring-amber-100"
              disabled={!canReverse || reversing}
              maxLength={240}
              onChange={(event) => onReasonChange(event.target.value)}
              placeholder={t("Damage, pallet consolidation, short load...")}
              value={reason}
            />
          </label>

          <label className="flex items-start gap-3 text-sm font-semibold text-amber-950">
            <input
              checked={confirmed}
              className="mt-1 h-5 w-5"
              disabled={!canReverse || reversing}
              onChange={(event) => onConfirmChange(event.target.checked)}
              type="checkbox"
            />
            {t(
              "Confirm this pallet should be removed from current load job progress.",
            )}
          </label>

          <button
            className="min-h-12 border border-amber-800 bg-amber-800 px-4 text-sm font-semibold text-white hover:bg-amber-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={disabled}
            onClick={onReverse}
            type="button"
          >
            {reversing ? t("Updating progress") : t("Remove from load job")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function OfflineQueuePanel({
  canSync,
  items,
  onSync,
  queueError,
  syncableCount,
  syncing,
  totalCounts,
}: {
  canSync: boolean;
  items: OfflineScanQueueItem[];
  onSync: () => void;
  queueError: string | null;
  syncableCount: number;
  syncing: boolean;
  totalCounts: { failed: number; pending: number; synced: number };
}) {
  const { locale, t } = useI18n();

  return (
    <div className="mt-4 border border-zinc-200 bg-zinc-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("Offline scan queue")}
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            {t(
              "Pending scans stay local and do not change inventory until the API accepts them.",
            )}
          </p>
        </div>
        <button
          className="min-h-11 border border-teal-800 bg-teal-800 px-4 text-sm font-semibold text-white hover:bg-teal-900 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
          disabled={!canSync || syncing || syncableCount === 0}
          onClick={onSync}
          type="button"
        >
          {syncing ? t("Syncing") : t("Sync queue")}
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric label={t("Pending")} value={totalCounts.pending} />
        <Metric label={t("Synced")} value={totalCounts.synced} />
        <Metric label={t("Failed")} value={totalCounts.failed} />
      </dl>

      {!canSync ? (
        <div
          className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-950"
          role="alert"
        >
          <p className="font-semibold">{t("Scan permission required")}</p>
          <p className="mt-1">
            {t(
              "Pending scans remain local until a user with scan permission signs in and syncs them.",
            )}
          </p>
        </div>
      ) : null}

      {queueError ? (
        <div
          className="mt-4 border border-red-200 bg-red-50 p-3 text-sm text-red-950"
          role="alert"
        >
          <p className="font-semibold">{t("Offline queue error")}</p>
          <p className="mt-1">{queueError}</p>
        </div>
      ) : null}

      {items.length === 0 ? (
        <p className="mt-4 border border-dashed border-zinc-300 bg-white p-3 text-sm text-zinc-600">
          {t("No offline scans are stored for this load job.")}
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="border-y border-zinc-200 bg-white text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-3 py-3 font-semibold">{t("Status")}</th>
                <th className="px-3 py-3 font-semibold">{t("Load job")}</th>
                <th className="px-3 py-3 font-semibold">{t("Scanned at")}</th>
                <th className="px-3 py-3 font-semibold">{t("QR payload")}</th>
                <th className="px-3 py-3 font-semibold">{t("Last error")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 bg-white">
              {items.map((item) => (
                <tr key={item.localId} className="align-top">
                  <td className="px-3 py-3">
                    <QueueStatusBadge locale={locale} status={item.syncStatus} />
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
                    {item.lastError
                      ? offlineScanErrorMessage(item.lastError, locale)
                      : "-"}
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
        <p
          className="mt-1 text-xs font-semibold uppercase"
          data-i18n-ignore
        >
          {notice.code}
        </p>
      ) : null}
      <p className="mt-2 leading-6">{notice.message}</p>
    </div>
  );
}

function QueueStatusBadge({
  locale,
  status,
}: {
  locale: Locale;
  status: OfflineScanQueueItem["syncStatus"];
}) {
  const styles = {
    failed: "border-red-200 bg-red-50 text-red-800",
    pending: "border-amber-200 bg-amber-50 text-amber-800",
    synced: "border-emerald-200 bg-emerald-50 text-emerald-800",
  }[status];

  return (
    <span
      className={`inline-flex min-h-7 items-center border px-2 text-xs font-semibold uppercase ${styles}`}
      title={offlineScanSyncStatusLabel(status, locale)}
    >
      {offlineScanSyncStatusLabel(status, locale)}
    </span>
  );
}

function ProgressPanel({ progress }: { progress: LoadJobProgressResponse }) {
  const { t } = useI18n();

  return (
    <div className="border border-zinc-200 bg-zinc-50 p-4">
      <h2 className="text-base font-semibold text-zinc-950">
        {t("Current load job progress")}
      </h2>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Metric label={t("Plan")} value={progress.totalPallets} />
        <Metric label={t("Loaded")} value={progress.loadedPallets} />
        <Metric label={t("Remaining")} value={progress.remainingPallets} />
      </dl>
    </div>
  );
}

function isBrowserOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

function barcodeDetectorConstructor(): BarcodeDetectorConstructor | null {
  const candidate = (globalThis as { BarcodeDetector?: unknown })
    .BarcodeDetector;

  return typeof candidate === "function"
    ? (candidate as BarcodeDetectorConstructor)
    : null;
}

async function detectQrFromVideo(
  video: HTMLVideoElement,
  detector: BarcodeDetectorLike | null,
  canvas: HTMLCanvasElement,
): Promise<string | null> {
  if (detector) {
    try {
      const detections = await detector.detect(video);
      const rawValue = detections[0]?.rawValue?.trim();
      if (rawValue) {
        return rawValue;
      }
    } catch {
      // Fall through to the canvas/jsQR decoder. Some browser builds expose
      // BarcodeDetector but reject live video frames.
    }
  }

  return decodeQrFromVideoCanvas(video, canvas);
}

function decodeQrFromVideoCanvas(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
): string | null {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) {
    return null;
  }

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!context) {
    return null;
  }

  context.drawImage(video, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const result = jsQR(imageData.data, width, height);
  return result?.data?.trim() || null;
}

function browserCanDecodeVideoWithCanvas(): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const canvas = document.createElement("canvas");
  return typeof canvas.getContext === "function" && Boolean(canvas.getContext("2d"));
}

function loadedPalletLabel(pallet: ScannedPalletResponse): string {
  return [
    pallet.containerNo,
    pallet.destinationCode,
    `P${pallet.palletNo}`,
    pallet.palletId,
  ]
    .filter(Boolean)
    .join(" / ");
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
  const { t } = useI18n();

  if (!scan) {
    return (
      <div className="border border-dashed border-zinc-300 bg-zinc-50 p-4 text-sm text-zinc-600">
        {t("No pallet has been accepted for this screen session yet.")}
      </div>
    );
  }

  return (
    <div className="border border-zinc-200 bg-white p-4">
      <h2 className="text-base font-semibold text-zinc-950">
        {t("Last pallet")}
      </h2>
      <dl className="mt-4 grid gap-3 text-sm">
        <DetailRow label={t("Container")} value={scan.pallet.containerNo} />
        <DetailRow label={t("Destination")} value={scan.pallet.destinationCode} />
        <DetailRow label={t("Pallet No.")} value={scan.pallet.palletNo} />
        <DetailRow label={t("Pallet ID")} value={scan.pallet.palletId} wrap />
        <DetailRow
          label={t("Remaining in plan")}
          value={scan.progress.remainingPallets}
        />
      </dl>
    </div>
  );
}

function localizedList(values: string[], locale: Locale): string {
  if (values.length === 0) {
    return "";
  }

  return new Intl.ListFormat(locale, {
    style: "long",
    type: "conjunction",
  }).format(values);
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
