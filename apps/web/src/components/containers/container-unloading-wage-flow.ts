import type {
  CompleteContainerUnloadingRequest,
  ContainerDetailResponse,
  ContainerPayClassification,
  SaveContainerUnloadingWageRequest,
  UpdateContainerUnloadersRequest,
  UpdateContainerUnloadingWageAssociationsRequest,
} from "@/lib/api-client";

export interface ContainerUnloadingWageDraft {
  associatedContainerNosText: string;
  classification: ContainerPayClassification;
  note: string;
  reason: string;
  trailerNumber: string;
}

export interface ContainerUnloaderDraft {
  initialWorkerName: string;
  note: string;
  unloadingWorkerId: string | null;
  workerCode: string;
  workerName: string;
  workerUserId: string | null;
}

export interface ContainerUnloadingCompletionDraft {
  completedAt: string;
  note: string;
  reason: string;
}

export type ContainerUnloadingWageSaveRequest =
  | {
      kind: "ocean";
      payload: SaveContainerUnloadingWageRequest;
    }
  | {
      kind: "transfer";
      payload: UpdateContainerUnloadingWageAssociationsRequest;
    };

export type BuildResult<TPayload> =
  | { ok: true; payload: TPayload }
  | { error: string; ok: false };

export function wageDraftFromContainer(
  container: ContainerDetailResponse,
): ContainerUnloadingWageDraft {
  const wage = container.unloadingWage;
  const classification = containerPayClassification(
    wage?.classification ?? container.payClassification,
  );

  return {
    associatedContainerNosText:
      wage?.associatedContainers
        .filter((item) => item.containerNo !== container.containerNo)
        .map((item) => item.containerNo)
        .join("\n") ?? "",
    classification,
    note: "",
    reason: "Container detail unloading wage updated",
    trailerNumber: wage?.trailerNumber ?? container.payTrailerNumber ?? "",
  };
}

export function unloaderDraftsFromContainer(
  container: ContainerDetailResponse,
): ContainerUnloaderDraft[] {
  const unloaders = container.unloadingWage?.unloaders ?? [];
  if (unloaders.length === 0) {
    return [emptyContainerUnloaderDraft()];
  }

  return unloaders.map((unloader) => ({
    initialWorkerName: unloader.workerName,
    note: unloader.note ?? "",
    unloadingWorkerId: unloader.unloadingWorkerId,
    workerCode: unloader.workerCode,
    workerName: unloader.workerName,
    workerUserId: unloader.workerUserId,
  }));
}

export function completionDraftFromContainer(
  container: ContainerDetailResponse,
  now = new Date(),
): ContainerUnloadingCompletionDraft {
  return {
    completedAt: datetimeLocalInput(container.unloadingWage?.completedAt, now),
    note: container.unloadingWage?.completionNote ?? "",
    reason: "Container detail unloading marked completed",
  };
}

export function emptyContainerUnloaderDraft(): ContainerUnloaderDraft {
  return {
    initialWorkerName: "",
    note: "",
    unloadingWorkerId: null,
    workerCode: "",
    workerName: "",
    workerUserId: null,
  };
}

export function buildContainerUnloadingWageSaveRequest(
  containerNo: string,
  draft: ContainerUnloadingWageDraft,
): BuildResult<ContainerUnloadingWageSaveRequest> {
  const note = nullableTrimmedString(draft.note);
  const reason = nullableTrimmedString(draft.reason);

  if (draft.classification === "OCEAN_CONTAINER") {
    return {
      ok: true,
      payload: {
        kind: "ocean",
        payload: {
          classification: "OCEAN_CONTAINER",
          note,
          reason,
          trailerNumber: null,
        },
      },
    };
  }

  const trailerNumber = nullableTrimmedString(draft.trailerNumber);
  if (!trailerNumber) {
    return {
      error: "US-to-Canada transfer requires a trailer number.",
      ok: false,
    };
  }

  return {
    ok: true,
    payload: {
      kind: "transfer",
      payload: {
        associatedContainerNos: parseAssociatedContainerNos(
          draft.associatedContainerNosText,
          containerNo,
        ),
        note,
        reason,
        trailerNumber,
      },
    },
  };
}

export function buildContainerUnloadersRequest(
  drafts: ContainerUnloaderDraft[],
  reason: string,
): BuildResult<UpdateContainerUnloadersRequest> {
  const unloaders = drafts
    .map((draft) => ({
      note: nullableTrimmedString(draft.note),
      unloadingWorkerId: nullableTrimmedString(draft.unloadingWorkerId),
      workerName: draft.workerName.trim(),
      workerUserId: nullableTrimmedString(draft.workerUserId),
    }))
    .filter(
      (draft) =>
        draft.workerName ||
        draft.note ||
        draft.unloadingWorkerId ||
        draft.workerUserId,
    );

  if (unloaders.length === 0) {
    return { error: "Add at least one unloader.", ok: false };
  }

  const seenWorkerIds = new Set<string>();
  for (const unloader of unloaders) {
    if (!unloader.unloadingWorkerId) {
      if (unloader.workerName) {
        return {
          error: `Legacy unloader "${unloader.workerName}" must be reselected from the temporary unloader directory before saving.`,
          ok: false,
        };
      }
      return {
        error: "Each unloader row requires a selected temporary worker.",
        ok: false,
      };
    }

    if (seenWorkerIds.has(unloader.unloadingWorkerId)) {
      return {
        error: `Duplicate unloader: ${
          unloader.workerName || unloader.unloadingWorkerId
        }.`,
        ok: false,
      };
    }
    seenWorkerIds.add(unloader.unloadingWorkerId);
  }

  return {
    ok: true,
    payload: {
      reason: nullableTrimmedString(reason),
      unloaders: unloaders.map((unloader) => ({
        note: unloader.note,
        unloadingWorkerId: unloader.unloadingWorkerId,
      })),
    },
  };
}

export function buildContainerUnloadingCompletionRequest(
  draft: ContainerUnloadingCompletionDraft,
): BuildResult<CompleteContainerUnloadingRequest> {
  const completedAt = draft.completedAt.trim();
  if (!completedAt) {
    return { error: "Completed date and time are required.", ok: false };
  }

  const completedDate = new Date(completedAt);
  if (Number.isNaN(completedDate.getTime())) {
    return { error: "Completed date and time must be valid.", ok: false };
  }

  return {
    ok: true,
    payload: {
      completedAt: completedDate.toISOString(),
      note: nullableTrimmedString(draft.note),
      reason: nullableTrimmedString(draft.reason),
    },
  };
}

export function classificationLabel(
  classification: ContainerPayClassification | null,
): string {
  if (classification === "US_TO_CANADA_TRANSFER") {
    return "美转加";
  }
  if (classification === "OCEAN_CONTAINER") {
    return "海柜";
  }
  return "未选择";
}

export function rateRuleLabel(
  classification: ContainerPayClassification,
): string {
  return classification === "US_TO_CANADA_TRANSFER"
    ? "CAD 360 / transfer group"
    : "CAD 300 / container";
}

export function completionStatusLabel(status: string | null): string {
  if (status === "COMPLETED") {
    return "已拆完，可进入月结";
  }
  if (status === "SETTLED") {
    return "已结算";
  }
  if (status === "NEEDS_REVIEW") {
    return "已拆完，需复核后进入月结";
  }
  return "未拆完，不会进入月结";
}

export function parseAssociatedContainerNos(
  value: string,
  currentContainerNo: string,
): string[] {
  const current = normalizeContainerNo(currentContainerNo);
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of value.split(/[\s,+]+/)) {
    const containerNo = normalizeContainerNo(item);
    if (!containerNo || containerNo === current || seen.has(containerNo)) {
      continue;
    }
    seen.add(containerNo);
    result.push(containerNo);
  }

  return result;
}

function containerPayClassification(
  value: string | null | undefined,
): ContainerPayClassification {
  return value === "US_TO_CANADA_TRANSFER"
    ? "US_TO_CANADA_TRANSFER"
    : "OCEAN_CONTAINER";
}

function datetimeLocalInput(value: string | null | undefined, fallback: Date) {
  const date = value ? new Date(value) : fallback;
  const safeDate = Number.isNaN(date.getTime()) ? fallback : date;
  const local = new Date(
    safeDate.getTime() - safeDate.getTimezoneOffset() * 60000,
  );
  return local.toISOString().slice(0, 16);
}

function nullableTrimmedString(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

function normalizeContainerNo(value: string): string {
  return value.trim().toUpperCase();
}
