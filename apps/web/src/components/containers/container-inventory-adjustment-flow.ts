import {
  INVENTORY_ADJUSTMENT_REASON_CODES,
  type CreateInventoryAdjustmentRequest,
  type InventoryAdjustmentReasonCode,
} from "../../lib/api-client";
import { DEFAULT_LOCALE, type Locale } from "../../lib/i18n/catalog";
import {
  inventoryAdjustmentErrorLabel,
  inventoryAdjustmentReasonLabel,
} from "../../lib/i18n/status-labels";
import { translateMessage } from "../../lib/i18n/translator";

export type InventoryAdjustmentReasonDraft =
  | InventoryAdjustmentReasonCode
  | "";

export interface ManualInventoryDepletionDraft {
  confirmed: boolean;
  count: string;
  note: string;
  reasonCode: InventoryAdjustmentReasonDraft;
}

export const INVENTORY_ADJUSTMENT_ERROR_CODES = [
  "INVENTORY_ADJUSTMENT_COUNT_EXCEEDS_REMAINING",
  "INVENTORY_ADJUSTMENT_NO_ELIGIBLE_PALLETS",
  "INVENTORY_ADJUSTMENT_PALLET_NOT_ELIGIBLE",
  "INVENTORY_ADJUSTMENT_PERMISSION_DENIED",
  "INVENTORY_ADJUSTMENT_REASON_REQUIRED",
  "INVENTORY_ADJUSTMENT_TARGET_REQUIRED",
] as const;

const inventoryAdjustmentErrorCodeSet = new Set<string>(
  INVENTORY_ADJUSTMENT_ERROR_CODES,
);

export function emptyManualInventoryDepletionDraft(): ManualInventoryDepletionDraft {
  return {
    confirmed: false,
    count: "1",
    note: "",
    reasonCode: "",
  };
}

export function inventoryAdjustmentReasonOptions(locale?: Locale) {
  return INVENTORY_ADJUSTMENT_REASON_CODES.map((reasonCode) => ({
    label: inventoryAdjustmentReasonLabel(reasonCode, locale),
    value: reasonCode,
  }));
}

export function buildManualInventoryDepletionRequest(
  draft: ManualInventoryDepletionDraft,
  remainingPallets: number,
):
  | { ok: true; payload: CreateInventoryAdjustmentRequest }
  | { ok: false; error: string } {
  const count = Number(draft.count);
  if (
    !Number.isSafeInteger(count) ||
    count < 1 ||
    count > remainingPallets
  ) {
    return {
      error: "Enter a whole number from 1 to the current remaining inventory.",
      ok: false,
    };
  }

  if (!draft.reasonCode) {
    return {
      error: "Select a reason for manual inventory depletion.",
      ok: false,
    };
  }

  const note = draft.note.trim();
  if (draft.reasonCode === "OTHER" && !note) {
    return {
      error: "A note is required when Other is selected.",
      ok: false,
    };
  }

  return {
    ok: true,
    payload: {
      count,
      ...(note ? { note } : {}),
      reasonCode: draft.reasonCode,
    },
  };
}

export function manualInventoryAdjustmentErrorMessage(
  errorCode: string | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (errorCode && inventoryAdjustmentErrorCodeSet.has(errorCode)) {
    return inventoryAdjustmentErrorLabel(errorCode, locale);
  }

  const source =
    "Manual inventory depletion could not be saved. Refresh the destination inventory and try again.";
  return translateMessage(source, locale) ?? source;
}
