import Link from "next/link";
import type { ImportParseSelectionResponse } from "@/lib/api-client";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { createTranslator } from "@/lib/i18n/translator";

const sourceKeys: Record<string, MessageKey> = {
  BUILT_IN: "i18n.parserSelection.source.BUILT_IN",
  PROFILE_REVIEW: "i18n.parserSelection.source.PROFILE_REVIEW",
  TRUSTED_PROFILE: "i18n.parserSelection.source.TRUSTED_PROFILE",
  PROFILE_FALLBACK: "i18n.parserSelection.source.PROFILE_FALLBACK",
  AMBIGUOUS: "i18n.parserSelection.source.AMBIGUOUS",
  DRIFT: "i18n.parserSelection.source.DRIFT",
};

const reasonKeys: Record<string, MessageKey> = {
  PARSER_PROFILE_UNIQUE_TRUSTED_MATCH:
    "i18n.parserSelection.reason.uniqueTrusted",
  PARSER_SELECTION_NO_ACTIVE_PROFILE:
    "i18n.parserSelection.reason.noActiveProfile",
  FINGERPRINT_NO_MATCH: "i18n.parserSelection.reason.noMatch",
  FINGERPRINT_PROFILE_COLLISION: "i18n.parserSelection.reason.collision",
  FINGERPRINT_STRUCTURAL_DRIFT: "i18n.parserSelection.reason.drift",
  PARSER_PROFILE_STATE_CHANGED_BEFORE_COMMIT:
    "i18n.parserSelection.reason.stateChanged",
  PARSER_PROFILE_REVIEW_REQUIRED: "i18n.parserSelection.reason.reviewRequired",
  PARSER_PROFILE_REQUIRED_WARNING_REVIEW:
    "i18n.parserSelection.reason.requiredWarning",
  PARSER_PROFILE_TRUSTED_RESULT_REVIEW_REQUIRED:
    "i18n.parserSelection.reason.trustedReview",
};

const matchReasonKeys: Record<string, MessageKey> = {
  FINGERPRINT_ANCHOR_MATCHED: "i18n.parserSelection.match.anchor",
};

export function ParserSelectionPanel({
  canTrain,
  importId,
  locale,
  selection,
}: {
  canTrain: boolean;
  importId: string;
  locale: Locale;
  selection: ImportParseSelectionResponse;
}) {
  const { format, t } = createTranslator(locale);
  const actionable =
    selection.source === "AMBIGUOUS" || selection.source === "DRIFT";
  const matchedReasons = selection.matchReasons.filter(
    (reason) => reason.matched,
  );

  return (
    <section
      className="min-w-0 border border-zinc-200 bg-white p-5 shadow-sm"
      data-parser-selection="true"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase text-teal-700">
            {t("i18n.parserSelection.eyebrow")}
          </p>
          <h2 className="mt-1 text-lg font-semibold text-zinc-950">
            {t(
              sourceKeys[selection.source] ??
                "i18n.parserSelection.source.unknown",
            )}
          </h2>
          <p className="mt-2 max-w-4xl break-words text-sm leading-6 text-zinc-600">
            {t(
              reasonKeys[selection.reasonCode] ??
                "i18n.parserSelection.reason.other",
            )}
          </p>
        </div>
        <span className="inline-flex min-h-8 items-center border border-zinc-300 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700">
          {selection.autoCommitted
            ? t("i18n.parserSelection.automatic")
            : t("i18n.parserSelection.notAutomatic")}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <SelectionFact
          label={t("i18n.parserSelection.profile")}
          value={
            selection.profile
              ? `${selection.profile.customerLabel ?? selection.profile.stableName} · ${format("i18n.parserSelection.versionValue", { version: selection.profile.version })}`
              : t("i18n.parserSelection.noProfile")
          }
        />
        <SelectionFact
          label={t("i18n.parserSelection.candidates")}
          value={String(selection.candidateCount)}
        />
        <SelectionFact
          label={t("i18n.parserSelection.duration")}
          value={format("i18n.parserSelection.durationValue", {
            duration: selection.durationMs,
          })}
        />
        <SelectionFact
          label={t("i18n.parserSelection.outcome")}
          value={
            selection.autoCommitted
              ? t("i18n.parserSelection.outcome.autoCommitted")
              : actionable
                ? t("i18n.parserSelection.outcome.reviewRequired")
                : t("i18n.parserSelection.outcome.fallback")
          }
        />
      </dl>

      {matchedReasons.length > 0 ? (
        <div className="mt-4 border-t border-zinc-100 pt-4">
          <h3 className="text-sm font-semibold text-zinc-950">
            {t("i18n.parserSelection.matchReasons")}
          </h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {matchedReasons.map((reason, index) => (
              <li
                className="max-w-full break-words border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-900"
                key={`${reason.code}-${index}`}
              >
                {t(
                  matchReasonKeys[reason.code] ??
                    "i18n.parserSelection.match.other",
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {actionable ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
          <Link
            className="inline-flex min-h-10 items-center border border-teal-700 bg-white px-3 text-sm font-semibold text-teal-900 hover:bg-teal-50"
            href={
              selection.profile
                ? `/parser-profiles/${encodeURIComponent(selection.profile.id)}`
                : "/parser-profiles"
            }
          >
            {t("i18n.parserSelection.openProfiles")}
          </Link>
          {canTrain ? (
            <Link
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-3 text-sm font-semibold text-zinc-900 hover:bg-zinc-50"
              href={`/imports/${encodeURIComponent(importId)}/parser-learning`}
            >
              {t("i18n.parserSelection.createLearningCase")}
            </Link>
          ) : null}
        </div>
      ) : null}

      <details className="mt-4 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
        <summary className="cursor-pointer font-semibold">
          {t("i18n.parserSelection.diagnostics")}
        </summary>
        <div className="mt-2 grid gap-1 break-all" data-i18n-ignore>
          <span>{selection.reasonCode}</span>
          {selection.fingerprintHash ? (
            <span>{selection.fingerprintHash}</span>
          ) : null}
        </div>
      </details>
    </section>
  );
}

function SelectionFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l-2 border-zinc-200 pl-3">
      <dt className="text-xs font-medium uppercase text-zinc-500">{label}</dt>
      <dd className="mt-1 break-words font-semibold text-zinc-900">{value}</dd>
    </div>
  );
}
