import type {
  CreateContainerDestinationRequest,
  ContainerDetailDestinationResponse,
  UpdateContainerDestinationRequest,
} from "@/lib/api-client";
import {
  DEFAULT_LOCALE,
  type Locale,
  type MessageKey,
} from "../../lib/i18n/catalog";
import { createTranslator, type Translator } from "../../lib/i18n/translator";

export interface DestinationCorrectionDraft {
  cartons: string;
  correctionNote: string;
  destinationCode: string;
  destinationType: string;
  manualPallets: string;
  note: string;
  volume: string;
}

export type CorrectionBuildResult =
  | {
      ok: true;
      changedFields: string[];
      payload: UpdateContainerDestinationRequest;
    }
  | {
      ok: false;
      error: string;
    };

export function draftFromDestination(
  destination: ContainerDetailDestinationResponse,
): DestinationCorrectionDraft {
  return {
    cartons: String(destination.totalCartons),
    correctionNote: "",
    destinationCode: destination.destinationCode,
    destinationType: destination.destinationType ?? "",
    manualPallets:
      destination.manualPallets === null ? "" : String(destination.manualPallets),
    note: destination.note ?? "",
    volume: destination.totalVolumeCbm,
  };
}

export function buildDestinationCorrectionRequest(
  destination: ContainerDetailDestinationResponse,
  draft: DestinationCorrectionDraft,
): CorrectionBuildResult {
  const destinationCode = draft.destinationCode.trim();
  if (!destinationCode) {
    return { ok: false, error: "Destination code is required." };
  }

  const manualPallets = parseManualPallets(draft.manualPallets);
  if (!manualPallets.ok) {
    return manualPallets;
  }

  const cartons = parseWholeNumber(draft.cartons, "Actual cartons");
  if (!cartons.ok) {
    return cartons;
  }

  const volume = parseDecimalNumber(draft.volume, "Actual CBM");
  if (!volume.ok) {
    return volume;
  }

  const destinationType = nullableTrimmedString(draft.destinationType);
  const note = nullableTrimmedString(draft.note);
  const currentDestinationCode = destination.destinationCode.trim();
  const currentDestinationType = nullableText(destination.destinationType);
  const currentNote = nullableText(destination.note);
  const payload: UpdateContainerDestinationRequest = {};
  const changedFields: string[] = [];

  if (destinationCode !== currentDestinationCode) {
    payload.destinationCode = destinationCode;
    changedFields.push("destinationCode");
  }

  if (destinationType !== currentDestinationType) {
    payload.destinationType = destinationType;
    changedFields.push("destinationType");
  }

  if (cartons.value !== destination.totalCartons) {
    payload.cartons = cartons.value;
    changedFields.push("cartons");
  }

  if (volume.value !== Number(destination.totalVolumeCbm)) {
    payload.volume = volume.value;
    changedFields.push("volume");
  }

  if (manualPallets.value !== destination.manualPallets) {
    payload.manualPallets = manualPallets.value;
    changedFields.push("manualPallets");
  }

  if (note !== currentNote) {
    payload.note = note;
    changedFields.push("note");
  }

  const correctionNote = nullableTrimmedString(draft.correctionNote);
  if (correctionNote) {
    payload.correctionNote = correctionNote;
  }

  if (changedFields.length === 0) {
    return {
      ok: false,
      error:
        "Change a business field such as destination, actual cartons, actual CBM, actual pallets, or actual note before saving.",
    };
  }

  return { ok: true, changedFields, payload };
}

export function buildCreateDestinationRequest(
  draft: DestinationCorrectionDraft,
): { ok: true; payload: CreateContainerDestinationRequest } | { ok: false; error: string } {
  const destinationCode = draft.destinationCode.trim();
  if (!destinationCode) {
    return { ok: false, error: "Destination code is required." };
  }

  const manualPallets = parseManualPallets(draft.manualPallets);
  if (!manualPallets.ok) {
    return manualPallets;
  }

  const cartons = parseWholeNumber(draft.cartons, "Actual cartons");
  if (!cartons.ok) {
    return cartons;
  }

  const volume = parseDecimalNumber(draft.volume, "Actual CBM");
  if (!volume.ok) {
    return volume;
  }

  const payload: CreateContainerDestinationRequest = {
    cartons: cartons.value,
    destinationCode,
    destinationType: nullableTrimmedString(draft.destinationType),
    manualPallets: manualPallets.value,
    note: nullableTrimmedString(draft.note),
    volume: volume.value,
  };
  const correctionNote = nullableTrimmedString(draft.correctionNote);
  if (correctionNote) {
    payload.correctionNote = correctionNote;
  }

  return { ok: true, payload };
}

export function issueList(
  input: unknown,
  locale: Locale = DEFAULT_LOCALE,
): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const translator = createTranslator(locale);

  return input.flatMap((item) => {
    if (typeof item === "string") {
      return [normalizeIssueMessage(item, translator)];
    }

    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      if (record.code === "PACKAGE_TYPE_CONFIRMATION_REQUIRED") {
        return [];
      }
      return [displayIssue(record, translator)];
    }

    return [translator.t("Parser issue details are unavailable.")];
  });
}

export interface IssueSummary {
  count: number;
  message: string;
}

export function summarizeIssues(
  input: unknown,
  locale: Locale = DEFAULT_LOCALE,
): IssueSummary[] {
  const counts = new Map<string, number>();
  for (const issue of issueList(input, locale)) {
    counts.set(issue, (counts.get(issue) ?? 0) + 1);
  }

  return Array.from(counts, ([message, count]) => ({
    count,
    message,
  }));
}

export function formatIssueSummary(
  issue: IssueSummary,
  locale: Locale = DEFAULT_LOCALE,
): string {
  return issue.count > 1
    ? createTranslator(locale).format("i18n.issue.count", {
        count: issue.count,
        message: issue.message,
      })
    : issue.message;
}

export function formatNullable(value: string | number | null): string {
  return value === null || value === "" ? "-" : String(value);
}

export function ruleSummary(
  destination: ContainerDetailDestinationResponse,
  locale: Locale = DEFAULT_LOCALE,
): string {
  const translator = createTranslator(locale);
  const packageType = displayPackageType(destination, translator);
  const palletRule = displayPalletRule(destination.palletRuleCode, translator);
  const roundingMode = displayRoundingMode(destination.roundingMode, translator);
  const parts = [
    packageType
      ? translator.format("i18n.containers.rule.package", { packageType })
      : null,
    palletRule,
    destination.calculationBasisCbm
      ? translator.format("i18n.containers.rule.basis", {
          basis: Number(destination.calculationBasisCbm).toFixed(3),
        })
      : null,
    roundingMode
      ? translator.format("i18n.containers.rule.rounding", {
          rounding: roundingMode,
        })
      : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : formatNullable(null);
}

const issueMessagesByCode: Record<string, MessageKey> = {
  COURIER_DELIVERY_METHOD_MISSING_CARRIER:
    "Courier delivery is requested, but the delivery method or note does not specify a carrier such as UPS, Purolator, FedEx, Canpar, DHL, or Canada Post.",
  INVALID_MANUAL_PALLETS:
    "Manual pallet override is negative; calculated pallet count was used instead.",
  MISSING_CARTONS: "Cartons are missing or zero.",
  MISSING_DESTINATION: "Destination code is missing.",
  MISSING_VOLUME: "Volume is missing.",
  MISSING_WAYBILL_FOR_ADDRESS_DESTINATION:
    "Commercial or private address destination requires a waybill number.",
  NEED_CONFIRM_DESTINATION_TYPE:
    "i18n.containers.warning.destinationReview",
  OVERSIZE_PIECE_COUNT_REQUIRED:
    "i18n.containers.warning.oversizePieceCountRequired",
  WOODEN_CRATE_PIECE_COUNT_REQUIRED:
    "i18n.containers.warning.woodenCratePieceCountRequired",
};

const issueMessagesBySource: Record<string, MessageKey> = {
  "Destination code is missing.": "Destination code is missing.",
};

const palletRuleLabels: Record<string, MessageKey> = {
  ADDRESS_CARTON_VOLUME_1_8: "Private/commercial carton volume rule",
  ADDRESS_WOODEN_CRATE_PIECE_COUNT:
    "Private/commercial wooden crate piece-count rule",
  FOOTPRINT_HEIGHT_VOLUME_LOW_1_7:
    "i18n.containers.palletRule.lowHeightVolume",
  MIXED_PALLET_CALCULATION: "i18n.containers.palletRule.mixed",
  OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2:
    "i18n.containers.palletRule.otherDestinationVolume",
  OVERSIZE_PIECE_COUNT: "i18n.containers.palletRule.oversizePieceCount",
  UNKNOWN_DESTINATION_VOLUME_1_7: "Unknown destination 1.7 CBM review rule",
  VOLUME_1_7: "1.7 CBM volume rule",
  VOLUME_2_2: "2.2 CBM volume rule",
  WOODEN_CRATE_PIECE_COUNT:
    "i18n.containers.palletRule.woodenCratePieceCount",
  YEG1_FOOTPRINT_HEIGHT_PLUS_4:
    "i18n.containers.palletRule.yeg1PlusFour",
  YEG1_VOLUME_1_7_PLUS_5: "YEG1 1.7 CBM plus 5 pallets rule",
};

const packageTypeLabels: Record<string, MessageKey> = {
  CARTON: "i18n.containers.packageType.carton",
  WOODEN_CRATE: "i18n.containers.packageType.woodenCrate",
};

const roundingModeLabels: Record<string, MessageKey> = {
  CEIL: "i18n.containers.rounding.up",
  MIXED: "i18n.containers.rounding.mixed",
  PIECE_COUNT: "i18n.containers.rounding.byPieceCount",
};

function displayIssue(
  record: Record<string, unknown>,
  translator: Translator,
): string {
  const code = stringValue(record.code);
  const message = stringValue(record.message);

  if (code === "ZERO_VOLUME_WITH_CARTONS") {
    return translator.t(
      "Volume is zero while cartons are greater than zero; 0.01 CBM was used for pallet calculation.",
    );
  }

  if (code && issueMessagesByCode[code]) {
    return translator.t(issueMessagesByCode[code]);
  }

  return message
    ? normalizeIssueMessage(message, translator)
    : translator.t("Parser issue details are unavailable.");
}

function normalizeIssueMessage(message: string, translator: Translator): string {
  const trimmed = message.trim();
  const knownMessage = issueMessagesBySource[trimmed];

  if (knownMessage) {
    return translator.t(knownMessage);
  }

  if (
    trimmed === "Volume is 0 but cartons are present." ||
    trimmed === "Volume is 0 while cartons are greater than 0."
  ) {
    return zeroVolumeIssueFallback(translator);
  }

  if (
    trimmed ===
    "manualPallets is negative; calculated pallet count was used instead."
  ) {
    return translator.t(issueMessagesByCode.INVALID_MANUAL_PALLETS);
  }

  return translator.t("Parser issue details are unavailable.");
}

function zeroVolumeIssueFallback(translator: Translator): string {
  return translator.t(
    "Volume is zero while cartons are greater than zero; 0.01 CBM was used for pallet calculation.",
  );
}

function displayPackageType(
  destination: ContainerDetailDestinationResponse,
  translator: Translator,
): string | null {
  if (
    destination.packageType &&
    destination.packageType !== "UNKNOWN" &&
    destination.packageType !== "UNSPECIFIED"
  ) {
    return packageTypeLabels[destination.packageType]
      ? translator.t(packageTypeLabels[destination.packageType])
      : translator.t("Unknown - review");
  }
  if (destination.palletRuleCode === "ADDRESS_WOODEN_CRATE_PIECE_COUNT") {
    return translator.t(packageTypeLabels.WOODEN_CRATE);
  }
  if (destination.palletRuleCode === "WOODEN_CRATE_PIECE_COUNT") {
    return translator.t(packageTypeLabels.WOODEN_CRATE);
  }
  if (destination.palletRuleCode === "ADDRESS_CARTON_VOLUME_1_8") {
    return translator.t(packageTypeLabels.CARTON);
  }
  if (
    destination.palletRuleCode &&
    [
      "FOOTPRINT_HEIGHT_VOLUME_LOW_1_7",
      "YEG1_FOOTPRINT_HEIGHT_PLUS_4",
      "OTHER_DESTINATION_FOOTPRINT_HEIGHT_2_2",
      "OVERSIZE_PIECE_COUNT",
    ].includes(destination.palletRuleCode)
  ) {
    return translator.t(packageTypeLabels.CARTON);
  }
  return null;
}

function displayPalletRule(
  value: string | null,
  translator: Translator,
): string | null {
  if (!value) {
    return null;
  }

  return palletRuleLabels[value]
    ? translator.t(palletRuleLabels[value])
    : translator.t("Unknown - review");
}

function displayRoundingMode(
  value: string | null,
  translator: Translator,
): string | null {
  if (!value) {
    return null;
  }

  return roundingModeLabels[value]
    ? translator.t(roundingModeLabels[value])
    : translator.t("Unknown - review");
}

function parseManualPallets(
  value: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 1) {
    return {
      ok: false,
      error:
        "Manual pallets must be a whole number of 1 or greater. Delete the destination instead when there is no cargo.",
    };
  }

  return { ok: true, value: parsed };
}

function parseWholeNumber(
  value: string,
  label: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!trimmed || !Number.isInteger(parsed) || parsed < 0) {
    return { ok: false, error: `${label} must be a whole number of 0 or greater.` };
  }

  return { ok: true, value: parsed };
}

function parseDecimalNumber(
  value: string,
  label: string,
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!trimmed || !Number.isFinite(parsed) || parsed < 0) {
    return { ok: false, error: `${label} must be 0 or greater.` };
  }

  return { ok: true, value: parsed };
}

function nullableTrimmedString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return nullableTrimmedString(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
