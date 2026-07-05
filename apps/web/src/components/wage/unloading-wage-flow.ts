import type {
  CompleteUnloadingRequest,
  ContainerPayClassification,
  CreatePayContainerRequest,
  PayAllocationMethod,
  UnloadingWageSettlementResponse,
} from "@/lib/api-client";

export interface CreatePayContainerDraft {
  classification: ContainerPayClassification;
  containerIdsText: string;
  rateAmount: string;
  reason: string;
  trailerNumber: string;
}

export interface UnloaderDraft {
  allocationAmount: string;
  allocationPercent: string;
  note: string;
  workerCode: string;
  workerName: string;
}

export interface CompletePayContainerDraft {
  allocationMethod: PayAllocationMethod;
  completedAt: string;
  note: string;
  reason: string;
  unloaders: UnloaderDraft[];
}

export type BuildResult<TPayload> =
  | { ok: true; payload: TPayload }
  | { error: string; ok: false };

export function selectSettlementForMonth(
  settlements: UnloadingWageSettlementResponse[],
  settlementMonth: string,
  requestedSettlementId: string | null,
): UnloadingWageSettlementResponse | null {
  const monthSettlements = settlements.filter(
    (settlement) => settlement.settlementMonth === settlementMonth,
  );
  const requested = requestedSettlementId
    ? monthSettlements.find((settlement) => settlement.id === requestedSettlementId)
    : null;
  if (requested) {
    return requested;
  }

  return (
    monthSettlements.find((settlement) => isSettlementStatus(settlement, "GENERATED")) ??
    monthSettlements.find((settlement) =>
      isSettlementStatus(settlement, "NEEDS_REVIEW"),
    ) ??
    monthSettlements.find(
      (settlement) => !isSettlementStatus(settlement, "SUPERSEDED"),
    ) ??
    monthSettlements[0] ??
    null
  );
}

export function settlementsForMonth(
  settlements: UnloadingWageSettlementResponse[],
  settlementMonth: string,
): UnloadingWageSettlementResponse[] {
  return settlements.filter(
    (settlement) => settlement.settlementMonth === settlementMonth,
  );
}

export function settlementReviewAlerts(
  settlements: UnloadingWageSettlementResponse[],
  settlementMonth: string,
): string[] {
  const monthSettlements = settlementsForMonth(settlements, settlementMonth);
  const needsReviewCount = monthSettlements.filter((settlement) =>
    isSettlementStatus(settlement, "NEEDS_REVIEW"),
  ).length;
  const supersededCount = monthSettlements.filter((settlement) =>
    isSettlementStatus(settlement, "SUPERSEDED"),
  ).length;
  const alerts: string[] = [];

  if (needsReviewCount > 0) {
    alerts.push(
      `${needsReviewCount} settlement version(s) for ${settlementMonth} need review because source unloading wage data changed after generation.`,
    );
  }
  if (supersededCount > 0) {
    alerts.push(
      `${supersededCount} older settlement version(s) for ${settlementMonth} were superseded by regeneration.`,
    );
  }

  return alerts;
}

export function settlementLineContainerNumbers(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.map((item) => String(item)).filter(Boolean);
  }
  if (typeof input === "string") {
    return input
      .split(/[,+\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function isSettlementStatus(
  settlement: UnloadingWageSettlementResponse,
  status: string,
): boolean {
  return settlement.status.toUpperCase() === status;
}

export function parseContainerIds(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function buildCreatePayContainerRequest(
  draft: CreatePayContainerDraft,
): BuildResult<CreatePayContainerRequest> {
  const containerIds = parseContainerIds(draft.containerIdsText);
  if (containerIds.length === 0) {
    return { error: "Enter at least one container id.", ok: false };
  }

  if (draft.classification === "OCEAN_CONTAINER" && containerIds.length !== 1) {
    return {
      error: "Ocean container pay units require exactly one container id.",
      ok: false,
    };
  }

  const trailerNumber = nullableString(draft.trailerNumber);
  if (draft.classification === "US_TO_CANADA_TRANSFER" && !trailerNumber) {
    return {
      error: "US-to-Canada transfer pay units require a trailer number.",
      ok: false,
    };
  }

  const rateAmount = nullableNumber(draft.rateAmount, "Rate amount");
  if (!rateAmount.ok) {
    return rateAmount;
  }

  return {
    ok: true,
    payload: {
      classification: draft.classification,
      containerIds,
      ...(rateAmount.value === null ? {} : { rateAmount: rateAmount.value }),
      reason: nullableString(draft.reason),
      trailerNumber:
        draft.classification === "US_TO_CANADA_TRANSFER" ? trailerNumber : null,
    },
  };
}

export function buildCompletePayContainerRequest(
  draft: CompletePayContainerDraft,
): BuildResult<CompleteUnloadingRequest> {
  const completedAt = draft.completedAt.trim();
  if (!completedAt) {
    return { error: "Completed date and time are required.", ok: false };
  }

  const completedDate = new Date(completedAt);
  if (Number.isNaN(completedDate.getTime())) {
    return { error: "Completed date and time must be valid.", ok: false };
  }

  const unloaders = draft.unloaders
    .map((unloader) => ({
      allocationAmount: nullableNumberValue(unloader.allocationAmount),
      allocationPercent: nullableNumberValue(unloader.allocationPercent),
      note: nullableString(unloader.note),
      workerCode: unloader.workerCode.trim(),
      workerName: unloader.workerName.trim(),
    }))
    .filter((unloader) => unloader.workerCode || unloader.workerName);

  if (unloaders.length === 0) {
    return { error: "Add at least one unloader.", ok: false };
  }

  for (const unloader of unloaders) {
    if (!unloader.workerCode || !unloader.workerName) {
      return {
        error: "Each unloader requires both worker code and worker name.",
        ok: false,
      };
    }
    if (
      (unloader.allocationAmount !== null &&
        (!Number.isFinite(unloader.allocationAmount) ||
          unloader.allocationAmount < 0)) ||
      (unloader.allocationPercent !== null &&
        (!Number.isFinite(unloader.allocationPercent) ||
          unloader.allocationPercent < 0))
    ) {
      return {
        error: "Allocation amount and percent must be 0 or greater.",
        ok: false,
      };
    }
    if (
      (draft.allocationMethod === "MANUAL_AMOUNT" &&
        unloader.allocationAmount === null) ||
      (draft.allocationMethod === "MANUAL_PERCENT" &&
        unloader.allocationPercent === null)
    ) {
      return {
        error:
          draft.allocationMethod === "MANUAL_AMOUNT"
            ? "Manual amount allocation requires every amount."
            : "Manual percent allocation requires every percent.",
        ok: false,
      };
    }
  }

  return {
    ok: true,
    payload: {
      allocationMethod: draft.allocationMethod,
      completedAt: completedDate.toISOString(),
      note: nullableString(draft.note),
      reason: nullableString(draft.reason),
      unloaders,
    },
  };
}

export function defaultCompletedAtInput(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function emptyUnloaderDraft(): UnloaderDraft {
  return {
    allocationAmount: "",
    allocationPercent: "",
    note: "",
    workerCode: "",
    workerName: "",
  };
}

function nullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function nullableNumber(
  value: string,
  label: string,
): { ok: true; value: number | null } | { error: string; ok: false } {
  const trimmed = value.trim();
  if (!trimmed) {
    return { ok: true, value: null };
  }

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { error: `${label} must be greater than 0.`, ok: false };
  }

  return { ok: true, value: parsed };
}

function nullableNumberValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}
