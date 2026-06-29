import type { CreateLoadJobRequest } from "@/lib/api-client";

export interface LoadJobLineDraft {
  containerNo: string;
  destinationCode: string;
  externalTransfer: boolean;
  note: string;
  plannedPallets: string;
  sourceText: string;
}

export interface LoadJobDraft {
  carrier: string;
  destinationRegion: string;
  dockNo: string;
  lines: LoadJobLineDraft[];
  loadNo: string;
  scheduledDepartureAt: string;
  truckNo: string;
}

export type LoadJobRequestResult =
  | {
      ok: true;
      payload: CreateLoadJobRequest;
    }
  | {
      error: string;
      ok: false;
    };

export function emptyLoadJobLineDraft(
  externalTransfer = false,
  destinationCode = "",
): LoadJobLineDraft {
  return {
    containerNo: "",
    destinationCode,
    externalTransfer,
    note: "",
    plannedPallets: "",
    sourceText: "",
  };
}

export function defaultLoadJobDraft(): LoadJobDraft {
  return {
    carrier: "",
    destinationRegion: "",
    dockNo: "",
    lines: [emptyLoadJobLineDraft()],
    loadNo: "",
    scheduledDepartureAt: "",
    truckNo: "",
  };
}

export function buildLoadJobRequest(draft: LoadJobDraft): LoadJobRequestResult {
  const loadNo = draft.loadNo.trim();
  const destinationRegion = nullableString(draft.destinationRegion);
  if (!loadNo) {
    return { error: "Load number is required.", ok: false };
  }

  if (draft.lines.length === 0) {
    return { error: "At least one plan line is required.", ok: false };
  }

  const lines = [];
  for (const [index, line] of draft.lines.entries()) {
    const label = `Plan line ${index + 1}`;
    const sourceText = nullableString(line.sourceText);
    const containerNo = nullableString(line.containerNo);
    const explicitDestinationCode = nullableString(line.destinationCode);
    if (
      destinationRegion &&
      explicitDestinationCode &&
      explicitDestinationCode !== destinationRegion
    ) {
      return {
        error: `${label} destination must match Destination region ${destinationRegion}.`,
        ok: false,
      };
    }
    const destinationCode = explicitDestinationCode ?? destinationRegion;
    const note = nullableString(line.note);

    if (!sourceText && !containerNo) {
      return {
        error: `${label} requires source text or container number.`,
        ok: false,
      };
    }

    const plannedPallets = parseOptionalWholeNumber(
      line.plannedPallets,
      `${label} planned pallets`,
    );
    if (!plannedPallets.ok) {
      return plannedPallets;
    }

    if (
      plannedPallets.value === undefined &&
      !sourceTextHasPalletCount(sourceText)
    ) {
      return {
        error: `${label} requires planned pallets or source text ending with a pallet count such as -5P.`,
        ok: false,
      };
    }

    if (
      !line.externalTransfer &&
      plannedPallets.value !== undefined &&
      plannedPallets.value <= 0
    ) {
      return {
        error: `${label} system pallets must be greater than 0.`,
        ok: false,
      };
    }

    lines.push({
      ...(containerNo ? { containerNo } : {}),
      ...(destinationCode ? { destinationCode } : {}),
      externalTransfer: line.externalTransfer,
      ...(note ? { note } : {}),
      ...(plannedPallets.value === undefined
        ? {}
        : { plannedPallets: plannedPallets.value }),
      ...(sourceText ? { sourceText } : {}),
    });
  }

  const scheduledDepartureAt = dateTimeLocalToIso(draft.scheduledDepartureAt);
  if (scheduledDepartureAt instanceof Error) {
    return {
      error: "Scheduled departure time is invalid.",
      ok: false,
    };
  }

  return {
    ok: true,
    payload: {
      ...(nullableString(draft.carrier)
        ? { carrier: draft.carrier.trim() }
        : {}),
      ...(destinationRegion ? { destinationRegion } : {}),
      ...(nullableString(draft.dockNo) ? { dockNo: draft.dockNo.trim() } : {}),
      lines,
      loadNo,
      ...(scheduledDepartureAt ? { scheduledDepartureAt } : {}),
      ...(nullableString(draft.truckNo)
        ? { truckNo: draft.truckNo.trim() }
        : {}),
    },
  };
}

export function loadJobPlanSummary(draft: LoadJobDraft): {
  externalPallets: number;
  internalPallets: number;
  lineCount: number;
} {
  return draft.lines.reduce(
    (summary, line) => {
      const parsed = Number(line.plannedPallets.trim());
      const pallets = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;

      return {
        externalPallets:
          summary.externalPallets + (line.externalTransfer ? pallets : 0),
        internalPallets:
          summary.internalPallets + (line.externalTransfer ? 0 : pallets),
        lineCount: summary.lineCount + 1,
      };
    },
    { externalPallets: 0, internalPallets: 0, lineCount: 0 },
  );
}

function parseOptionalWholeNumber(
  value: string,
  label: string,
): { ok: true; value?: number } | { error: string; ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true };
  }

  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return {
      error: `${label} must be a whole number of 0 or greater.`,
      ok: false,
    };
  }

  return { ok: true, value: parsed };
}

function sourceTextHasPalletCount(sourceText: string | null): boolean {
  return Boolean(
    sourceText?.match(/[-\s]\d+\s*P(?:\s*[-_ ]?\s*part\s*\d+)?\s*$/i),
  );
}

function dateTimeLocalToIso(value: string): string | null | Error {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return new Error("Invalid date");
  }

  return date.toISOString();
}

function nullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
