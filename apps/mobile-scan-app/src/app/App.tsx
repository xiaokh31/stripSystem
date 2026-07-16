import React, { useEffect, useMemo, useState } from "react";
import {
  SafeAreaView,
  FlatList,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { NativeApiError } from "../api/api-error";
import { checkApiHealth, type HealthCheckResult } from "../api/health-client";
import {
  isInvalidSessionError,
  restoreSession,
  signIn,
  signOut,
  withNativeSession,
} from "../auth/auth-session";
import type { AuthSession } from "../auth/auth-session";
import {
  canCompleteMobileLoadJob,
  canSupervisorOverrideScans,
  canUpdateMobileDock,
  canUseMobileScan,
} from "../auth/mobile-permissions";
import { createNativeSecureTokenStore } from "../auth/token-store";
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
  bayBoardJobs,
  formatScheduledDeparture,
  loadJobDisplayName,
  loadJobLineSummary,
  loadJobProgress,
  loadJobStatusLabel,
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
import {
  loadNativeLocale,
  nativeApiErrorMessage,
  saveNativeLocale,
  t,
  type NativeLocale,
} from "../i18n/native-i18n";
import {
  initialNativeScreen,
  resolveNativeScreen,
  type NativeScreen,
} from "./navigation";
import { startupMetrics } from "./startup-metrics";
import {
  getNativeThemeTokens,
  resolveNativeColorScheme,
  setAppColorScheme,
  appStyles,
} from "../ui/styles";

const initialAuthSession: AuthSession = {
  code: "AUTH_RESTORING",
  message: "AUTH_RESTORING",
  status: "checking",
  user: null,
};

interface LoadJobsState {
  items: LoadJob[];
  lastSuccessfulAt: string | null;
  message: string;
  status: "blocked" | "empty" | "error" | "idle" | "loading" | "ready";
}

const initialLoadJobsState: LoadJobsState = {
  items: [],
  lastSuccessfulAt: null,
  message: "Sign in to view open load jobs.",
  status: "idle",
};

export function App() {
  startupMetrics.mark("first-shell");
  const systemColorScheme = resolveNativeColorScheme(useColorScheme());
  setAppColorScheme(systemColorScheme);
  const theme = getNativeThemeTokens(systemColorScheme);
  const settingsStore = useMemo<SettingsStore>(
    () => new AsyncStorageSettingsStore(),
    [],
  );
  const tokenStore = useMemo(() => createNativeSecureTokenStore(), []);
  const offlineQueueStore = useMemo(
    () => new AsyncStorageOfflineQueueStore(settingsStore),
    [settingsStore],
  );
  const [apiBaseUrl, setApiBaseUrl] = useState(defaultApiBaseUrl);
  const [locale, setLocale] = useState<NativeLocale>("en");
  const [localeReady, setLocaleReady] = useState(false);
  const [screen, setScreen] = useState<NativeScreen>("login");
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
  const [loadJobQuery, setLoadJobQuery] = useState("");
  const [selectedLoadJob, setSelectedLoadJob] = useState<LoadJob | null>(null);
  const [qrPayload, setQrPayload] = useState("");
  const [dockNo, setDockNo] = useState("");
  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [overridePayload, setOverridePayload] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [scanNotice, setScanNotice] = useState<ScanNotice | null>(null);
  const [secondaryActionsExpanded, setSecondaryActionsExpanded] = useState(false);
  const [queueDetailsExpanded, setQueueDetailsExpanded] = useState(false);
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
      const [settings, resolvedDeviceId, savedLocale] = await Promise.all([
        loadLanSettings(settingsStore),
        getOrCreateDeviceId(settingsStore),
        loadNativeLocale(settingsStore),
      ]);
      if (!mounted) {
        return;
      }
      setApiBaseUrl(settings.apiBaseUrl);
      setLocale(savedLocale);
      setLocaleReady(true);
      setDeviceId(resolvedDeviceId);
      const restored = await restoreSession({
        apiBaseUrl: settings.apiBaseUrl,
        tokenStore,
      });
      setAuthSession(restored);
      setScreen(initialNativeScreen(restored));
      startupMetrics.mark("session-resolved");
      const queuedScans = await offlineQueueStore.list();
      if (!mounted) {
        return;
      }
      setOfflineQueue(queuedScans);
    }

    void load();
    return () => {
      mounted = false;
    };
  }, [settingsStore, tokenStore]);

  async function executeWithSession<T>(
    operation: (accessToken: string) => Promise<T>,
    baseUrl = apiBaseUrl,
  ): Promise<T> {
    return withNativeSession(
      {
        apiBaseUrl: baseUrl,
        onSessionUpdated: setAuthSession,
        tokenStore,
      },
      operation,
    );
  }

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
            deviceId,
            email,
            password,
            platform: "react-native",
          },
          tokenStore,
        ),
      );
      setPassword("");
      setSelectedLoadJob(null);
      setDockNo("");
      clearScanState();
      setScreen("load-jobs");
      await syncOfflineQueue(apiBaseUrl);
    } catch (error) {
      setAuthSession({
        code: authCodeForError(error),
        message: authCodeForError(error),
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
    setAuthSession(await signOut(tokenStore, apiBaseUrl));
    setLoadJobsState(initialLoadJobsState);
    setSelectedLoadJob(null);
    setDockNo("");
    clearScanState();
    setScreen("login");
  }

  async function refreshOpenLoadJobs() {
    if (!canUseMobileScan(authSession.user)) {
      setLoadJobsState({
        items: [],
        lastSuccessfulAt: null,
        message: "This account cannot view mobile load jobs.",
        status: "blocked",
      });
      return;
    }

    setLoadJobsState({
      items: loadJobsState.items,
      lastSuccessfulAt: loadJobsState.lastSuccessfulAt,
      message: "Loading open load jobs.",
      status: "loading",
    });
    try {
      const response = await executeWithSession((token) =>
        listOpenLoadJobs(apiBaseUrl, token),
      );
      setLoadJobsState({
        items: response.items,
        lastSuccessfulAt: new Date().toISOString(),
        message:
          response.items.length > 0
            ? "Open load jobs loaded from API."
            : "No open load jobs. Ask office staff to publish a truck loading plan.",
        status: response.items.length > 0 ? "ready" : "empty",
      });
      startupMetrics.mark("load-jobs-ready");
    } catch (error) {
      handleProtectedApiError(error, "Load jobs could not be loaded.");
    }
  }

  async function openLoadJob(loadJobId: string) {
    setOpeningLoadJobId(loadJobId);
    try {
      const loadJob = await executeWithSession((token) =>
        getLoadJob(apiBaseUrl, token, loadJobId),
      );
      setSelectedLoadJob(loadJob);
      setDockNo(loadJob.dockNo ?? "");
      clearScanState();
      setScreen("scan");
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

    setSubmittingScan(true);
    setScanNotice(null);
    try {
      const response = await executeWithSession((token) =>
        scanLoadJobPallet(apiBaseUrl, token, selectedLoadJob.id, {
          deviceId,
          qrPayload: normalizedPayload,
        }),
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
      if (isInvalidSessionError(error)) {
        setAuthSession(expiredSessionForError(error));
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

    setSubmittingOverride(true);
    setScanNotice(null);
    try {
      const response = await executeWithSession((token) =>
        scanLoadJobPallet(apiBaseUrl, token, selectedLoadJob.id, {
          deviceId,
          overrideReason: reason,
          qrPayload: normalizedPayload,
          supervisorOverride: true,
        }),
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

    setSavingDock(true);
    setScanNotice(null);
    try {
      const result = await executeWithSession((token) =>
        updateLoadJob(apiBaseUrl, token, selectedLoadJob.id, {
          dockNo: normalizeScanInput(dockNo),
        }),
      );
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

    setCompletingLoadJob(true);
    setScanNotice(null);
    try {
      const result = await executeWithSession((token) =>
        closeLoadJob(apiBaseUrl, token, selectedLoadJob.id, {
          dockNo: normalizedDockNo,
          note: "Completed from native scan app.",
          reason: "Warehouse loading completed.",
        }),
      );
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
        const result = await executeWithSession(
          (token) =>
            syncOfflineScanRecord({
              apiBaseUrl: baseUrl,
              record,
              store: offlineQueueStore,
              token,
            }),
          baseUrl,
        );
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
    setSecondaryActionsExpanded(false);
    setQueueDetailsExpanded(false);
    clearSupervisorOverrideState();
  }

  function clearSupervisorOverrideState() {
    setOverrideConfirmed(false);
    setOverridePayload("");
    setOverrideReason("");
  }

  function handleActionAuthError(error: unknown) {
    if (isInvalidSessionError(error)) {
      setAuthSession(expiredSessionForError(error));
    }
  }

  function handleProtectedApiError(error: unknown, fallbackMessage: string) {
    if (isInvalidSessionError(error)) {
      setAuthSession(expiredSessionForError(error));
      setLoadJobsState(initialLoadJobsState);
      setSelectedLoadJob(null);
      clearScanState();
      return;
    }

    if (error instanceof NativeApiError && error.status === 403) {
      setLoadJobsState({
        items: [],
        lastSuccessfulAt: null,
        message: "Permission denied. This account cannot view mobile load jobs.",
        status: "blocked",
      });
      return;
    }

    setLoadJobsState({
      items: loadJobsState.items,
      lastSuccessfulAt: loadJobsState.lastSuccessfulAt,
      message: error instanceof Error ? error.message : fallbackMessage,
      status: "error",
    });
  }

  const currentUser = authSession.user;
  const activeScreen = resolveNativeScreen({
    requested: screen,
    selectedLoadJob,
    session: authSession,
  });

  async function changeLocale(nextLocale: NativeLocale) {
    setLocale(nextLocale);
    await saveNativeLocale(settingsStore, nextLocale);
  }

  if (!localeReady) {
    return React.createElement(SafeAreaView, { style: appStyles.screen });
  }

  return React.createElement(
    SafeAreaView,
    { style: appStyles.screen },
    React.createElement(StatusBar, {
      backgroundColor: theme.background,
      barStyle: systemColorScheme === "dark" ? "light-content" : "dark-content",
    }),
    React.createElement(
      ScrollView,
      { contentContainerStyle: appStyles.content },
      React.createElement(
        View,
        { style: appStyles.appHeader },
        React.createElement(
          View,
          { style: appStyles.appHeaderBrand },
          React.createElement(
            Text,
            { ellipsizeMode: "clip", numberOfLines: 2, style: appStyles.eyebrow },
            t(locale, "appName"),
          ),
        ),
        currentUser
          ? React.createElement(
              TouchableOpacity,
              {
                accessibilityLabel: t(locale, "settingsAccessibilityLabel"),
                onPress: () => setScreen("settings"),
                style: appStyles.iconButton,
              },
              React.createElement(Text, { style: appStyles.iconButtonText }, "⚙"),
            )
          : null,
      ),
      authSession.status === "offline"
        ? React.createElement(
            Text,
            { style: appStyles.statusMessage },
            t(locale, "offlineSessionCheck"),
          )
        : null,
      activeScreen === "settings"
        ? renderSettingsScreen({
              apiBaseUrl,
              checking,
              deviceId,
              health,
              locale,
              onBack: () => setScreen("load-jobs"),
              onChangeApiBaseUrl: setApiBaseUrl,
              onChangeLocale: (nextLocale) => void changeLocale(nextLocale),
              onSaveAndCheck: () => void saveAndCheck(),
              onSignOut: () => void submitLogout(),
            })
        : !currentUser
          ? renderLoginScreen({
              authSession,
              email,
              locale,
              onChangeEmail: setEmail,
              onChangePassword: setPassword,
              onOpenSettings: () => setScreen("settings"),
              onSubmit: () => void submitLogin(),
              password,
              signingIn,
            })
          : canUseMobileScan(currentUser)
            ? selectedLoadJob && activeScreen === "scan"
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
                setScreen("load-jobs");
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
              onToggleQueueDetails: () => {
                setQueueDetailsExpanded((expanded) => !expanded);
              },
              onToggleSecondaryActions: () => {
                setSecondaryActionsExpanded((expanded) => !expanded);
              },
              offlineQueue,
              overrideConfirmed,
              overridePayload,
              overrideReason,
              qrPayload,
              savingDock,
              scanNotice,
              queueDetailsExpanded,
              secondaryActionsExpanded,
              syncingQueue,
              submitting: submittingScan,
              submittingOverride,
              locale,
            })
              : renderLoadJobList({
              loadJobsState,
              loadJobQuery,
              locale,
              onChangeQuery: setLoadJobQuery,
              onOpen: (loadJobId) => {
                void openLoadJob(loadJobId);
              },
              onRefresh: () => {
                void refreshOpenLoadJobs();
              },
              openingLoadJobId,
            })
            : React.createElement(
                View,
                { style: appStyles.section },
                React.createElement(Text, { style: appStyles.statusError }, t(locale, "cannotUseScan")),
                React.createElement(
                  TouchableOpacity,
                  { onPress: () => void submitLogout(), style: appStyles.secondaryButton },
                  React.createElement(Text, { style: appStyles.secondaryButtonText }, t(locale, "signOut")),
                ),
              ),
    ),
  );
}

function renderLoginScreen(input: {
  authSession: AuthSession;
  email: string;
  locale: NativeLocale;
  onChangeEmail(value: string): void;
  onChangePassword(value: string): void;
  onOpenSettings(): void;
  onSubmit(): void;
  password: string;
  signingIn: boolean;
}) {
  return React.createElement(
    View,
    { style: appStyles.section },
    React.createElement(Text, { style: appStyles.title }, t(input.locale, "signIn")),
    React.createElement(Text, { style: appStyles.body }, input.authSession.status === "checking" ? t(input.locale, "restoringSession") : t(input.locale, "configureServer")),
    React.createElement(Text, { style: appStyles.labelSpaced }, t(input.locale, "email")),
    React.createElement(TextInput, {
      accessibilityLabel: t(input.locale, "email"), autoCapitalize: "none", autoCorrect: false,
      keyboardType: "email-address", onChangeText: input.onChangeEmail,
      placeholder: t(input.locale, "emailPlaceholder"), style: appStyles.input, value: input.email,
    }),
    React.createElement(Text, { style: appStyles.labelSpaced }, t(input.locale, "password")),
    React.createElement(TextInput, {
      accessibilityLabel: t(input.locale, "password"), autoCapitalize: "none", autoCorrect: false,
      onChangeText: input.onChangePassword, placeholder: t(input.locale, "passwordPlaceholder"),
      secureTextEntry: true, style: appStyles.input, value: input.password,
    }),
    React.createElement(
      TouchableOpacity,
      { disabled: input.signingIn, onPress: input.onSubmit, style: input.signingIn ? appStyles.buttonDisabled : appStyles.button },
      React.createElement(Text, { style: appStyles.buttonText }, input.signingIn ? t(input.locale, "signingIn") : t(input.locale, "signIn")),
    ),
    input.authSession.status !== "logged_out" && input.authSession.status !== "checking"
      ? React.createElement(Text, { style: appStyles.statusError }, localizeAuthMessage(input.authSession, input.locale))
      : null,
    React.createElement(
      TouchableOpacity,
      { accessibilityLabel: t(input.locale, "settingsAccessibilityLabel"), onPress: input.onOpenSettings, style: appStyles.secondaryButton },
      React.createElement(Text, { style: appStyles.secondaryButtonText }, t(input.locale, "openSettings")),
    ),
  );
}

function renderSettingsScreen(input: {
  apiBaseUrl: string;
  checking: boolean;
  deviceId: string;
  health: HealthCheckResult;
  locale: NativeLocale;
  onBack(): void;
  onChangeApiBaseUrl(value: string): void;
  onChangeLocale(locale: NativeLocale): void;
  onSaveAndCheck(): void;
  onSignOut(): void;
}) {
  return React.createElement(
    View,
    { style: appStyles.section },
    React.createElement(Text, { style: appStyles.sectionTitle }, t(input.locale, "settings")),
    React.createElement(Text, { style: appStyles.body }, t(input.locale, "diagnostics")),
    React.createElement(Text, { style: appStyles.labelSpaced }, t(input.locale, "serverAddress")),
    React.createElement(TextInput, {
      accessibilityLabel: t(input.locale, "serverAddress"), autoCapitalize: "none", autoCorrect: false,
      keyboardType: "url", onChangeText: input.onChangeApiBaseUrl,
      placeholder: t(input.locale, "serverPlaceholder"), style: appStyles.input, value: input.apiBaseUrl,
    }),
    React.createElement(
      TouchableOpacity,
      { disabled: input.checking, onPress: input.onSaveAndCheck, style: input.checking ? appStyles.buttonDisabled : appStyles.button },
      React.createElement(Text, { style: appStyles.buttonText }, input.checking ? t(input.locale, "checkingConnection") : t(input.locale, "saveAndCheck")),
    ),
    React.createElement(Text, { style: input.health.ok ? appStyles.statusOk : appStyles.statusError }, input.health.ok ? t(input.locale, "connectionReady") : t(input.locale, "connectionOffline")),
    React.createElement(Text, { style: appStyles.statusMessage }, input.health.ok ? t(input.locale, "connectionReady") : t(input.locale, "apiUnreachable")),
    React.createElement(Text, { style: appStyles.labelSpaced }, t(input.locale, "language")),
    React.createElement(
      View,
      { style: appStyles.actionRow },
      React.createElement(TouchableOpacity, { accessibilityLabel: t(input.locale, "english"), onPress: () => input.onChangeLocale("en"), style: input.locale === "en" ? appStyles.button : appStyles.secondaryButton }, React.createElement(Text, { style: input.locale === "en" ? appStyles.buttonText : appStyles.secondaryButtonText }, t(input.locale, "english"))),
      React.createElement(TouchableOpacity, { accessibilityLabel: t(input.locale, "chinese"), onPress: () => input.onChangeLocale("zh-CN"), style: input.locale === "zh-CN" ? appStyles.button : appStyles.secondaryButton }, React.createElement(Text, { style: input.locale === "zh-CN" ? appStyles.buttonText : appStyles.secondaryButtonText }, t(input.locale, "chinese"))),
    ),
    React.createElement(Text, { style: appStyles.labelSpaced }, t(input.locale, "device")),
    React.createElement(Text, { style: appStyles.mono }, input.deviceId),
    React.createElement(TouchableOpacity, { onPress: input.onBack, style: appStyles.secondaryButton }, React.createElement(Text, { style: appStyles.secondaryButtonText }, t(input.locale, "returnToJobs"))),
    React.createElement(TouchableOpacity, { onPress: input.onSignOut, style: appStyles.secondaryButton }, React.createElement(Text, { style: appStyles.secondaryButtonText }, t(input.locale, "signOut"))),
  );
}

function renderLoadJobList(input: {
  loadJobsState: LoadJobsState;
  loadJobQuery: string;
  locale: NativeLocale;
  onChangeQuery(value: string): void;
  onOpen(loadJobId: string): void;
  onRefresh(): void;
  openingLoadJobId: string | null;
}) {
  const jobs = bayBoardJobs(input.loadJobsState.items, input.loadJobQuery);
  return React.createElement(
    View,
    { style: appStyles.bayBoard },
    React.createElement(
      View,
      { style: appStyles.bayBoardHeader },
      React.createElement(
        View,
        null,
        React.createElement(Text, { style: appStyles.sectionTitle }, t(input.locale, "bayBoard")),
        React.createElement(Text, { style: appStyles.meta }, t(input.locale, "jobCount", { count: jobs.length })),
      ),
      React.createElement(
        TouchableOpacity,
        {
          accessibilityLabel: t(input.locale, "refresh"),
          disabled: input.loadJobsState.status === "loading",
          onPress: input.onRefresh,
          style: input.loadJobsState.status === "loading" ? appStyles.iconButtonDisabled : appStyles.iconButton,
        },
        React.createElement(Text, { style: appStyles.iconButtonText }, "↻"),
      ),
    ),
    React.createElement(TextInput, {
      accessibilityLabel: t(input.locale, "searchJobsAccessibilityLabel"),
      autoCapitalize: "characters",
      autoCorrect: false,
      onChangeText: input.onChangeQuery,
      placeholder: t(input.locale, "searchJobs"),
      style: appStyles.input,
      value: input.loadJobQuery,
    }),
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
      localizeLoadJobsMessage(input.loadJobsState, input.locale),
    ),
    input.loadJobsState.status === "error" && jobs.length > 0
      ? React.createElement(Text, { style: appStyles.statusMessage }, t(input.locale, "staleJobs"))
      : null,
    React.createElement(FlatList, {
      data: jobs,
      initialNumToRender: 12,
      keyExtractor: (loadJob: LoadJob) => loadJob.id,
      maxToRenderPerBatch: 12,
      removeClippedSubviews: true,
      renderItem: ({ item }: { item: LoadJob }) => renderLoadJobCard({
        loadJob: item,
        locale: input.locale,
        onOpen: input.onOpen,
        opening: input.openingLoadJobId === item.id,
      }),
      windowSize: 9,
    }),
  );
}

function renderLoadJobCard(input: {
  loadJob: LoadJob;
  locale: NativeLocale;
  onOpen(loadJobId: string): void;
  opening: boolean;
}) {
  const progress = loadJobProgress(input.loadJob);
  return React.createElement(
    View,
    { key: input.loadJob.id, style: appStyles.bayRow },
    React.createElement(View, { style: appStyles.bayRowTop },
      React.createElement(Text, { style: appStyles.jobRegion }, formatNullable(input.loadJob.destinationRegion, t(input.locale, "notSet"))),
      React.createElement(Text, { style: appStyles.bayProgress }, `${progress.loaded} / ${progress.planned}`),
    ),
    React.createElement(Text, { style: appStyles.jobTitle }, loadJobDisplayName(input.loadJob)),
    React.createElement(Text, { style: appStyles.bayMetaLine }, `${formatNullable(input.loadJob.dockNo, t(input.locale, "notSet"))} · ${formatNullable(input.loadJob.truckNo, t(input.locale, "notSet"))}`),
    React.createElement(Text, { style: input.loadJob.canScan ? appStyles.bayReady : appStyles.bayBlocked }, input.loadJob.canScan ? t(input.locale, "scanAvailable") : t(input.locale, "scanUnavailable")),
    React.createElement(
      Text,
      { style: appStyles.statusMessage },
      t(input.locale, "currentProgress", {
        loaded: progress.loaded,
        planned: progress.planned,
        remaining: progress.remaining,
      }),
    ),
    React.createElement(
      TouchableOpacity,
      {
        accessibilityLabel: `${t(input.locale, "openScan")} ${loadJobDisplayName(input.loadJob)}`,
        disabled: input.opening,
        onPress: () => input.onOpen(input.loadJob.id),
        style: input.opening ? appStyles.buttonDisabled : appStyles.button,
      },
      React.createElement(
        Text,
        { style: appStyles.buttonText },
        input.opening ? t(input.locale, "opening") : t(input.locale, "openScan"),
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
  onToggleQueueDetails(): void;
  onToggleSecondaryActions(): void;
  onToggleOverrideConfirmed(): void;
  offlineQueue: OfflineScanRecord[];
  overrideConfirmed: boolean;
  overridePayload: string;
  overrideReason: string;
  qrPayload: string;
  savingDock: boolean;
  scanNotice: ScanNotice | null;
  queueDetailsExpanded: boolean;
  secondaryActionsExpanded: boolean;
  syncingQueue: boolean;
  submitting: boolean;
  submittingOverride: boolean;
  locale: NativeLocale;
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
    React.createElement(Text, { style: appStyles.sectionTitle }, t(input.locale, "scanWorkspace")),
    React.createElement(Text, { style: appStyles.jobRegion }, formatNullable(loadJob.destinationRegion, t(input.locale, "notSet"))),
    React.createElement(Text, { style: appStyles.jobTitle }, loadJobDisplayName(loadJob)),
    React.createElement(
      Text,
      { style: appStyles.statusMessage },
      t(input.locale, "currentProgress", { loaded: progress.loaded, planned: progress.planned, remaining: progress.remaining }),
    ),
    input.secondaryActionsExpanded
      ? React.createElement(
      View,
      { style: appStyles.userPanel },
      React.createElement(Text, { style: appStyles.userName }, t(input.locale, "dockAndCompletion")),
      React.createElement(Text, { style: appStyles.labelSpaced }, t(input.locale, "dockNo")),
      React.createElement(TextInput, {
        autoCapitalize: "characters",
        autoCorrect: false,
        editable: input.canUpdateDock && !input.savingDock,
        onChangeText: input.onChangeDockNo,
        placeholder: t(input.locale, "dockPlaceholder"),
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
            input.savingDock ? t(input.locale, "savingDock") : t(input.locale, "saveDock"),
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
            input.completingLoadJob ? t(input.locale, "completing") : t(input.locale, "completeLoading"),
          ),
        ),
      ),
      input.canComplete && normalizeScanInput(input.dockNo).length === 0
        ? React.createElement(
            Text,
            { style: appStyles.statusError },
            t(input.locale, "dockRequired"),
          )
        : null,
    ) : null,
    React.createElement(
      View,
      { style: appStyles.scanFeedbackSlot },
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
            React.createElement(Text, { style: appStyles.noticeTitle }, localizeScanNotice(input.scanNotice, input.locale).title),
            React.createElement(Text, { style: appStyles.noticeMessage }, localizeScanNotice(input.scanNotice, input.locale).message),
          )
        : null,
    ),
    input.lastScan
      ? React.createElement(
          View,
          { style: appStyles.userPanel },
          React.createElement(Text, { style: appStyles.noticeTitle }, t(input.locale, "recentScan")),
          React.createElement(Text, { style: appStyles.userName }, input.lastScan.pallet.containerNo),
          React.createElement(
            Text,
            { style: appStyles.statusMessage },
            `${input.lastScan.pallet.destinationCode} · ${t(input.locale, "pallet", { number: input.lastScan.pallet.palletNo })}`,
          ),
          React.createElement(
            Text,
            { style: appStyles.statusMessage },
            t(input.locale, "currentProgress", { loaded: input.lastScan.progress.loadedPallets, planned: input.lastScan.progress.totalPallets, remaining: input.lastScan.progress.remainingPallets }),
          ),
        )
      : null,
    React.createElement(Text, { style: appStyles.label }, t(input.locale, "scanLabel")),
    React.createElement(TextInput, {
      autoCapitalize: "none",
      autoCorrect: false,
      onChangeText: input.onChangePayload,
      onSubmitEditing: input.onSubmit,
      placeholder: t(input.locale, "scanPlaceholder"),
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
        input.submitting ? t(input.locale, "submittingScan") : t(input.locale, "submitScan"),
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
        input.cameraScanning ? t(input.locale, "openingCamera") : t(input.locale, "startCamera"),
      ),
    ),
    React.createElement(
      TouchableOpacity,
      { onPress: input.onToggleSecondaryActions, style: appStyles.secondaryButton },
      React.createElement(
        Text,
        { style: appStyles.secondaryButtonText },
        input.secondaryActionsExpanded ? t(input.locale, "hideSecondaryActions") : t(input.locale, "secondaryActions"),
      ),
    ),
    input.secondaryActionsExpanded && input.canOverride
      ? React.createElement(
          View,
          { style: appStyles.userPanel },
          React.createElement(
            Text,
            { style: appStyles.userName },
            t(input.locale, "supervisorOverride"),
          ),
          React.createElement(
            Text,
            { style: appStyles.statusMessage },
            t(input.locale, "overrideReasonPlaceholder"),
          ),
          React.createElement(Text, { style: appStyles.labelSpaced }, t(input.locale, "scanLabel")),
          React.createElement(TextInput, {
            autoCapitalize: "none",
            autoCorrect: false,
            onChangeText: input.onChangeOverridePayload,
            placeholder: t(input.locale, "scanPlaceholder"),
            style: appStyles.input,
            value: input.overridePayload,
          }),
          React.createElement(Text, { style: appStyles.labelSpaced }, t(input.locale, "overrideReason")),
          React.createElement(TextInput, {
            autoCapitalize: "sentences",
            autoCorrect: true,
            multiline: true,
            onChangeText: input.onChangeOverrideReason,
            placeholder: t(input.locale, "overrideReasonPlaceholder"),
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
                ? t(input.locale, "confirmedOverride")
                : t(input.locale, "confirmOverride"),
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
                ? t(input.locale, "submittingOverride")
                : t(input.locale, "submitOverride"),
            ),
          ),
        )
      : null,
    React.createElement(
      View,
      { style: appStyles.userPanel },
      React.createElement(Text, { style: appStyles.userName }, t(input.locale, "offlineQueue")),
      React.createElement(
        Text,
        { style: appStyles.statusMessage },
        pendingCount > 0 ? t(input.locale, "pendingCount", { count: pendingCount }) : t(input.locale, "noPendingScans"),
      ),
      React.createElement(
        TouchableOpacity,
        {
          disabled: pendingCount === 0,
          onPress: input.onToggleQueueDetails,
          style:
            pendingCount === 0
              ? appStyles.buttonDisabled
              : appStyles.button,
        },
        React.createElement(
          Text,
          { style: appStyles.buttonText },
          input.queueDetailsExpanded ? t(input.locale, "hideQueueDetails") : t(input.locale, "queueDetails"),
        ),
      ),
      input.queueDetailsExpanded
        ? React.createElement(
            TouchableOpacity,
            {
              disabled: input.syncingQueue || pendingCount === 0,
              onPress: input.onSyncQueue,
              style: input.syncingQueue || pendingCount === 0 ? appStyles.buttonDisabled : appStyles.secondaryButton,
            },
            React.createElement(
              Text,
              { style: input.syncingQueue || pendingCount === 0 ? appStyles.buttonText : appStyles.secondaryButtonText },
              input.syncingQueue ? t(input.locale, "syncing") : t(input.locale, "syncPending"),
            ),
          )
        : null,
    ),
    React.createElement(
      TouchableOpacity,
      {
        onPress: input.onBack,
        style: appStyles.secondaryButton,
      },
      React.createElement(Text, { style: appStyles.secondaryButtonText }, t(input.locale, "backToJobs")),
    ),
  );
}

function renderMeta(label: string, value: string | null, locale: NativeLocale) {
  return React.createElement(
    View,
    { key: label, style: appStyles.jobMetaItem },
    React.createElement(Text, { style: appStyles.metaLabel }, label),
    React.createElement(Text, { style: appStyles.metaValue }, formatNullable(value, t(locale, "notSet"))),
  );
}

function authCodeForError(error: unknown): AuthSession["code"] {
  if (error instanceof NativeApiError) {
    if (error.code === "INVALID_CREDENTIALS") {
      return "INVALID_CREDENTIALS";
    }
    if (error.code === "USER_INACTIVE") {
      return "USER_INACTIVE";
    }
    if (error.code === "SYSTEM_USER_LOGIN_NOT_ALLOWED") {
      return "SYSTEM_USER_LOGIN_NOT_ALLOWED";
    }
    if (error.status === 403) return "PERMISSION_DENIED";
  }
  return "AUTH_RESTORE_FAILED";
}

function expiredSessionForError(error: unknown): AuthSession {
  const code = authCodeForError(error);
  return {
    code: code === "USER_INACTIVE" ? code : "AUTH_SESSION_REVOKED",
    message: code,
    status: "session_expired",
    user: null,
  };
}

function localizeAuthMessage(session: AuthSession, locale: NativeLocale): string {
  if (session.code === "INVALID_CREDENTIALS") return t(locale, "invalidCredentials");
  if (session.code === "SYSTEM_USER_LOGIN_NOT_ALLOWED") return t(locale, "systemUser");
  if (session.code === "USER_INACTIVE") return t(locale, "inactiveUser");
  if (session.code === "AUTH_SESSION_REVOKED") return t(locale, "sessionRevoked");
  if (session.status === "session_expired") return t(locale, "sessionExpired");
  if (session.status === "permission_denied") return t(locale, "cannotUseScan");
  return nativeApiErrorMessage(locale, "UNKNOWN_AUTH_ERROR");
}

function localizeLoadJobsMessage(
  state: LoadJobsState,
  locale: NativeLocale,
): string {
  if (state.status === "loading") return t(locale, "loadingJobs");
  if (state.status === "empty") return t(locale, "noJobs");
  if (state.status === "blocked") return t(locale, "cannotUseScan");
  if (state.status === "idle") return t(locale, "loginRequired");
  if (state.status === "error") return t(locale, "genericError");
  return "";
}

function localizeScanNotice(
  notice: ScanNotice,
  locale: NativeLocale,
): { message: string; title: string } {
  const byCode: Record<string, { message: keyof typeof nativeNoticeKeys; title: keyof typeof nativeNoticeKeys }> = {
    DUPLICATE: { title: "duplicateTitle", message: "duplicateMessage" },
    OFFLINE_SCAN_QUEUED: { title: "offlineTitle", message: "offlineMessage" },
    OFFLINE_SYNCED: { title: "syncTitle", message: "syncMessage" },
  };
  const match = notice.code ? byCode[notice.code] : undefined;
  if (match) return { title: nativeNotice(locale, match.title), message: nativeNotice(locale, match.message) };
  return { title: notice.code ? nativeApiErrorMessage(locale, notice.code) : notice.title, message: notice.code ? nativeApiErrorMessage(locale, notice.code) : notice.message };
}

const nativeNoticeKeys = {
  duplicateMessage: "This pallet was already scanned for the selected load job.",
  duplicateTitle: "Duplicate scan",
  offlineMessage: "This scan is waiting for server confirmation.",
  offlineTitle: "Scan queued",
  syncMessage: "Pending scans were sent to the server.",
  syncTitle: "Scans synced",
} as const;

function nativeNotice(locale: NativeLocale, key: keyof typeof nativeNoticeKeys): string {
  const chinese: Record<keyof typeof nativeNoticeKeys, string> = {
    duplicateMessage: "此托盘已在当前装车任务中扫描。",
    duplicateTitle: "重复扫描",
    offlineMessage: "此扫描正在等待服务器确认。",
    offlineTitle: "扫描已待同步",
    syncMessage: "待处理扫描已发送到服务器。",
    syncTitle: "扫描已同步",
  };
  return locale === "zh-CN" ? chinese[key] : nativeNoticeKeys[key];
}
