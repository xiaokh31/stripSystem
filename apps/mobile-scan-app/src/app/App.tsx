import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { NativeApiError } from "../api/api-error";
import { checkApiHealth, type HealthCheckResult } from "../api/health-client";
import { restoreSession, signIn, signOut } from "../auth/auth-session";
import type { AuthSession } from "../auth/auth-session";
import {
  canCompleteMobileLoadJob,
  canSupervisorOverrideScans,
  canUpdateMobileDock,
  canUseMobileScan,
} from "../auth/mobile-permissions";
import { AsyncStorageTokenStore } from "../auth/token-store";
import { defaultApiBaseUrl, loadLanSettings, saveApiBaseUrl } from "../config/lan-settings";
import { getOrCreateDeviceId } from "../device/device-id";
import {
  closeLoadJob,
  getLoadJob,
  listOpenLoadJobs,
  scanLoadJobPallet,
  updateLoadJob,
} from "../load-jobs/load-jobs-client";
import type { LoadJob, LoadJobScanResponse } from "../load-jobs/load-job-types";
import {
  formatNullable,
  formatScheduledDeparture,
  loadJobDisplayName,
  loadJobLineSummary,
  loadJobProgress,
} from "../load-jobs/load-job-view-model";
import type { OfflineScanRecord } from "../offline-queue/offline-queue-types";
import { AsyncStorageOfflineQueueStore } from "../offline-queue/offline-queue-store";
import {
  offlineErrorMessage,
  shouldQueueOfflineScan,
  syncOfflineScanRecord,
} from "../offline-queue/offline-sync";
import { createNativeCameraScanner } from "../scan/native-camera-scanner";
import {
  isCompleteLoadingDisabled,
  isScanSubmitDisabled,
  isSupervisorOverrideDisabled,
  normalizeScanInput,
  scanErrorNotice,
  type ScanNotice,
  scanSuccessNotice,
} from "../scan/scan-view-model";
import { AsyncStorageSettingsStore } from "../storage/async-storage-settings-store";
import type { SettingsStore } from "../storage/settings-store";
import { appStyles } from "../ui/styles";

const initialAuthSession: AuthSession = {
  message: "Checking saved session.",
  status: "checking",
  user: null,
};

interface LoadJobsState {
  items: LoadJob[];
  message: string;
  status: "blocked" | "empty" | "error" | "idle" | "loading" | "ready";
}

const initialLoadJobsState: LoadJobsState = {
  items: [],
  message: "Sign in to view open load jobs.",
  status: "idle",
};

export function App() {
  const settingsStore = useMemo<SettingsStore>(
    () => new AsyncStorageSettingsStore(),
    [],
  );
  const tokenStore = useMemo(
    () => new AsyncStorageTokenStore(settingsStore),
    [settingsStore],
  );
  const offlineQueueStore = useMemo(
    () => new AsyncStorageOfflineQueueStore(settingsStore),
    [settingsStore],
  );
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [deviceId, setDeviceId] = useState("Loading device.");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [health, setHealth] = useState<HealthCheckResult>({
    checkedAt: "",
    message: "API status has not been checked.",
    ok: false,
  });
  const [authSession, setAuthSession] =
    useState<AuthSession>(initialAuthSession);
  const [loadJobsState, setLoadJobsState] =
    useState<LoadJobsState>(initialLoadJobsState);
  const [selectedLoadJob, setSelectedLoadJob] = useState<LoadJob | null>(null);
  const [qrPayload, setQrPayload] = useState("");
  const [dockNo, setDockNo] = useState("");
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [overridePayload, setOverridePayload] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);
  const [lastScan, setLastScan] = useState<LoadJobScanResponse | null>(null);
  const [offlineQueue, setOfflineQueue] = useState<OfflineScanRecord[]>([]);
  const [submittingScan, setSubmittingScan] = useState(false);
  const [submittingOverride, setSubmittingOverride] = useState(false);
  const [savingDock, setSavingDock] = useState(false);
  const [completingLoadJob, setCompletingLoadJob] = useState(false);
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [cameraScanning, setCameraScanning] = useState(false);
  const [openingLoadJobId, setOpeningLoadJobId] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [settings, resolvedDeviceId] = await Promise.all([
        loadLanSettings(settingsStore),
        getOrCreateDeviceId(settingsStore),
      ]);
      const queuedScans = await offlineQueueStore.list();
      if (!mounted) {
        return;
      }
      setApiBaseUrl(settings.apiBaseUrl);
      setDeviceId(resolvedDeviceId);
      setOfflineQueue(queuedScans);
      setAuthSession(
        await restoreSession({
          apiBaseUrl: settings.apiBaseUrl,
          tokenStore,
        }),
      );
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [settingsStore, tokenStore]);

  async function saveAndCheck() {
    if (checking) {
      return;
    }

    setChecking(true);
    try {
      const saved = await saveApiBaseUrl(settingsStore, apiBaseUrl);
      setApiBaseUrl(saved.apiBaseUrl);
      const healthResult = await checkApiHealth(saved.apiBaseUrl);
      setHealth(healthResult);
      setAuthSession(
        await restoreSession({
          apiBaseUrl: saved.apiBaseUrl,
          tokenStore,
        }),
      );
      if (healthResult.ok) {
        await syncOfflineQueue(saved.apiBaseUrl);
      }
    } catch (error) {
      setHealth({
        checkedAt: new Date().toISOString(),
        message:
          error instanceof Error
            ? error.message
            : "API base URL could not be saved.",
        ok: false,
      });
    } finally {
      setChecking(false);
    }
  }

  async function submitLogin() {
    if (signingIn) {
      return;
    }

    setSigningIn(true);
    try {
      setAuthSession(
        await signIn(
          apiBaseUrl,
          {
            email,
            password,
          },
          tokenStore,
        ),
      );
      setPassword("");
      setSelectedLoadJob(null);
      setDockNo("");
      clearScanState();
      await syncOfflineQueue(apiBaseUrl);
    } catch (error) {
      setAuthSession({
        message: toLoginErrorMessage(error),
        status:
          error instanceof NativeApiError && error.status === 403
            ? "permission_denied"
            : "error",
        user: null,
      });
    } finally {
      setSigningIn(false);
    }
  }

  async function submitLogout() {
    setAuthSession(await signOut(tokenStore));
    setLoadJobsState(initialLoadJobsState);
    setSelectedLoadJob(null);
    setDockNo("");
    clearScanState();
  }

  async function refreshOpenLoadJobs() {
    if (!canUseMobileScan(authSession.user)) {
      setLoadJobsState({
        items: [],
        message: "This account cannot view mobile load jobs.",
        status: "blocked",
      });
      return;
    }

    const token = await tokenStore.getToken();
    if (!token) {
      setAuthSession({
        message: "Session expired. Sign in again.",
        status: "session_expired",
        user: null,
      });
      setLoadJobsState(initialLoadJobsState);
      clearScanState();
      return;
    }

    setLoadJobsState({
      items: loadJobsState.items,
      message: "Loading open load jobs.",
      status: "loading",
    });
    try {
      const response = await listOpenLoadJobs(apiBaseUrl, token);
      setLoadJobsState({
        items: response.items,
        message:
          response.items.length > 0
            ? "Open load jobs loaded from API."
            : "No open load jobs. Ask office staff to publish a truck loading plan.",
        status: response.items.length > 0 ? "ready" : "empty",
      });
    } catch (error) {
      handleProtectedApiError(error, "Load jobs could not be loaded.");
    }
  }

  async function openLoadJob(loadJobId: string) {
    const token = await tokenStore.getToken();
    if (!token) {
      setAuthSession({
        message: "Session expired. Sign in again.",
        status: "session_expired",
        user: null,
      });
      setSelectedLoadJob(null);
      clearScanState();
      return;
    }

    setOpeningLoadJobId(loadJobId);
    try {
      const loadJob = await getLoadJob(apiBaseUrl, token, loadJobId);
      setSelectedLoadJob(loadJob);
      setDockNo(loadJob.dockNo ?? "");
      clearScanState();
    } catch (error) {
      handleProtectedApiError(error, "Load job detail could not be opened.");
    } finally {
      setOpeningLoadJobId(null);
    }
  }

  async function submitScan(rawPayload: string) {
    if (!selectedLoadJob) {
      return;
    }

    const normalizedPayload = normalizeScanInput(rawPayload);
    if (
      isScanSubmitDisabled({
        canScan: selectedLoadJob.canScan,
        qrPayload: normalizedPayload,
        submitting: submittingScan,
      })
    ) {
      return;
    }

    const token = await tokenStore.getToken();
    if (!token) {
      setAuthSession({
        message: "Session expired. Sign in again.",
        status: "session_expired",
        user: null,
      });
      return;
    }

    setSubmittingScan(true);
    setScanNotice(null);
    try {
      const response = await scanLoadJobPallet(
        apiBaseUrl,
        token,
        selectedLoadJob.id,
        {
          deviceId,
          qrPayload: normalizedPayload,
        },
      );
      setSelectedLoadJob(response.loadJob);
      setLastScan(response);
      setScanNotice(scanSuccessNotice(response));
      setQrPayload("");
      clearSupervisorOverrideState();
    } catch (error) {
      if (shouldQueueOfflineScan(error)) {
        const record = await offlineQueueStore.enqueue({
          deviceId,
          loadJobId: selectedLoadJob.id,
          qrPayload: normalizedPayload,
          userId: authSession.user?.id ?? null,
        });
        setOfflineQueue(await offlineQueueStore.list());
        setScanNotice({
          code: "OFFLINE_SCAN_QUEUED",
          message:
            "Network send failed. Scan is pending locally and inventory has not changed.",
          title: "Scan queued offline",
          tone: "amber",
        });
        setQrPayload("");
        setLastScan(null);
        if (!record.localId) {
          setScanNotice(scanErrorNotice(error));
        }
        return;
      }
      if (
        error instanceof NativeApiError &&
        error.code === "PALLET_ALREADY_LOADED" &&
        canSupervisorOverrideScans(authSession.user)
      ) {
        setOverridePayload(normalizedPayload);
        setOverrideConfirmed(false);
        setOverrideReason("");
      }
      setScanNotice(scanErrorNotice(error));
      if (error instanceof NativeApiError && error.status === 401) {
        void tokenStore.clearToken();
        setAuthSession({
          message: "Session expired. Sign in again.",
          status: "session_expired",
          user: null,
        });
      }
    } finally {
      setSubmittingScan(false);
    }
  }

  async function submitSupervisorOverride() {
    if (!selectedLoadJob) {
      return;
    }

    const normalizedPayload = normalizeScanInput(overridePayload);
    const reason = normalizeScanInput(overrideReason);
    if (
      isSupervisorOverrideDisabled({
        canOverride: canSupervisorOverrideScans(authSession.user),
        confirmed: overrideConfirmed,
        overridePayload: normalizedPayload,
        reason,
        submitting: submittingOverride,
      })
    ) {
      return;
    }

    const token = await tokenStore.getToken();
    if (!token) {
      setAuthSession({
        message: "Session expired. Sign in again.",
        status: "session_expired",
        user: null,
      });
      return;
    }

    setSubmittingOverride(true);
    setScanNotice(null);
    try {
      const response = await scanLoadJobPallet(
        apiBaseUrl,
        token,
        selectedLoadJob.id,
        {
          deviceId,
          overrideReason: reason,
          qrPayload: normalizedPayload,
          supervisorOverride: true,
        },
      );
      setSelectedLoadJob(response.loadJob);
      setLastScan(response);
      setScanNotice({
        code: "SUPERVISOR_OVERRIDE",
        message: "Supervisor override accepted and audited by the API.",
        title: "Override accepted",
        tone: "amber",
      });
      setQrPayload("");
      clearSupervisorOverrideState();
    } catch (error) {
      setScanNotice(scanErrorNotice(error));
      handleActionAuthError(error);
    } finally {
      setSubmittingOverride(false);
    }
  }

  async function saveDockNo() {
    if (!selectedLoadJob || savingDock || !canUpdateMobileDock(authSession.user)) {
      return;
    }

    const token = await tokenStore.getToken();
    if (!token) {
      setAuthSession({
        message: "Session expired. Sign in again.",
        status: "session_expired",
        user: null,
      });
      return;
    }

    setSavingDock(true);
    setScanNotice(null);
    try {
      const result = await updateLoadJob(apiBaseUrl, token, selectedLoadJob.id, {
        dockNo: normalizeScanInput(dockNo),
      });
      setSelectedLoadJob(result);
      setDockNo(result.dockNo ?? "");
      setScanNotice({
        code: "DOCK_NO_SAVED",
        message: `Dock saved${result.dockNo ? `: ${result.dockNo}` : "."}`,
        title: "Dock saved",
        tone: "emerald",
      });
    } catch (error) {
      setScanNotice(scanErrorNotice(error));
      handleActionAuthError(error);
    } finally {
      setSavingDock(false);
    }
  }

  async function completeLoading() {
    if (!selectedLoadJob || completingLoadJob) {
      return;
    }

    const normalizedDockNo = normalizeScanInput(dockNo);
    if (!canCompleteMobileLoadJob(authSession.user)) {
      setScanNotice({
        code: "FORBIDDEN",
        message: "This account does not have permission to complete load jobs.",
        title: "Unauthorized",
        tone: "red",
      });
      return;
    }

    if (
      isCompleteLoadingDisabled({
        canComplete: true,
        completing: completingLoadJob,
        dockNo: normalizedDockNo,
      })
    ) {
      setScanNotice({
        code: "DOCK_NO_REQUIRED",
        message: "Dock No. is required before completing this load job.",
        title: "Dock required",
        tone: "amber",
      });
      return;
    }

    const token = await tokenStore.getToken();
    if (!token) {
      setAuthSession({
        message: "Session expired. Sign in again.",
        status: "session_expired",
        user: null,
      });
      return;
    }

    setCompletingLoadJob(true);
    setScanNotice(null);
    try {
      const result = await closeLoadJob(apiBaseUrl, token, selectedLoadJob.id, {
        dockNo: normalizedDockNo,
        note: "Completed from native scan app.",
        reason: "Warehouse loading completed.",
      });
      setSelectedLoadJob(result);
      setDockNo(result.dockNo ?? normalizedDockNo);
      setScanNotice({
        code: "LOAD_JOB_COMPLETED",
        message: `Load job completed by ${
          authSession.user?.name ?? authSession.user?.email ?? "current user"
        }.`,
        title: "Loading completed",
        tone: "emerald",
      });
      clearSupervisorOverrideState();
    } catch (error) {
      setScanNotice(scanErrorNotice(error));
      handleActionAuthError(error);
    } finally {
      setCompletingLoadJob(false);
    }
  }

  async function syncOfflineQueue(baseUrl = apiBaseUrl) {
    if (syncingQueue) {
      return;
    }

    const token = await tokenStore.getToken();
    if (!token) {
      setScanNotice({
        code: "OFFLINE_SYNC_NEEDS_LOGIN",
        message: "Sign in before syncing pending scans.",
        title: "Login required",
        tone: "amber",
      });
      return;
    }

    const records = (await offlineQueueStore.list()).filter(
      (record) => record.syncStatus !== "SYNCED",
    );
    if (records.length === 0) {
      setOfflineQueue(await offlineQueueStore.list());
      return;
    }

    setSyncingQueue(true);
    let syncedCount = 0;
    let failedCount = 0;
    let lastResponse: LoadJobScanResponse | null = null;

    try {
      for (const record of records) {
        const result = await syncOfflineScanRecord({
          apiBaseUrl: baseUrl,
          record,
          store: offlineQueueStore,
          token,
        });
        if (result.response) {
          syncedCount += 1;
          lastResponse = result.response;
          if (selectedLoadJob?.id === result.response.loadJob.id) {
            setSelectedLoadJob(result.response.loadJob);
            setLastScan(result.response);
          }
        } else {
          failedCount += 1;
        }
      }

      setOfflineQueue(await offlineQueueStore.list());
      setScanNotice({
        code: failedCount > 0 ? "OFFLINE_SYNC_PARTIAL" : "OFFLINE_SYNCED",
        message:
          failedCount > 0
            ? `${syncedCount} pending scans synced, ${failedCount} still failed.`
            : `${syncedCount} pending scans synced through the API.`,
        title: failedCount > 0 ? "Offline sync partial" : "Offline scans synced",
        tone: failedCount > 0 ? "amber" : "emerald",
      });
      if (lastResponse) {
        setLastScan(lastResponse);
      }
    } catch (error) {
      setScanNotice({
        code: "OFFLINE_SYNC_FAILED",
        message: offlineErrorMessage(error),
        title: "Offline sync failed",
        tone: "red",
      });
    } finally {
      setSyncingQueue(false);
    }
  }

  async function startNativeCameraScan() {
    if (cameraScanning) {
      return;
    }

    setCameraScanning(true);
    try {
      const payload = await createNativeCameraScanner().scanOnce();
      setQrPayload(payload);
      await submitScan(payload);
    } catch (error) {
      setScanNotice({
        code: "NATIVE_CAMERA_UNAVAILABLE",
        message:
          error instanceof Error
            ? error.message
            : "Native camera scanner failed.",
        title: "Camera scanner unavailable",
        tone: "amber",
      });
    } finally {
      setCameraScanning(false);
    }
  }

  function clearScanState() {
    setQrPayload("");
    setScanNotice(null);
    setLastScan(null);
    setSubmittingScan(false);
    setSubmittingOverride(false);
    setSavingDock(false);
    setCompletingLoadJob(false);
    setCameraScanning(false);
    clearSupervisorOverrideState();
  }

  function clearSupervisorOverrideState() {
    setOverrideConfirmed(false);
    setOverridePayload("");
    setOverrideReason("");
  }

  function handleActionAuthError(error: unknown) {
    if (error instanceof NativeApiError && error.status === 401) {
      void tokenStore.clearToken();
      setAuthSession({
        message: "Session expired. Sign in again.",
        status: "session_expired",
        user: null,
      });
    }
  }

  function handleProtectedApiError(error: unknown, fallbackMessage: string) {
    if (error instanceof NativeApiError && error.status === 401) {
      void tokenStore.clearToken();
      setAuthSession({
        message: "Session expired. Sign in again.",
        status: "session_expired",
        user: null,
      });
      setLoadJobsState(initialLoadJobsState);
      setSelectedLoadJob(null);
      clearScanState();
      return;
    }

    if (error instanceof NativeApiError && error.status === 403) {
      setLoadJobsState({
        items: [],
        message: "Permission denied. This account cannot view mobile load jobs.",
        status: "blocked",
      });
      return;
    }

    setLoadJobsState({
      items: loadJobsState.items,
      message: error instanceof Error ? error.message : fallbackMessage,
      status: "error",
    });
  }

  const currentUser = authSession.user;

  return React.createElement(
    SafeAreaView,
    { style: appStyles.screen },
    React.createElement(
      ScrollView,
      { contentContainerStyle: appStyles.content },
      React.createElement(Text, { style: appStyles.eyebrow }, "Bestar Native Scan"),
      React.createElement(Text, { style: appStyles.title }, "Warehouse Scan"),
      React.createElement(
        Text,
        { style: appStyles.body },
        "Configure the LAN API, then sign in with an existing warehouse account. This native app is separate from the office web app.",
      ),
      React.createElement(
        View,
        { style: appStyles.section },
        React.createElement(Text, { style: appStyles.label }, "API base URL"),
        React.createElement(TextInput, {
          autoCapitalize: "none",
          autoCorrect: false,
          keyboardType: "url",
          onChangeText: setApiBaseUrl,
          placeholder: "http://192.168.1.10/api",
          style: appStyles.input,
          value: apiBaseUrl,
        }),
        React.createElement(
          TouchableOpacity,
          {
            disabled: checking,
            onPress: () => {
              void saveAndCheck();
            },
            style: checking ? appStyles.buttonDisabled : appStyles.button,
          },
          React.createElement(
            Text,
            { style: appStyles.buttonText },
            checking ? "Checking API" : "Save and check API",
          ),
        ),
      ),
      React.createElement(
        View,
        { style: appStyles.statusPanel },
        React.createElement(
          Text,
          { style: health.ok ? appStyles.statusOk : appStyles.statusError },
          health.ok ? "Reachable" : "Not connected",
        ),
        React.createElement(Text, { style: appStyles.statusMessage }, health.message),
        health.checkedAt
          ? React.createElement(
              Text,
              { style: appStyles.meta },
              `Checked at ${health.checkedAt}`,
            )
          : null,
      ),
      React.createElement(
        View,
        { style: appStyles.section },
        React.createElement(Text, { style: appStyles.label }, "Device ID"),
        React.createElement(Text, { style: appStyles.mono }, deviceId),
      ),
      React.createElement(
        View,
        { style: appStyles.section },
        React.createElement(Text, { style: appStyles.sectionTitle }, "Login"),
        currentUser
          ? React.createElement(
              View,
              { style: appStyles.userPanel },
              React.createElement(
                Text,
                { style: appStyles.userName },
                currentUser.name ?? currentUser.email ?? "Signed-in user",
              ),
              React.createElement(
                Text,
                { style: appStyles.meta },
                currentUser.email ?? "No email on account",
              ),
              React.createElement(
                Text,
                { style: appStyles.meta },
                `Roles: ${currentUser.roles.join(", ") || "None"}`,
              ),
              React.createElement(
                Text,
                { style: appStyles.meta },
                `Permissions: ${currentUser.permissions.join(", ") || "None"}`,
              ),
            )
          : React.createElement(
              View,
              null,
              React.createElement(Text, { style: appStyles.label }, "Email"),
              React.createElement(TextInput, {
                autoCapitalize: "none",
                autoCorrect: false,
                keyboardType: "email-address",
                onChangeText: setEmail,
                placeholder: "warehouse@example.com",
                style: appStyles.input,
                value: email,
              }),
              React.createElement(Text, { style: appStyles.labelSpaced }, "Password"),
              React.createElement(TextInput, {
                autoCapitalize: "none",
                autoCorrect: false,
                onChangeText: setPassword,
                placeholder: "Password",
                secureTextEntry: true,
                style: appStyles.input,
                value: password,
              }),
              React.createElement(
                TouchableOpacity,
                {
                  disabled: signingIn,
                  onPress: () => {
                    void submitLogin();
                  },
                  style: signingIn ? appStyles.buttonDisabled : appStyles.button,
                },
                React.createElement(
                  Text,
                  { style: appStyles.buttonText },
                  signingIn ? "Signing in" : "Sign in",
                ),
              ),
            ),
        React.createElement(
          Text,
          {
            style:
              authSession.status === "authenticated"
                ? appStyles.statusOk
                : authSession.status === "logged_out"
                  ? appStyles.statusMessage
                  : appStyles.statusError,
          },
          authSession.message,
        ),
        currentUser
          ? React.createElement(
              TouchableOpacity,
              {
                onPress: () => {
                  void submitLogout();
                },
                style: appStyles.secondaryButton,
              },
              React.createElement(Text, { style: appStyles.secondaryButtonText }, "Logout"),
            )
          : null,
      ),
      React.createElement(
        View,
        { style: appStyles.statusPanel },
        React.createElement(
          Text,
          {
            style: canUseMobileScan(currentUser)
              ? appStyles.statusOk
              : appStyles.statusError,
          },
          canUseMobileScan(currentUser) ? "Mobile scan allowed" : "Scan permission required",
        ),
        React.createElement(
          Text,
          { style: appStyles.statusMessage },
          canUseMobileScan(currentUser)
            ? "Open jobs and scan submission use the real API."
            : "The signed-in account must have load_jobs.read and scan.create.",
        ),
      ),
      canUseMobileScan(currentUser)
        ? selectedLoadJob
          ? renderScanScreen({
              canComplete: canCompleteMobileLoadJob(currentUser),
              canOverride: canSupervisorOverrideScans(currentUser),
              canUpdateDock: canUpdateMobileDock(currentUser),
              cameraScanning,
              completingLoadJob,
              dockNo,
              lastScan,
              loadJob: selectedLoadJob,
              onBack: () => {
                clearScanState();
                setDockNo("");
                setSelectedLoadJob(null);
              },
              onCameraScan: () => {
                void startNativeCameraScan();
              },
              onChangeDockNo: setDockNo,
              onChangeOverridePayload: setOverridePayload,
              onChangeOverrideReason: setOverrideReason,
              onChangePayload: setQrPayload,
              onCompleteLoading: () => {
                void completeLoading();
              },
              onSaveDock: () => {
                void saveDockNo();
              },
              onSyncQueue: () => {
                void syncOfflineQueue();
              },
              onSubmit: () => {
                void submitScan(qrPayload);
              },
              onSubmitOverride: () => {
                void submitSupervisorOverride();
              },
              onToggleOverrideConfirmed: () => {
                setOverrideConfirmed((confirmed) => !confirmed);
              },
              offlineQueue,
              overrideConfirmed,
              overridePayload,
              overrideReason,
              qrPayload,
              savingDock,
              scanNotice,
              syncingQueue,
              submitting: submittingScan,
              submittingOverride,
            })
          : renderLoadJobList({
              loadJobsState,
              onOpen: (loadJobId) => {
                void openLoadJob(loadJobId);
              },
              onRefresh: () => {
                void refreshOpenLoadJobs();
              },
              openingLoadJobId,
            })
        : null,
    ),
  );
}

function renderLoadJobList(input: {
  loadJobsState: LoadJobsState;
  onOpen(loadJobId: string): void;
  onRefresh(): void;
  openingLoadJobId: string | null;
}) {
  return React.createElement(
    View,
    { style: appStyles.section },
    React.createElement(Text, { style: appStyles.sectionTitle }, "Open load jobs"),
    React.createElement(
      TouchableOpacity,
      {
        disabled: input.loadJobsState.status === "loading",
        onPress: input.onRefresh,
        style:
          input.loadJobsState.status === "loading"
            ? appStyles.buttonDisabled
            : appStyles.button,
      },
      React.createElement(
        Text,
        { style: appStyles.buttonText },
        input.loadJobsState.status === "loading" ? "Loading jobs" : "Refresh jobs",
      ),
    ),
    React.createElement(
      Text,
      {
        style:
          input.loadJobsState.status === "ready"
            ? appStyles.statusMessage
            : input.loadJobsState.status === "empty"
              ? appStyles.statusMessage
              : appStyles.statusError,
      },
      input.loadJobsState.message,
    ),
    ...input.loadJobsState.items.map((loadJob) =>
      renderLoadJobCard({
        loadJob,
        onOpen: input.onOpen,
        opening: input.openingLoadJobId === loadJob.id,
      }),
    ),
  );
}

function renderLoadJobCard(input: {
  loadJob: LoadJob;
  onOpen(loadJobId: string): void;
  opening: boolean;
}) {
  const progress = loadJobProgress(input.loadJob);
  return React.createElement(
    View,
    { key: input.loadJob.id, style: appStyles.jobCard },
    React.createElement(
      Text,
      { style: appStyles.jobRegion },
      formatNullable(input.loadJob.destinationRegion),
    ),
    React.createElement(
      Text,
      { style: appStyles.jobTitle },
      loadJobDisplayName(input.loadJob),
    ),
    React.createElement(
      Text,
      { style: appStyles.jobDeparture },
      formatScheduledDeparture(input.loadJob.scheduledDepartureAt),
    ),
    React.createElement(
      View,
      { style: appStyles.jobMetaGrid },
      renderMeta("Truck", input.loadJob.truckNo),
      renderMeta("Dock", input.loadJob.dockNo),
      renderMeta("Carrier", input.loadJob.carrier),
      renderMeta("Status", input.loadJob.status),
    ),
    React.createElement(
      Text,
      { style: appStyles.statusMessage },
      `Progress ${progress.loaded}/${progress.planned}, remaining ${progress.remaining}`,
    ),
    React.createElement(
      Text,
      { style: appStyles.meta },
      loadJobLineSummary(input.loadJob),
    ),
    React.createElement(
      TouchableOpacity,
      {
        disabled: input.opening,
        onPress: () => input.onOpen(input.loadJob.id),
        style: input.opening ? appStyles.buttonDisabled : appStyles.button,
      },
      React.createElement(
        Text,
        { style: appStyles.buttonText },
        input.opening ? "Opening" : "Open scan screen",
      ),
    ),
  );
}

function renderScanScreen(input: {
  canComplete: boolean;
  canOverride: boolean;
  canUpdateDock: boolean;
  cameraScanning: boolean;
  completingLoadJob: boolean;
  dockNo: string;
  lastScan: LoadJobScanResponse | null;
  loadJob: LoadJob;
  onBack(): void;
  onCameraScan(): void;
  onChangeDockNo(value: string): void;
  onChangeOverridePayload(value: string): void;
  onChangeOverrideReason(value: string): void;
  onChangePayload(value: string): void;
  onCompleteLoading(): void;
  onSaveDock(): void;
  onSyncQueue(): void;
  onSubmit(): void;
  onSubmitOverride(): void;
  onToggleOverrideConfirmed(): void;
  offlineQueue: OfflineScanRecord[];
  overrideConfirmed: boolean;
  overridePayload: string;
  overrideReason: string;
  qrPayload: string;
  savingDock: boolean;
  scanNotice: ScanNotice | null;
  syncingQueue: boolean;
  submitting: boolean;
  submittingOverride: boolean;
}) {
  const loadJob = input.loadJob;
  const progress = loadJobProgress(loadJob);
  const queueForLoadJob = input.offlineQueue.filter(
    (record) => record.loadJobId === loadJob.id,
  );
  const pendingCount = input.offlineQueue.filter(
    (record) => record.syncStatus !== "SYNCED",
  ).length;
  const submitDisabled = isScanSubmitDisabled({
    canScan: loadJob.canScan,
    qrPayload: input.qrPayload,
    submitting: input.submitting,
  });
  const overrideDisabled = isSupervisorOverrideDisabled({
    canOverride: input.canOverride,
    confirmed: input.overrideConfirmed,
    overridePayload: input.overridePayload,
    reason: input.overrideReason,
    submitting: input.submittingOverride,
  });
  const completeDisabled = isCompleteLoadingDisabled({
    canComplete: input.canComplete,
    completing: input.completingLoadJob,
    dockNo: input.dockNo,
  });

  return React.createElement(
    View,
    { style: appStyles.section },
    React.createElement(Text, { style: appStyles.sectionTitle }, "Scan screen"),
    React.createElement(Text, { style: appStyles.jobRegion }, formatNullable(loadJob.destinationRegion)),
    React.createElement(Text, { style: appStyles.jobTitle }, loadJobDisplayName(loadJob)),
    React.createElement(
      Text,
      { style: appStyles.statusMessage },
      `Progress ${progress.loaded}/${progress.planned}, remaining ${progress.remaining}`,
    ),
    React.createElement(
      View,
      { style: appStyles.userPanel },
      React.createElement(Text, { style: appStyles.userName }, "Dock and completion"),
      React.createElement(Text, { style: appStyles.labelSpaced }, "Dock No."),
      React.createElement(TextInput, {
        autoCapitalize: "characters",
        autoCorrect: false,
        editable: input.canUpdateDock && !input.savingDock,
        onChangeText: input.onChangeDockNo,
        placeholder: "Dock door",
        style: appStyles.input,
        value: input.dockNo,
      }),
      React.createElement(
        View,
        { style: appStyles.actionRow },
        React.createElement(
          TouchableOpacity,
          {
            disabled: !input.canUpdateDock || input.savingDock,
            onPress: input.onSaveDock,
            style:
              !input.canUpdateDock || input.savingDock
                ? appStyles.buttonDisabled
                : appStyles.secondaryButton,
          },
          React.createElement(
            Text,
            {
              style:
                !input.canUpdateDock || input.savingDock
                  ? appStyles.buttonText
                  : appStyles.secondaryButtonText,
            },
            input.savingDock ? "Saving dock" : "Save dock",
          ),
        ),
        React.createElement(
          TouchableOpacity,
          {
            disabled: completeDisabled,
            onPress: input.onCompleteLoading,
            style: completeDisabled ? appStyles.buttonDisabled : appStyles.button,
          },
          React.createElement(
            Text,
            { style: appStyles.buttonText },
            input.completingLoadJob ? "Completing" : "Complete loading",
          ),
        ),
      ),
      input.canComplete && normalizeScanInput(input.dockNo).length === 0
        ? React.createElement(
            Text,
            { style: appStyles.statusError },
            "Dock No. is required before completing this load job.",
          )
        : null,
    ),
    input.scanNotice
      ? React.createElement(
          View,
          {
            style:
              input.scanNotice.tone === "emerald"
                ? appStyles.noticeOk
                : input.scanNotice.tone === "amber"
                  ? appStyles.noticeWarn
                  : appStyles.noticeError,
          },
          React.createElement(Text, { style: appStyles.noticeTitle }, input.scanNotice.title),
          React.createElement(Text, { style: appStyles.noticeMessage }, input.scanNotice.message),
          input.scanNotice.code
            ? React.createElement(Text, { style: appStyles.meta }, input.scanNotice.code)
            : null,
        )
      : null,
    input.lastScan
      ? React.createElement(
          View,
          { style: appStyles.userPanel },
          React.createElement(Text, { style: appStyles.userName }, input.lastScan.pallet.containerNo),
          React.createElement(
            Text,
            { style: appStyles.statusMessage },
            `${input.lastScan.pallet.destinationCode} / Pallet ${input.lastScan.pallet.palletNo}`,
          ),
          React.createElement(
            Text,
            { style: appStyles.statusMessage },
            `Backend remaining ${input.lastScan.progress.remainingPallets}`,
          ),
        )
      : null,
    React.createElement(Text, { style: appStyles.label }, "QR payload"),
    React.createElement(TextInput, {
      autoCapitalize: "none",
      autoCorrect: false,
      onChangeText: input.onChangePayload,
      onSubmitEditing: input.onSubmit,
      placeholder: "Scan with scanner gun or paste QR payload",
      returnKeyType: "send",
      style: appStyles.input,
      value: input.qrPayload,
    }),
    React.createElement(
      TouchableOpacity,
      {
        disabled: submitDisabled,
        onPress: input.onSubmit,
        style: submitDisabled ? appStyles.buttonDisabled : appStyles.button,
      },
      React.createElement(
        Text,
        { style: appStyles.buttonText },
        input.submitting ? "Submitting scan" : "Submit scan",
      ),
    ),
    React.createElement(
      TouchableOpacity,
      {
        disabled: input.cameraScanning,
        onPress: input.onCameraScan,
        style: input.cameraScanning ? appStyles.buttonDisabled : appStyles.secondaryButton,
      },
      React.createElement(
        Text,
        {
          style: input.cameraScanning
            ? appStyles.buttonText
            : appStyles.secondaryButtonText,
        },
        input.cameraScanning ? "Opening camera" : "Start native camera scan",
      ),
    ),
    React.createElement(
      Text,
      { style: appStyles.meta },
      "Camera scanning uses a native React Native module. If camera permission or the module is unavailable, scanner-gun and manual input remain available.",
    ),
    input.canOverride
      ? React.createElement(
          View,
          { style: appStyles.userPanel },
          React.createElement(
            Text,
            { style: appStyles.userName },
            "Supervisor override",
          ),
          React.createElement(
            Text,
            { style: appStyles.statusMessage },
            "Use only when the API rejects a pallet that a supervisor has approved for loading. The API records the override reason and current user.",
          ),
          React.createElement(Text, { style: appStyles.labelSpaced }, "QR payload"),
          React.createElement(TextInput, {
            autoCapitalize: "none",
            autoCorrect: false,
            onChangeText: input.onChangeOverridePayload,
            placeholder: "Rejected QR payload",
            style: appStyles.input,
            value: input.overridePayload,
          }),
          React.createElement(Text, { style: appStyles.labelSpaced }, "Reason"),
          React.createElement(TextInput, {
            autoCapitalize: "sentences",
            autoCorrect: true,
            multiline: true,
            onChangeText: input.onChangeOverrideReason,
            placeholder: "Explain why this pallet is approved.",
            style: appStyles.textArea,
            value: input.overrideReason,
          }),
          React.createElement(
            TouchableOpacity,
            {
              onPress: input.onToggleOverrideConfirmed,
              style: input.overrideConfirmed
                ? appStyles.confirmationActive
                : appStyles.confirmation,
            },
            React.createElement(
              Text,
              {
                style: input.overrideConfirmed
                  ? appStyles.confirmationActiveText
                  : appStyles.confirmationText,
              },
              input.overrideConfirmed
                ? "Confirmed: submit supervisor override"
                : "Tap to confirm supervisor override",
            ),
          ),
          React.createElement(
            TouchableOpacity,
            {
              disabled: overrideDisabled,
              onPress: input.onSubmitOverride,
              style: overrideDisabled ? appStyles.buttonDisabled : appStyles.button,
            },
            React.createElement(
              Text,
              { style: appStyles.buttonText },
              input.submittingOverride
                ? "Submitting override"
                : "Submit supervisor override",
            ),
          ),
        )
      : null,
    React.createElement(
      View,
      { style: appStyles.userPanel },
      React.createElement(Text, { style: appStyles.userName }, "Offline queue"),
      React.createElement(
        Text,
        { style: appStyles.statusMessage },
        `${pendingCount} pending or failed scans. Pending scans do not change inventory until API sync succeeds.`,
      ),
      React.createElement(
        TouchableOpacity,
        {
          disabled: input.syncingQueue || pendingCount === 0,
          onPress: input.onSyncQueue,
          style:
            input.syncingQueue || pendingCount === 0
              ? appStyles.buttonDisabled
              : appStyles.button,
        },
        React.createElement(
          Text,
          { style: appStyles.buttonText },
          input.syncingQueue ? "Syncing" : "Sync pending scans",
        ),
      ),
      ...queueForLoadJob.slice(0, 5).map((record) =>
        React.createElement(
          View,
          { key: record.localId, style: appStyles.queueItem },
          React.createElement(
            Text,
            { style: appStyles.metaValue },
            `${record.syncStatus} / ${record.localId}`,
          ),
          React.createElement(Text, { style: appStyles.meta }, record.scannedAt),
          React.createElement(Text, { style: appStyles.meta }, record.qrPayload),
          record.lastError
            ? React.createElement(Text, { style: appStyles.statusError }, record.lastError)
            : null,
        ),
      ),
    ),
    React.createElement(
      TouchableOpacity,
      {
        onPress: input.onBack,
        style: appStyles.secondaryButton,
      },
      React.createElement(Text, { style: appStyles.secondaryButtonText }, "Back to jobs"),
    ),
  );
}

function renderMeta(label: string, value: string | null) {
  return React.createElement(
    View,
    { key: label, style: appStyles.jobMetaItem },
    React.createElement(Text, { style: appStyles.metaLabel }, label),
    React.createElement(Text, { style: appStyles.metaValue }, formatNullable(value)),
  );
}

function toLoginErrorMessage(error: unknown): string {
  if (error instanceof NativeApiError) {
    if (error.code === "INVALID_CREDENTIALS") {
      return "Invalid email or password.";
    }
    if (error.code === "USER_INACTIVE") {
      return "This account is inactive.";
    }
    if (error.code === "SYSTEM_USER_LOGIN_NOT_ALLOWED") {
      return "SYSTEM users cannot use ordinary employee login.";
    }
    if (error.code === "FORBIDDEN") {
      return "This account does not have permission to use mobile scan.";
    }
    return error.message;
  }

  return error instanceof Error ? error.message : "Login failed.";
}
