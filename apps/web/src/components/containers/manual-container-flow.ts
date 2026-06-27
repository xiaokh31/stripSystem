import type { CreateManualContainerRequest } from "@/lib/api-client";

export interface ManualDestinationDraft {
  cartons: string;
  destinationCode: string;
  destinationType: string;
  note: string;
  pallets: string;
  volume: string;
}

export interface ManualContainerDraft {
  company: string;
  containerNo: string;
  correctionNote: string;
  destinations: ManualDestinationDraft[];
  dockNo: string;
  reason: string;
}

export type ManualContainerRequestResult =
  | {
      ok: true;
      payload: CreateManualContainerRequest;
    }
  | {
      error: string;
      ok: false;
    };

export function emptyManualDestinationDraft(): ManualDestinationDraft {
  return {
    cartons: "",
    destinationCode: "",
    destinationType: "",
    note: "",
    pallets: "",
    volume: "",
  };
}

export function defaultManualContainerDraft(
  sourceImportId?: string | null,
): ManualContainerDraft {
  return {
    company: "",
    containerNo: "",
    correctionNote: sourceImportId
      ? `Manual entry created from import ${sourceImportId}.`
      : "Manual entry created by office.",
    destinations: [emptyManualDestinationDraft()],
    dockNo: "",
    reason: sourceImportId
      ? `Original import ${sourceImportId} could not be parsed.`
      : "Original customer workbook could not be parsed.",
  };
}

export function buildManualContainerRequest(
  draft: ManualContainerDraft,
): ManualContainerRequestResult {
  const containerNo = draft.containerNo.trim();
  if (!containerNo) {
    return { error: "Container number is required.", ok: false };
  }

  if (draft.destinations.length === 0) {
    return {
      error: "At least one destination row is required.",
      ok: false,
    };
  }

  const destinations = [];
  for (const [index, destination] of draft.destinations.entries()) {
    const destinationCode = destination.destinationCode.trim();
    if (!destinationCode) {
      return {
        error: `Destination ${index + 1} requires a destination code.`,
        ok: false,
      };
    }

    const cartons = parseWholeNumber(
      destination.cartons,
      `Destination ${index + 1} cartons`,
    );
    if (!cartons.ok) {
      return cartons;
    }

    const pallets = parseWholeNumber(
      destination.pallets,
      `Destination ${index + 1} pallets`,
    );
    if (!pallets.ok) {
      return pallets;
    }

    const volume = parseOptionalDecimal(
      destination.volume,
      `Destination ${index + 1} volume`,
    );
    if (!volume.ok) {
      return volume;
    }

    destinations.push({
      cartons: cartons.value,
      destinationCode,
      destinationType: nullableString(destination.destinationType),
      note: nullableString(destination.note),
      pallets: pallets.value,
      ...(volume.value === undefined ? {} : { volume: volume.value }),
    });
  }

  return {
    ok: true,
    payload: {
      company: nullableString(draft.company),
      containerNo,
      correctionNote: nullableString(draft.correctionNote),
      destinations,
      dockNo: nullableString(draft.dockNo),
      reason: nullableString(draft.reason),
    },
  };
}

function parseWholeNumber(
  value: string,
  label: string,
): { ok: true; value: number } | { error: string; ok: false } {
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!trimmed || !Number.isInteger(parsed) || parsed < 0) {
    return {
      error: `${label} must be a whole number of 0 or greater.`,
      ok: false,
    };
  }

  return { ok: true, value: parsed };
}

function parseOptionalDecimal(
  value: string,
  label: string,
): { ok: true; value?: number } | { error: string; ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      error: `${label} must be a number of 0 or greater.`,
      ok: false,
    };
  }

  return { ok: true, value: parsed };
}

function nullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}
