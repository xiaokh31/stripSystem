"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useI18n } from "@/components/i18n/i18n-provider";
import {
  ApiClientError,
  correctParserProfileReview,
  decideParserProfileReview,
  type ParserProfileReviewLine,
  type ParserProfileReviewResponse,
} from "@/lib/api-client";
import {
  parserMatchReasonKey,
  parserMaterialFieldKey,
  parserReviewIssueKey,
  parserReviewStatusKey,
} from "./parser-profile-review-labels";
import { trustKey } from "./parser-profile-labels";

type Decision = "accept" | "correct" | "reject";

export function ParserProfileReviewPanel({
  canReview,
  initialReview,
}: {
  canReview: boolean;
  initialReview: ParserProfileReviewResponse;
}) {
  const { format, t } = useI18n();
  const router = useRouter();
  const [review, setReview] = useState(initialReview);
  const [editing, setEditing] = useState(false);
  const [containerNo, setContainerNo] = useState(
    initialReview.canonicalResult.containerNo,
  );
  const [lines, setLines] = useState(initialReview.canonicalResult.lines);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const pending = review.status === "PENDING";
  const hasBlockingErrors = review.errors.length > 0;
  const displayedDestinations =
    review.finalDestinationSummary ?? review.destinationSummary;
  const displayedReport = review.finalReportPreview ?? review.reportPreview;
  const provenanceFields = useMemo(
    () => Object.keys(review.provenance ?? {}).sort(),
    [review.provenance],
  );

  function updateLine(index: number, patch: Partial<ParserProfileReviewLine>) {
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index ? { ...line, ...patch } : line,
      ),
    );
  }

  function addLine() {
    const rowNumber = Math.max(0, ...lines.map((line) => line.rowNumber)) + 1;
    setLines((current) => [
      ...current,
      {
        rowNumber,
        included: true,
        destinationCode: null,
        cartons: null,
        volumeCbm: null,
        packageType: null,
        deliveryMethod: null,
        waybillNo: null,
        referenceNo: null,
        poNumber: null,
      },
    ]);
  }

  function removeLine(index: number) {
    setLines((current) => current.filter((_, lineIndex) => lineIndex !== index));
  }

  async function confirmDecision() {
    if (!decision) return;
    if ((decision === "correct" || decision === "reject") && !reason.trim()) {
      setErrorCode("PARSER_REVIEW_REASON_REQUIRED");
      return;
    }
    setBusy(true);
    setErrorCode(null);
    try {
      const next =
        decision === "correct"
          ? await correctParserProfileReview(review.importFileId, {
              expectedRevision: review.revision,
              reason: reason.trim(),
              canonicalResult: { containerNo: containerNo.trim(), lines },
            })
          : await decideParserProfileReview(
              review.importFileId,
              decision,
              {
                expectedRevision: review.revision,
                reason: reason.trim() || null,
              },
            );
      setReview(next);
      const finalResult = next.finalCanonicalResult ?? next.canonicalResult;
      setContainerNo(finalResult.containerNo);
      setLines(finalResult.lines);
      setDecision(null);
      setReason("");
      setEditing(false);
      router.refresh();
    } catch (error) {
      setErrorCode(
        error instanceof ApiClientError
          ? error.code
          : "PARSER_REVIEW_ACTION_FAILED",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="parser-review-title"
      className="border-t-4 border-amber-500 bg-white p-5 shadow-sm sm:p-6"
      data-parser-profile-review="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {t("i18n.parserReview.eyebrow")}
          </p>
          <h2 className="mt-2 text-xl font-semibold" id="parser-review-title">
            {t("i18n.parserReview.title")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            {t("i18n.parserReview.subtitle")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Chip>{t(parserReviewStatusKey(review.status))}</Chip>
          <Chip>{t(trustKey(review.profile.trustState))}</Chip>
          <Chip>{review.profile.trustStreak}/3</Chip>
        </div>
      </div>

      <dl className="mt-5 grid gap-3 border-y border-zinc-200 py-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <Value label={t("i18n.parserReview.profile")} value={`${review.profile.customerLabel || review.profile.stableName} · ${t("i18n.parserProfiles.version")} ${review.profile.version}`} />
        <Value label={t("i18n.parserReview.sourceHash")} value={review.sourceFileShortSha} data />
        <Value label={t("i18n.parserReview.matcherVersion")} value={review.profile.matcherVersion} data />
        <Value label={t("i18n.parserReview.parserVersion")} value={review.profile.parserVersion} data />
      </dl>

      <div className="mt-6 grid gap-7 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-7">
          <ReviewSection title={t("i18n.parserReview.matchEvidence")}>
            <ul className="grid gap-2 text-sm sm:grid-cols-2">
              {review.matchReasons.map((item, index) => (
                <li className="border-l-4 border-emerald-600 bg-emerald-50 px-3 py-2 text-emerald-950" key={`${item.code}-${index}`}>
                  {t(parserMatchReasonKey(item.code))}
                </li>
              ))}
            </ul>
          </ReviewSection>

          <ReviewSection title={t("i18n.parserReview.sourcePreview")}>
            {review.sourcePreview.sheets.map((sheet, sheetIndex) => (
              <div className="mt-3" key={`${sheet.name ?? sheet.index}-${sheetIndex}`}>
                <p className="text-sm font-semibold">{sheet.name || `${t("i18n.parserReview.sheet")} ${sheet.index ?? sheetIndex + 1}`}</p>
                <div className="mt-2 max-h-64 overflow-auto border border-zinc-200">
                  <table className="w-full min-w-[34rem] border-collapse text-left text-xs">
                    <thead className="sticky top-0 bg-zinc-100">
                      <tr><th className="px-3 py-2">{t("i18n.parserReview.cell")}</th><th className="px-3 py-2">{t("i18n.parserReview.sourceValue")}</th></tr>
                    </thead>
                    <tbody>
                      {sheet.sampleCells.map((cell, index) => (
                        <tr className="border-t border-zinc-100" key={`${cell.cell ?? index}`}>
                          <td className="px-3 py-2 font-mono">{cell.cell ?? `${cell.row ?? ""}:${cell.column ?? ""}`}</td>
                          <td className="break-words px-3 py-2">{displayValue(cell.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </ReviewSection>

          <ReviewSection title={t("i18n.parserReview.canonicalRows")}>
            {review.finalCanonicalResult ? (
              <p className="mb-3 border-l-4 border-sky-600 bg-sky-50 px-3 py-2 text-sm text-sky-950">
                {t("i18n.parserReview.stagedImmutable")}
              </p>
            ) : null}
            <label className="block text-sm font-semibold" htmlFor="parser-review-container-no">
              {t("i18n.parserReview.field.containerNo")}
              <input
                className="mt-2 min-h-11 w-full max-w-md border border-zinc-300 px-3 disabled:bg-zinc-50"
                disabled={!editing}
                id="parser-review-container-no"
                onChange={(event) => setContainerNo(event.target.value)}
                value={containerNo}
              />
            </label>
            <div className="mt-4 overflow-x-auto border border-zinc-200">
              <table className="w-full min-w-[96rem] border-collapse text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.included")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.row")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.destinationCode")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.cartons")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.volumeCbm")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.packageType")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.deliveryMethod")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.waybillNo")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.referenceNo")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.poNumber")}</th>
                    {editing ? <th className="px-3 py-2">{t("i18n.parserReview.rowActions")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, index) => (
                    <tr className="border-t border-zinc-100 align-top" key={line.rowNumber}>
                      <td className="px-3 py-2"><input aria-label={t("i18n.parserReview.includeRowAria")} checked={line.included} disabled={!editing} onChange={(event) => updateLine(index, { included: event.target.checked })} type="checkbox" /></td>
                      <td className="px-3 py-2 font-mono">{line.rowNumber}</td>
                      <EditableCell disabled={!editing} onChange={(value) => updateLine(index, { destinationCode: value || null })} value={line.destinationCode ?? ""} />
                      <EditableCell disabled={!editing} inputMode="numeric" onChange={(value) => updateLine(index, { cartons: value === "" ? null : Number(value) })} value={line.cartons?.toString() ?? ""} />
                      <EditableCell disabled={!editing} inputMode="decimal" onChange={(value) => updateLine(index, { volumeCbm: value || null })} value={line.volumeCbm ?? ""} />
                      <EditableCell disabled={!editing} onChange={(value) => updateLine(index, { packageType: value || null })} value={line.packageType ?? ""} />
                      <EditableCell disabled={!editing} onChange={(value) => updateLine(index, { deliveryMethod: value || null })} value={line.deliveryMethod ?? ""} />
                      <EditableCell disabled={!editing} onChange={(value) => updateLine(index, { waybillNo: value || null })} value={line.waybillNo ?? ""} />
                      <EditableCell disabled={!editing} onChange={(value) => updateLine(index, { referenceNo: value || null })} value={line.referenceNo ?? ""} />
                      <EditableCell disabled={!editing} onChange={(value) => updateLine(index, { poNumber: value || null })} value={line.poNumber ?? ""} />
                      {editing ? (
                        <td className="px-2 py-2">
                          <button
                            aria-label={format("i18n.parserReview.removeRowAria", { row: line.rowNumber })}
                            className="min-h-9 border border-red-300 px-3 text-sm font-semibold text-red-800"
                            disabled={lines.length === 1}
                            onClick={() => removeLine(index)}
                            type="button"
                          >
                            {t("i18n.parserReview.removeRow")}
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {editing ? (
              <button className="mt-3 min-h-10 border border-zinc-400 px-4 text-sm font-semibold" onClick={addLine} type="button">
                {t("i18n.parserReview.addRow")}
              </button>
            ) : null}
          </ReviewSection>

          <ReviewSection title={t("i18n.parserReview.destinations")}>
            <div className="overflow-x-auto border border-zinc-200">
              <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                <thead className="bg-zinc-100 text-xs uppercase text-zinc-600">
                  <tr>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.destinationCode")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.cartons")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.field.volumeCbm")}</th>
                    <th className="px-3 py-2">{t("i18n.parserReview.totalPallets")}</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedDestinations.map((destination, index) => (
                    <tr className="border-t border-zinc-100" key={`${displayValue(destination.destinationCode)}-${index}`}>
                      <td className="px-3 py-2">{displayValue(destination.destinationCode)}</td>
                      <td className="px-3 py-2">{displayValue(destination.cartons)}</td>
                      <td className="px-3 py-2">{displayValue(destination.volumeCbm)}</td>
                      <td className="px-3 py-2">{displayValue(destination.finalPallets)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ReviewSection>

          <ReviewSection title={t("i18n.parserReview.provenance")}>
            {provenanceFields.length ? (
              <ul className="flex flex-wrap gap-2 text-sm">{provenanceFields.map((field) => <li className="border border-zinc-200 bg-zinc-50 px-2 py-1" key={field}>{t(parserMaterialFieldKey(field))}</li>)}</ul>
            ) : <p className="text-sm text-zinc-600">{t("i18n.parserReview.noProvenance")}</p>}
          </ReviewSection>

          {review.correctionDiff.length ? (
            <ReviewSection title={t("i18n.parserReview.materialDiff")}>
              <ul className="space-y-2 text-sm">{review.correctionDiff.map((item, index) => <li className={`break-words border-l-4 px-3 py-2 ${item.material ? "border-amber-500 bg-amber-50" : "border-sky-500 bg-sky-50"}`} key={`${item.field}-${index}`}>{item.rowNumber ? format("i18n.parserReview.diffRow", { field: t(parserMaterialFieldKey(item.field)), row: item.rowNumber }) : t(parserMaterialFieldKey(item.field))} · {t(item.material ? "i18n.parserReview.material" : "i18n.parserReview.nonMaterial")}</li>)}</ul>
            </ReviewSection>
          ) : null}
        </div>

        <aside className="space-y-5 xl:sticky xl:top-24 xl:self-start">
          <Summary title={t("i18n.parserReview.reportPreview")} values={[
            [t("i18n.parserReview.field.containerNo"), displayedReport.containerNo],
            [t("i18n.parserReview.destinations"), displayedReport.destinationCount],
            [t("i18n.parserReview.totalCartons"), displayedReport.totalCartons],
            [t("i18n.parserReview.totalVolume"), displayedReport.totalVolumeCbm],
            [t("i18n.parserReview.totalPallets"), displayedReport.totalPallets],
          ]} />
          <section className="border border-zinc-200 p-4">
            <h3 className="font-semibold">{t("i18n.parserReview.requiredWarnings")}</h3>
            {review.warnings.length || review.errors.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {[...review.warnings, ...review.errors].map((issue, index) => <li className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2" key={index}>{t(parserReviewIssueKey(typeof issue.code === "string" ? issue.code : ""))}</li>)}
              </ul>
            ) : <p className="mt-3 text-sm text-zinc-600">{t("i18n.parserReview.noWarnings")}</p>}
          </section>
          {review.acceptedContainer ? (
            <Link className="inline-flex min-h-11 w-full items-center justify-center bg-emerald-700 px-4 text-sm font-semibold text-white" href={`/containers/${review.acceptedContainer.id}`}>{t("i18n.parserReview.openContainer")}</Link>
          ) : null}
          {pending && canReview ? (
            <div className="grid gap-2">
              {hasBlockingErrors ? <p className="border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">{t("i18n.parserReview.errorsBlockCommit")}</p> : null}
              {!editing && !hasBlockingErrors ? <button className="min-h-11 bg-emerald-700 px-4 text-left text-sm font-semibold text-white" onClick={() => setDecision("accept")} type="button">{t("i18n.parserReview.accept")}</button> : null}
              {!hasBlockingErrors ? <button className="min-h-11 border border-zinc-400 px-4 text-left text-sm font-semibold" onClick={() => editing ? setDecision("correct") : setEditing(true)} type="button">{t(editing ? "i18n.parserReview.submitCorrection" : "i18n.parserReview.correct")}</button> : null}
              {editing ? <button className="min-h-11 border border-zinc-300 px-4 text-left text-sm" onClick={() => { setEditing(false); setContainerNo(review.canonicalResult.containerNo); setLines(review.canonicalResult.lines); }} type="button">{t("i18n.parserReview.cancelCorrection")}</button> : null}
              {!editing ? <button className="min-h-11 border border-red-300 px-4 text-left text-sm font-semibold text-red-800" onClick={() => setDecision("reject")} type="button">{t("i18n.parserReview.reject")}</button> : null}
            </div>
          ) : null}
          {pending && !canReview ? <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-sm">{t("i18n.parserReview.readOnly")}</p> : null}
        </aside>
      </div>

      {decision ? (
        <div aria-labelledby="parser-review-dialog-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/55 p-4" role="dialog">
          <div className="max-h-[90vh] w-full max-w-xl overflow-auto border-t-4 border-amber-500 bg-white p-6 shadow-2xl">
            <h2 className="text-xl font-semibold" id="parser-review-dialog-title">{t(`i18n.parserReview.dialog.${decision}.title`)}</h2>
            <p className="mt-3 break-words text-sm leading-6 text-zinc-600">{t(`i18n.parserReview.dialog.${decision}.description`)}</p>
            <label className="mt-5 block text-sm font-semibold" htmlFor="parser-review-reason">{decision === "accept" ? format("i18n.parserReview.reasonOptional", { reason: t("i18n.parserReview.reason"), optional: t("i18n.parserReview.optional") }) : t("i18n.parserReview.reason")}<textarea autoFocus className="mt-2 min-h-24 w-full border border-zinc-300 px-3 py-2" id="parser-review-reason" onChange={(event) => setReason(event.target.value)} value={reason} /></label>
            {errorCode ? <p aria-live="polite" className="mt-3 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-sm text-red-900">{reviewError(errorCode, t)}</p> : null}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className="min-h-11 border border-zinc-300 px-4 font-semibold" disabled={busy} onClick={() => { setDecision(null); setReason(""); setErrorCode(null); }} type="button">{t("i18n.parserProfiles.cancel")}</button>
              <button className="min-h-11 bg-zinc-900 px-4 font-semibold text-white disabled:opacity-50" disabled={busy} onClick={confirmDecision} type="button">{t("i18n.parserProfiles.confirm")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ReviewSection({ children, title }: { children: React.ReactNode; title: string }) {
  return <section><h3 className="border-b border-zinc-200 pb-2 text-base font-semibold">{title}</h3><div className="mt-3">{children}</div></section>;
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex min-h-8 items-center border border-zinc-300 bg-zinc-50 px-2 text-xs font-semibold">{children}</span>;
}

function Value({ data = false, label, value }: { data?: boolean; label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt><dd className={`mt-1 break-words ${data ? "font-mono text-xs" : ""}`}>{value}</dd></div>;
}

function EditableCell({ disabled, inputMode, onChange, value }: { disabled: boolean; inputMode?: "decimal" | "numeric"; onChange(value: string): void; value: string }) {
  return <td className="px-2 py-2"><input className="min-h-9 w-full min-w-24 border border-transparent bg-transparent px-2 disabled:text-zinc-800 enabled:border-zinc-300 enabled:bg-white" disabled={disabled} inputMode={inputMode} onChange={(event) => onChange(event.target.value)} value={value} /></td>;
}

function Summary({ title, values }: { title: string; values: Array<[string, unknown]> }) {
  return <section className="border border-zinc-200 p-4"><h3 className="font-semibold">{title}</h3><dl className="mt-3 space-y-2 text-sm">{values.map(([label, value]) => <div className="flex justify-between gap-3 border-t border-zinc-100 pt-2" key={label}><dt className="text-zinc-600">{label}</dt><dd className="break-words text-right font-semibold">{displayValue(value)}</dd></div>)}</dl></section>;
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number") return String(value);
  return "—";
}

function reviewError(code: string, t: ReturnType<typeof useI18n>["t"]): string {
  if (code === "PARSER_REVIEW_REASON_REQUIRED") return t("i18n.parserReview.reasonRequired");
  if (code.includes("REVISION") || code.includes("ALREADY_DECIDED")) return t("i18n.parserReview.refreshRequired");
  if (code.includes("FORBIDDEN")) return t("i18n.parserReview.forbidden");
  return t("i18n.parserReview.actionFailed");
}
