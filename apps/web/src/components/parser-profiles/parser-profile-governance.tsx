"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  parserReplayDiffLabel,
  parserReplayEvidenceText,
} from "@/components/parser-learning/parser-learning-labels";
import {
  ApiClientError,
  approveParserProfileVersion,
  governParserProfileVersion,
  type ParserProfileDetailResponse,
} from "@/lib/api-client";
import {
  availableParserProfileActions,
  eligibilityKey,
  lifecycleKey,
  parserProfileErrorKey,
  parserProfileMappedFieldLabel,
  parserProfileStructuralAnchors,
  trustKey,
  type ParserProfileAction,
} from "./parser-profile-labels";

type Action = ParserProfileAction;

export function ParserProfileGovernance({
  canApprove,
  canTrain,
  initialProfile,
}: {
  canApprove: boolean;
  canTrain: boolean;
  initialProfile: ParserProfileDetailResponse;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [profile, setProfile] = useState(initialProfile);
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const snapshot = profile.completionSnapshot ?? {};
  const destinations = Array.isArray(snapshot.destinations) ? snapshot.destinations : [];
  const corrections = Array.isArray(snapshot.parserRelevantCorrectionRevisions)
    ? snapshot.parserRelevantCorrectionRevisions
    : [];
  const availableActions = availableParserProfileActions(
    profile.lifecycle,
    profile.approvalEligibility.eligible,
    canApprove,
    canTrain,
  );
  const mappedFields = profile.mappingSummary.mappedFields.map((field) =>
    parserProfileMappedFieldLabel(field, t),
  );
  const structuralAnchors = parserProfileStructuralAnchors(
    profile.structuralAnchors,
  );

  async function confirmAction() {
    if (!action || !reason.trim()) {
      setErrorCode("REASON_REQUIRED");
      return;
    }
    setBusy(true);
    setErrorCode(null);
    try {
      const next = action === "approve"
        ? await approveParserProfileVersion(profile.id, {
            expectedRevision: profile.lifecycleRevision,
            reason: reason.trim(),
            replayId: profile.replay?.replayId ?? "",
          })
        : await governParserProfileVersion(
            profile.id,
            action,
            { expectedRevision: profile.lifecycleRevision, reason: reason.trim() },
          );
      setProfile(next);
      setAction(null);
      setReason("");
      router.refresh();
    } catch (error) {
      setErrorCode(error instanceof ApiClientError ? error.code : "PROFILE_ACTION_FAILED");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 grid gap-8 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-8">
        <section className="border-t-4 border-[var(--dock-steel)] bg-[var(--surface)] px-4 py-5 shadow-sm sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="font-data text-xs text-[var(--muted)]">{profile.stableName} · {t("i18n.parserProfiles.version")} {profile.version}</p>
              <h2 className="font-control mt-2 text-xl font-semibold">{profile.customerLabel || profile.stableName}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip>{t(lifecycleKey(profile.lifecycle))}</Chip>
              <Chip>{t(trustKey(profile.trustState))}</Chip>
              <Chip>{profile.trustStreak}/3</Chip>
            </div>
          </div>
        </section>

        <EvidenceSection title={t("i18n.parserProfiles.mappingSummary")}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <EvidenceValue label={t("i18n.parserProfiles.mappedFields")} value={mappedFields.join(" · ") || "—"} />
            <EvidenceValue label={t("i18n.parserProfiles.structuralAnchors")} value={structuralAnchors.join(" · ") || "—"} />
          </dl>
        </EvidenceSection>

        <EvidenceSection title={t("i18n.parserProfiles.sourceProvenance")}>
          <dl className="grid gap-4 sm:grid-cols-2">
            <EvidenceValue label={t("i18n.parserProfiles.snapshotContainer")} value={profile.sourceProvenance?.linkedContainerNo || "—"} />
            <EvidenceValue label={t("i18n.parserProfiles.version")} value={String(profile.sourceProvenance?.sourceDraftRevision ?? "—")} />
            <EvidenceValue label={t("SHA-256")} value={profile.sourceProvenance?.sourceFileSha256 || "—"} dataValue />
            <EvidenceValue label={t("i18n.parserProfiles.lastReplay")} value={profile.replay?.passed ? t("i18n.parserProfiles.replayPassed") : t("i18n.parserProfiles.replayFailed")} />
          </dl>
        </EvidenceSection>

        <EvidenceSection title={t("i18n.parserProfiles.completionSnapshot")}>
          <dl className="grid gap-4 sm:grid-cols-3">
            <EvidenceValue label={t("i18n.parserProfiles.snapshotContainer")} value={String(snapshot.containerNo ?? "—")} />
            <EvidenceValue label={t("i18n.parserProfiles.snapshotDestinations")} value={String(destinations.length)} />
            <EvidenceValue label={t("i18n.parserProfiles.snapshotCorrections")} value={String(corrections.length)} />
          </dl>
        </EvidenceSection>

        <EvidenceSection title={t("i18n.parserProfiles.replayDiff")}>
          {profile.replay?.diff.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] table-fixed border-collapse text-left text-sm">
                <thead className="bg-[var(--surface-muted)] text-xs uppercase text-[var(--muted)]">
                  <tr>
                    <th className="w-[40%] px-3 py-2">{t("i18n.parserProfiles.diffField")}</th>
                    <th className="w-[22%] px-3 py-2">{t("i18n.parserProfiles.expected")}</th>
                    <th className="w-[22%] px-3 py-2">{t("i18n.parserProfiles.actual")}</th>
                    <th className="w-[16%] px-3 py-2">{t("i18n.parserProfiles.result")}</th>
                  </tr>
                </thead>
                <tbody>
                  {profile.replay.diff.map((item, index) => (
                    <tr className="border-t border-[var(--line-soft)] align-top" key={`${item.field}-${item.key ?? "all"}-${index}`}>
                      <td className="px-3 py-3 font-semibold">{parserReplayDiffLabel(item.code, t)}</td>
                      <td className="px-3 py-3">{parserReplayEvidenceText(item.expected, t, item.field)}</td>
                      <td className="px-3 py-3">{parserReplayEvidenceText(item.actual, t, item.field)}</td>
                      <td className="break-words px-3 py-3">{item.equal ? t("i18n.parserProfiles.replayPassed") : item.material || item.blocking ? t("i18n.parserProfiles.replayFailed") : t("i18n.parserProfiles.replayReview")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-[var(--muted)]">{t("i18n.parserProfiles.noBlockers")}</p>}
        </EvidenceSection>
      </div>

      <aside className="space-y-5 xl:sticky xl:top-28 xl:self-start">
        <section className="border border-[var(--line-soft)] bg-[var(--surface)] p-5">
          <h2 className="font-control text-lg font-semibold">{t("i18n.parserProfiles.approvalEligibility")}</h2>
          <p className={`mt-3 border-l-4 px-3 py-2 text-sm ${profile.approvalEligibility.eligible ? "border-emerald-600 bg-emerald-50 text-emerald-950" : "border-amber-500 bg-amber-50 text-amber-950"}`}>
            {t(profile.approvalEligibility.eligible ? "i18n.parserProfiles.eligible" : "i18n.parserProfiles.notEligible")}
          </p>
          {profile.approvalEligibility.codes.length > 0 ? (
            <ul className="mt-4 space-y-2 text-sm">
              {profile.approvalEligibility.codes.map((code) => <li key={code}>• {t(eligibilityKey(code))}</li>)}
            </ul>
          ) : null}
        </section>

        <section className="border border-[var(--line-soft)] bg-[var(--surface)] p-5">
          <div className="grid gap-2">
            {availableActions.includes("approve") ? <ActionButton onClick={() => setAction("approve")}>{t("i18n.parserProfiles.approve")}</ActionButton> : null}
            {availableActions.includes("pause") ? <ActionButton onClick={() => setAction("pause")}>{t("i18n.parserProfiles.pause")}</ActionButton> : null}
            {availableActions.includes("resume") ? <ActionButton onClick={() => setAction("resume")}>{t("i18n.parserProfiles.resume")}</ActionButton> : null}
            {availableActions.includes("retire") ? <ActionButton onClick={() => setAction("retire")}>{t("i18n.parserProfiles.retire")}</ActionButton> : null}
            {availableActions.includes("fork") ? <ActionButton onClick={() => setAction("fork")}>{t("i18n.parserProfiles.fork")}</ActionButton> : null}
          </div>
        </section>
      </aside>

      {action ? (
        <div aria-labelledby="profile-action-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog">
          <div className="w-full max-w-xl border-t-4 border-[var(--forklift-amber)] bg-[var(--surface)] p-6 shadow-2xl">
            <h2 className="font-control text-xl font-semibold" id="profile-action-title">{actionLabel(action, t)}</h2>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{actionDescription(action, t)}</p>
            <label className="mt-5 block text-sm font-semibold" htmlFor="profile-governance-reason">
              {t("i18n.parserProfiles.reason")}
              <textarea autoFocus className="mt-2 min-h-24 w-full border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2" id="profile-governance-reason" onChange={(event) => setReason(event.target.value)} value={reason} />
            </label>
            {errorCode ? <p aria-live="polite" className="mt-3 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-950">{errorMessage(errorCode, t)}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className="min-h-11 border border-[var(--line-strong)] px-4 font-semibold" disabled={busy} onClick={() => { setAction(null); setErrorCode(null); setReason(""); }} type="button">{t("i18n.parserProfiles.cancel")}</button>
              <button className="min-h-11 bg-[var(--dock-steel)] px-4 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={confirmAction} type="button">{t("i18n.parserProfiles.confirm")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function EvidenceSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section className="border-t border-[var(--line-strong)] pt-4"><h2 className="font-control text-lg font-semibold">{title}</h2><div className="mt-4">{children}</div></section>;
}

function EvidenceValue({ dataValue = false, label, value }: { dataValue?: boolean; label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</dt><dd className={`mt-1 text-sm ${dataValue ? "break-all font-data" : "break-words"}`}>{value}</dd></div>;
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex min-h-8 items-center border border-[var(--line-soft)] bg-[var(--surface-muted)] px-2 text-xs font-semibold">{children}</span>;
}

function ActionButton({ children, disabled = false, onClick }: { children: React.ReactNode; disabled?: boolean; onClick(): void }) {
  return <button className="min-h-11 border border-[var(--line-strong)] px-3 text-left text-sm font-semibold hover:bg-[var(--surface-muted)] disabled:cursor-not-allowed disabled:opacity-40" disabled={disabled} onClick={onClick} type="button">{children}</button>;
}

function actionLabel(action: Action, t: ReturnType<typeof useI18n>["t"]): string {
  return t(`i18n.parserProfiles.${action}` as Parameters<typeof t>[0]);
}

function actionDescription(action: Action, t: ReturnType<typeof useI18n>["t"]): string {
  if (action === "approve") return t("i18n.parserProfiles.approveConfirm");
  if (action === "pause") return t("i18n.parserProfiles.pauseImpact");
  if (action === "retire") return t("i18n.parserProfiles.retireImpact");
  return t("i18n.parserProfiles.reasonRequired");
}

function errorMessage(code: string, t: ReturnType<typeof useI18n>["t"]): string {
  return t(parserProfileErrorKey(code));
}
