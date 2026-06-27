import type {
  ContainerDetailDestinationResponse,
  UpdateContainerDestinationRequest,
} from "@/lib/api-client";

export interface DestinationCorrectionDraft {
  correctionNote: string;
  destinationCode: string;
  destinationType: string;
  manualPallets: string;
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
    correctionNote: "",
    destinationCode: destination.destinationCode,
    destinationType: destination.destinationType ?? "",
    manualPallets:
      destination.manualPallets === null ? "" : String(destination.manualPallets),
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

  const destinationType = nullableTrimmedString(draft.destinationType);
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

  if (manualPallets.value !== destination.manualPallets) {
    payload.manualPallets = manualPallets.value;
    changedFields.push("manualPallets");
  }

  const correctionNote = nullableTrimmedString(draft.correctionNote);
  if (correctionNote) {
    payload.correctionNote = correctionNote;
  }

  if (changedFields.length === 0) {
    return {
      ok: false,
      error: "Change destination code, destination type, or manual pallets before saving.",
    };
  }

  return { ok: true, changedFields, payload };
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
      const code = stringValue(record.code);
      const field = stringValue(record.field);
      const message = stringValue(record.message) ?? JSON.stringify(record);

      if (code && field) {
        return `${code} / ${field}: ${message}`;
      }
      if (code) {
        return `${code}: ${message}`;
      }
      return message;
    }

    return String(item);
  });
}

export function formatNullable(value: string | number | null): string {
  return value === null || value === "" ? "-" : String(value);
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

function nullableTrimmedString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
