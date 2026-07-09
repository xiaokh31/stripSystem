import type {
  CreateContainerDestinationRequest,
  ContainerDetailDestinationResponse,
  UpdateContainerDestinationRequest,
} from "@/lib/api-client";

export interface DestinationCorrectionDraft {
  cartons: string;
  correctionNote: string;
  destinationCode: string;
  destinationType: string;
  manualPallets: string;
  note: string;
  packageType: string;
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
    packageType: destination.packageType ?? "",
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
  const payload: UpdateContainerDestinationRequest = {};
  const changedFields: string[] = [];

  if (destinationCode !== destination.destinationCode) {
    payload.destinationCode = destinationCode;
    changedFields.push("destinationCode");
  }

  if (destinationType !== destination.destinationType) {
    payload.destinationType = destinationType;
    changedFields.push("destinationType");
  }

  const packageType = nullableTrimmedString(draft.packageType);
  if (packageType !== destination.packageType) {
    payload.packageType = packageType;
    changedFields.push("packageType");
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

  if (note !== destination.note) {
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
        "Change destination, package type, actual cartons, actual CBM, actual pallets, or note before saving.",
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
    packageType: nullableTrimmedString(draft.packageType),
    volume: volume.value,
  };
  const correctionNote = nullableTrimmedString(draft.correctionNote);
  if (correctionNote) {
    payload.correctionNote = correctionNote;
  }

  return { ok: true, payload };
}

export function issueList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.map((item) => {
    if (typeof item === "string") {
      return item;
    }

    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const message = stringValue(record.message) ?? JSON.stringify(record);
      return message;
    }

    return String(item);
  });
}

export interface IssueSummary {
  count: number;
  message: string;
}

export function summarizeIssues(input: unknown): IssueSummary[] {
  const counts = new Map<string, number>();
  for (const issue of issueList(input)) {
    counts.set(issue, (counts.get(issue) ?? 0) + 1);
  }

  return Array.from(counts, ([message, count]) => ({
    count,
    message,
  }));
}

export function formatIssueSummary(issue: IssueSummary): string {
  return issue.count > 1 ? `${issue.message}  ${issue.count}x` : issue.message;
}

export function formatNullable(value: string | number | null): string {
  return value === null || value === "" ? "-" : String(value);
}

export function ruleSummary(
  destination: ContainerDetailDestinationResponse,
): string {
  const parts = [
    destination.packageType ? `Package ${destination.packageType}` : null,
    destination.palletRuleCode ? `Rule ${destination.palletRuleCode}` : null,
    destination.calculationBasisCbm
      ? `Basis ${Number(destination.calculationBasisCbm).toFixed(3)} CBM`
      : null,
    destination.roundingMode ? `Rounding ${destination.roundingMode}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length > 0 ? parts.join(" · ") : formatNullable(null);
}

function parseManualPallets(
  value: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      ok: false,
      error: "Manual pallets must be a whole number of 0 or greater.",
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

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
