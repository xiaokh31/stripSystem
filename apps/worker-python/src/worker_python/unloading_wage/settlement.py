from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from enum import StrEnum
from pathlib import Path
from typing import Any


UNLOADING_WAGE_ASSUMPTIONS = (
    "OCEAN_CONTAINER pays CAD 300 per physical container number.",
    "US_TO_CANADA_TRANSFER pays CAD 360 per trailer pay container, not per physical container number.",
    "Multiple unloaders split the pay container amount equally unless manual amount allocations are supplied.",
    "UNLOAD-WAGE-P0 is a batch prototype and does not persist audit records.",
)


class ContainerPayClassification(StrEnum):
    OCEAN_CONTAINER = "OCEAN_CONTAINER"
    US_TO_CANADA_TRANSFER = "US_TO_CANADA_TRANSFER"


@dataclass(frozen=True)
class UnloadingWageIssue:
    code: str
    message: str
    workItemId: str | None = None
    payContainerId: str | None = None
    field: str | None = None


@dataclass(frozen=True)
class RateSnapshot:
    classification: ContainerPayClassification
    currency: str
    amount: float
    amountCents: int
    effectiveDate: date | None


@dataclass(frozen=True)
class Unloader:
    workerId: str
    workerName: str


@dataclass(frozen=True)
class ManualAllocation:
    workerId: str
    amount: float
    amountCents: int


@dataclass(frozen=True)
class WorkItem:
    workItemId: str
    containerNumber: str
    classification: ContainerPayClassification
    trailerNumber: str | None
    completedAt: datetime | None
    completedBy: str | None
    unloaders: tuple[Unloader, ...]
    manualAllocations: tuple[ManualAllocation, ...]
    rawJson: dict[str, Any]


@dataclass(frozen=True)
class Allocation:
    workerId: str
    workerName: str
    amount: float
    amountCents: int


@dataclass(frozen=True)
class PayContainerSettlement:
    payContainerId: str
    classification: ContainerPayClassification
    trailerNumber: str | None
    containerNumbers: tuple[str, ...]
    sourceWorkItemIds: tuple[str, ...]
    completedAt: datetime
    completedBy: str | None
    currency: str
    rateAmount: float
    rateAmountCents: int
    allocationMethod: str
    allocations: tuple[Allocation, ...]


@dataclass(frozen=True)
class WorkerPayDetail:
    payContainerId: str
    classification: ContainerPayClassification
    trailerNumber: str | None
    containerNumbers: tuple[str, ...]
    amount: float
    amountCents: int


@dataclass(frozen=True)
class WorkerSettlement:
    workerId: str
    workerName: str
    payContainerCount: int
    totalAmount: float
    totalAmountCents: int
    details: tuple[WorkerPayDetail, ...]


@dataclass(frozen=True)
class UnloadingWageSettlementResult:
    settlementMonth: str
    currency: str
    sourceNote: str | None
    ratesSnapshot: tuple[RateSnapshot, ...]
    workItems: tuple[WorkItem, ...]
    payContainers: tuple[PayContainerSettlement, ...]
    workers: tuple[WorkerSettlement, ...]
    totalAmount: float
    totalAmountCents: int
    warnings: tuple[UnloadingWageIssue, ...]
    errors: tuple[UnloadingWageIssue, ...]
    assumptions: tuple[str, ...]


def load_unloading_wage_input(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as file:
        payload = json.load(file)
    if not isinstance(payload, dict):
        raise ValueError("Unloading wage input JSON must be an object.")
    return payload


def settle_unloading_wage_payload(payload: dict[str, Any]) -> UnloadingWageSettlementResult:
    warnings: list[UnloadingWageIssue] = []
    errors: list[UnloadingWageIssue] = []
    settlement_month = str(payload.get("settlement_month") or "").strip()
    currency = str(payload.get("currency") or "CAD").strip().upper() or "CAD"
    source_note = _optional_text(payload.get("source_note"))

    if not _valid_settlement_month(settlement_month):
        errors.append(
            UnloadingWageIssue(
                code="INVALID_SETTLEMENT_MONTH",
                message="settlement_month must use YYYY-MM format.",
                field="settlement_month",
            )
        )

    rates = _parse_rates(payload.get("rate_settings"), currency, errors)
    work_items = _parse_work_items(payload.get("work_items"), settlement_month, errors)
    valid_work_items = tuple(item for item in work_items if _work_item_is_payable(item, settlement_month))
    pay_containers = _build_pay_containers(valid_work_items, rates, settlement_month, errors, warnings)
    workers = _worker_settlements(pay_containers)
    total_cents = sum(container.rateAmountCents for container in pay_containers)

    return UnloadingWageSettlementResult(
        settlementMonth=settlement_month,
        currency=currency,
        sourceNote=source_note,
        ratesSnapshot=tuple(rates.values()),
        workItems=work_items,
        payContainers=pay_containers,
        workers=workers,
        totalAmount=_cents_to_amount(total_cents),
        totalAmountCents=total_cents,
        warnings=tuple(warnings),
        errors=tuple(errors),
        assumptions=UNLOADING_WAGE_ASSUMPTIONS,
    )


def _parse_rates(
    raw_rates: object,
    currency: str,
    errors: list[UnloadingWageIssue],
) -> dict[ContainerPayClassification, RateSnapshot]:
    rates: dict[ContainerPayClassification, RateSnapshot] = {}
    if not isinstance(raw_rates, dict):
        errors.append(
            UnloadingWageIssue(
                code="MISSING_RATE_SETTINGS",
                message="rate_settings object is required.",
                field="rate_settings",
            )
        )
        return rates

    for classification in ContainerPayClassification:
        raw_rate = raw_rates.get(classification.value)
        if not isinstance(raw_rate, dict):
            errors.append(
                UnloadingWageIssue(
                    code="MISSING_RATE_SETTING",
                    message=f"Rate setting is required for {classification.value}.",
                    field=f"rate_settings.{classification.value}",
                )
            )
            continue

        amount = raw_rate.get("amount")
        amount_cents = _money_to_cents(amount)
        if amount_cents is None or amount_cents <= 0:
            errors.append(
                UnloadingWageIssue(
                    code="INVALID_RATE_AMOUNT",
                    message=f"Rate amount must be positive for {classification.value}.",
                    field=f"rate_settings.{classification.value}.amount",
                )
            )
            continue

        rates[classification] = RateSnapshot(
            classification=classification,
            currency=currency,
            amount=_cents_to_amount(amount_cents),
            amountCents=amount_cents,
            effectiveDate=_parse_date(_optional_text(raw_rate.get("effective_date"))),
        )

    return rates


def _parse_work_items(
    raw_items: object,
    settlement_month: str,
    errors: list[UnloadingWageIssue],
) -> tuple[WorkItem, ...]:
    if not isinstance(raw_items, list):
        errors.append(
            UnloadingWageIssue(
                code="MISSING_WORK_ITEMS",
                message="work_items array is required.",
                field="work_items",
            )
        )
        return ()

    work_items: list[WorkItem] = []
    for index, raw_item in enumerate(raw_items, start=1):
        if not isinstance(raw_item, dict):
            errors.append(
                UnloadingWageIssue(
                    code="INVALID_WORK_ITEM",
                    message="Each work item must be an object.",
                    workItemId=f"INDEX-{index}",
                )
            )
            continue
        item = _parse_work_item(raw_item, index, settlement_month, errors)
        if item is not None:
            work_items.append(item)

    return tuple(work_items)


def _parse_work_item(
    raw_item: dict[str, Any],
    index: int,
    settlement_month: str,
    errors: list[UnloadingWageIssue],
) -> WorkItem | None:
    work_item_id = _required_text(raw_item.get("work_item_id")) or f"INDEX-{index}"
    container_number = _required_text(raw_item.get("container_number"))
    classification_text = _required_text(raw_item.get("classification"))
    trailer_number = _optional_text(raw_item.get("trailer_number"))
    completed_by = _optional_text(raw_item.get("completed_by"))
    completed_at = _parse_datetime(_optional_text(raw_item.get("completed_at")))

    if not container_number:
        errors.append(
            UnloadingWageIssue(
                code="MISSING_CONTAINER_NUMBER",
                message="container_number is required.",
                workItemId=work_item_id,
                field="container_number",
            )
        )
    classification = _parse_classification(classification_text)
    if classification is None:
        errors.append(
            UnloadingWageIssue(
                code="INVALID_PAY_CLASSIFICATION",
                message="classification must be OCEAN_CONTAINER or US_TO_CANADA_TRANSFER.",
                workItemId=work_item_id,
                field="classification",
            )
        )
        return None

    if classification == ContainerPayClassification.US_TO_CANADA_TRANSFER and not trailer_number:
        errors.append(
            UnloadingWageIssue(
                code="MISSING_TRAILER_NUMBER",
                message="US_TO_CANADA_TRANSFER work requires trailer_number.",
                workItemId=work_item_id,
                field="trailer_number",
            )
        )

    if completed_at is None:
        errors.append(
            UnloadingWageIssue(
                code="MISSING_COMPLETION",
                message="completed_at is required before work can enter settlement.",
                workItemId=work_item_id,
                field="completed_at",
            )
        )
    elif settlement_month and completed_at.strftime("%Y-%m") != settlement_month:
        errors.append(
            UnloadingWageIssue(
                code="COMPLETION_OUTSIDE_SETTLEMENT_MONTH",
                message="completed_at must be inside settlement_month.",
                workItemId=work_item_id,
                field="completed_at",
            )
        )

    if not completed_by:
        errors.append(
            UnloadingWageIssue(
                code="MISSING_COMPLETED_BY",
                message="completed_by is required before work can enter settlement.",
                workItemId=work_item_id,
                field="completed_by",
            )
        )

    unloaders = _parse_unloaders(raw_item.get("unloaders"), work_item_id, errors)
    manual_allocations = _parse_manual_allocations(
        raw_item.get("manual_allocations"),
        work_item_id,
        errors,
    )

    if not container_number or not completed_by or not unloaders:
        return None

    return WorkItem(
        workItemId=work_item_id,
        containerNumber=container_number,
        classification=classification,
        trailerNumber=trailer_number,
        completedAt=completed_at,
        completedBy=completed_by,
        unloaders=unloaders,
        manualAllocations=manual_allocations,
        rawJson=raw_item,
    )


def _parse_unloaders(
    raw_unloaders: object,
    work_item_id: str,
    errors: list[UnloadingWageIssue],
) -> tuple[Unloader, ...]:
    if not isinstance(raw_unloaders, list) or not raw_unloaders:
        errors.append(
            UnloadingWageIssue(
                code="MISSING_UNLOADER_ASSIGNMENT",
                message="At least one unloader assignment is required.",
                workItemId=work_item_id,
                field="unloaders",
            )
        )
        return ()

    unloaders: list[Unloader] = []
    seen: set[str] = set()
    for raw_unloader in raw_unloaders:
        if not isinstance(raw_unloader, dict):
            errors.append(
                UnloadingWageIssue(
                    code="INVALID_UNLOADER",
                    message="Each unloader assignment must be an object.",
                    workItemId=work_item_id,
                    field="unloaders",
                )
            )
            continue
        worker_id = _required_text(raw_unloader.get("worker_id"))
        if not worker_id:
            errors.append(
                UnloadingWageIssue(
                    code="MISSING_WORKER_ID",
                    message="unloaders.worker_id is required.",
                    workItemId=work_item_id,
                    field="unloaders.worker_id",
                )
            )
            continue
        worker_name = _required_text(raw_unloader.get("worker_name")) or worker_id
        if worker_id in seen:
            errors.append(
                UnloadingWageIssue(
                    code="DUPLICATE_UNLOADER",
                    message=f"Duplicate unloader assignment: {worker_id}.",
                    workItemId=work_item_id,
                    field="unloaders",
                )
            )
            continue
        seen.add(worker_id)
        unloaders.append(Unloader(workerId=worker_id, workerName=worker_name))

    return tuple(unloaders)


def _parse_manual_allocations(
    raw_allocations: object,
    work_item_id: str,
    errors: list[UnloadingWageIssue],
) -> tuple[ManualAllocation, ...]:
    if raw_allocations is None:
        return ()
    if not isinstance(raw_allocations, list):
        errors.append(
            UnloadingWageIssue(
                code="INVALID_MANUAL_ALLOCATIONS",
                message="manual_allocations must be an array when supplied.",
                workItemId=work_item_id,
                field="manual_allocations",
            )
        )
        return ()

    allocations: list[ManualAllocation] = []
    seen: set[str] = set()
    for raw_allocation in raw_allocations:
        if not isinstance(raw_allocation, dict):
            errors.append(
                UnloadingWageIssue(
                    code="INVALID_MANUAL_ALLOCATION",
                    message="Each manual allocation must be an object.",
                    workItemId=work_item_id,
                    field="manual_allocations",
                )
            )
            continue
        worker_id = _required_text(raw_allocation.get("worker_id"))
        amount_cents = _money_to_cents(raw_allocation.get("amount"))
        if not worker_id or amount_cents is None or amount_cents < 0:
            errors.append(
                UnloadingWageIssue(
                    code="INVALID_MANUAL_ALLOCATION",
                    message="manual allocation requires worker_id and amount.",
                    workItemId=work_item_id,
                    field="manual_allocations",
                )
            )
            continue
        if worker_id in seen:
            errors.append(
                UnloadingWageIssue(
                    code="DUPLICATE_MANUAL_ALLOCATION",
                    message=f"Duplicate manual allocation for worker: {worker_id}.",
                    workItemId=work_item_id,
                    field="manual_allocations",
                )
            )
            continue
        seen.add(worker_id)
        allocations.append(
            ManualAllocation(
                workerId=worker_id,
                amount=_cents_to_amount(amount_cents),
                amountCents=amount_cents,
            )
        )
    return tuple(allocations)


def _work_item_is_payable(item: WorkItem, settlement_month: str) -> bool:
    if item.completedAt is None:
        return False
    if settlement_month and item.completedAt.strftime("%Y-%m") != settlement_month:
        return False
    if item.classification == ContainerPayClassification.US_TO_CANADA_TRANSFER:
        return bool(item.trailerNumber)
    return True


def _build_pay_containers(
    work_items: tuple[WorkItem, ...],
    rates: dict[ContainerPayClassification, RateSnapshot],
    settlement_month: str,
    errors: list[UnloadingWageIssue],
    warnings: list[UnloadingWageIssue],
) -> tuple[PayContainerSettlement, ...]:
    del settlement_month
    grouped: dict[tuple[ContainerPayClassification, str], list[WorkItem]] = {}
    for item in work_items:
        group_key = _group_key(item)
        grouped.setdefault(group_key, []).append(item)

    settlements: list[PayContainerSettlement] = []
    for (classification, key), group_items in grouped.items():
        rate = rates.get(classification)
        pay_container_id = _pay_container_id(classification, key)
        if rate is None:
            errors.append(
                UnloadingWageIssue(
                    code="MISSING_RATE_FOR_PAY_CONTAINER",
                    message=f"Missing rate for {classification.value}.",
                    payContainerId=pay_container_id,
                    field="rate_settings",
                )
            )
            continue

        group_errors = _validate_group_consistency(group_items, pay_container_id)
        errors.extend(group_errors)
        if group_errors:
            continue

        first = group_items[0]
        allocation_result = _allocations_for_group(
            first,
            rate,
            pay_container_id,
            errors,
            warnings,
        )
        if allocation_result is None:
            continue

        settlements.append(
            PayContainerSettlement(
                payContainerId=pay_container_id,
                classification=classification,
                trailerNumber=first.trailerNumber,
                containerNumbers=tuple(item.containerNumber for item in group_items),
                sourceWorkItemIds=tuple(item.workItemId for item in group_items),
                completedAt=first.completedAt or datetime.min,
                completedBy=first.completedBy,
                currency=rate.currency,
                rateAmount=rate.amount,
                rateAmountCents=rate.amountCents,
                allocationMethod=allocation_result[0],
                allocations=allocation_result[1],
            )
        )

    return tuple(sorted(settlements, key=lambda item: item.payContainerId))


def _validate_group_consistency(
    group_items: list[WorkItem],
    pay_container_id: str,
) -> tuple[UnloadingWageIssue, ...]:
    first = group_items[0]
    errors: list[UnloadingWageIssue] = []
    first_unloaders = _unloader_signature(first.unloaders)
    first_manual = _manual_allocation_signature(first.manualAllocations)

    for item in group_items[1:]:
        if item.completedAt != first.completedAt:
            errors.append(
                UnloadingWageIssue(
                    code="INCONSISTENT_TRAILER_COMPLETION",
                    message="Grouped pay container work items must share completed_at.",
                    workItemId=item.workItemId,
                    payContainerId=pay_container_id,
                    field="completed_at",
                )
            )
        if _unloader_signature(item.unloaders) != first_unloaders:
            errors.append(
                UnloadingWageIssue(
                    code="INCONSISTENT_TRAILER_UNLOADERS",
                    message="Grouped pay container work items must share unloader assignments.",
                    workItemId=item.workItemId,
                    payContainerId=pay_container_id,
                    field="unloaders",
                )
            )
        if _manual_allocation_signature(item.manualAllocations) != first_manual:
            errors.append(
                UnloadingWageIssue(
                    code="INCONSISTENT_TRAILER_MANUAL_ALLOCATIONS",
                    message="Grouped pay container work items must share manual allocations.",
                    workItemId=item.workItemId,
                    payContainerId=pay_container_id,
                    field="manual_allocations",
                )
            )

    return tuple(errors)


def _allocations_for_group(
    item: WorkItem,
    rate: RateSnapshot,
    pay_container_id: str,
    errors: list[UnloadingWageIssue],
    warnings: list[UnloadingWageIssue],
) -> tuple[str, tuple[Allocation, ...]] | None:
    if item.manualAllocations:
        allocation = _manual_allocations_for_group(item, rate, pay_container_id, errors)
        if allocation is not None:
            warnings.append(
                UnloadingWageIssue(
                    code="MANUAL_ALLOCATION_REQUIRES_AUDIT_IN_P1",
                    message="Manual allocation is applied in P0 output; persistence audit is deferred to P1.",
                    workItemId=item.workItemId,
                    payContainerId=pay_container_id,
                    field="manual_allocations",
                )
            )
        return allocation
    return "EQUAL_SPLIT", _equal_allocations(item.unloaders, rate.amountCents)


def _manual_allocations_for_group(
    item: WorkItem,
    rate: RateSnapshot,
    pay_container_id: str,
    errors: list[UnloadingWageIssue],
) -> tuple[str, tuple[Allocation, ...]] | None:
    unloaders_by_id = {unloader.workerId: unloader for unloader in item.unloaders}
    allocation_worker_ids = {allocation.workerId for allocation in item.manualAllocations}
    unloader_ids = set(unloaders_by_id)

    if allocation_worker_ids != unloader_ids:
        errors.append(
            UnloadingWageIssue(
                code="MANUAL_ALLOCATION_WORKER_MISMATCH",
                message="Manual allocation workers must match assigned unloaders.",
                workItemId=item.workItemId,
                payContainerId=pay_container_id,
                field="manual_allocations",
            )
        )
        return None

    allocated_cents = sum(allocation.amountCents for allocation in item.manualAllocations)
    if allocated_cents != rate.amountCents:
        errors.append(
            UnloadingWageIssue(
                code="MANUAL_ALLOCATION_TOTAL_MISMATCH",
                message="Manual allocation total must equal pay container rate.",
                workItemId=item.workItemId,
                payContainerId=pay_container_id,
                field="manual_allocations",
            )
        )
        return None

    allocations = tuple(
        Allocation(
            workerId=allocation.workerId,
            workerName=unloaders_by_id[allocation.workerId].workerName,
            amount=allocation.amount,
            amountCents=allocation.amountCents,
        )
        for allocation in item.manualAllocations
    )
    return "MANUAL_AMOUNT", allocations


def _equal_allocations(
    unloaders: tuple[Unloader, ...],
    amount_cents: int,
) -> tuple[Allocation, ...]:
    base_amount = amount_cents // len(unloaders)
    remainder = amount_cents % len(unloaders)
    allocations: list[Allocation] = []

    for index, unloader in enumerate(unloaders):
        allocation_cents = base_amount + (1 if index < remainder else 0)
        allocations.append(
            Allocation(
                workerId=unloader.workerId,
                workerName=unloader.workerName,
                amount=_cents_to_amount(allocation_cents),
                amountCents=allocation_cents,
            )
        )

    return tuple(allocations)


def _worker_settlements(
    pay_containers: tuple[PayContainerSettlement, ...],
) -> tuple[WorkerSettlement, ...]:
    details_by_worker: dict[tuple[str, str], list[WorkerPayDetail]] = {}
    for pay_container in pay_containers:
        for allocation in pay_container.allocations:
            key = (allocation.workerId, allocation.workerName)
            details_by_worker.setdefault(key, []).append(
                WorkerPayDetail(
                    payContainerId=pay_container.payContainerId,
                    classification=pay_container.classification,
                    trailerNumber=pay_container.trailerNumber,
                    containerNumbers=pay_container.containerNumbers,
                    amount=allocation.amount,
                    amountCents=allocation.amountCents,
                )
            )

    workers: list[WorkerSettlement] = []
    for (worker_id, worker_name), details in details_by_worker.items():
        total_cents = sum(detail.amountCents for detail in details)
        workers.append(
            WorkerSettlement(
                workerId=worker_id,
                workerName=worker_name,
                payContainerCount=len(details),
                totalAmount=_cents_to_amount(total_cents),
                totalAmountCents=total_cents,
                details=tuple(sorted(details, key=lambda item: item.payContainerId)),
            )
        )

    return tuple(sorted(workers, key=lambda item: item.workerId))


def _group_key(item: WorkItem) -> tuple[ContainerPayClassification, str]:
    if item.classification == ContainerPayClassification.US_TO_CANADA_TRANSFER:
        return item.classification, item.trailerNumber or ""
    return item.classification, item.containerNumber


def _pay_container_id(classification: ContainerPayClassification, key: str) -> str:
    safe_key = re.sub(r"[^A-Za-z0-9._-]+", "-", key).strip("-")
    if classification == ContainerPayClassification.US_TO_CANADA_TRANSFER:
        return f"PC-TRAILER-{safe_key}"
    return f"PC-OCEAN-{safe_key}"


def _unloader_signature(unloaders: tuple[Unloader, ...]) -> tuple[tuple[str, str], ...]:
    return tuple((unloader.workerId, unloader.workerName) for unloader in unloaders)


def _manual_allocation_signature(
    allocations: tuple[ManualAllocation, ...],
) -> tuple[tuple[str, int], ...]:
    return tuple((allocation.workerId, allocation.amountCents) for allocation in allocations)


def _parse_classification(value: str | None) -> ContainerPayClassification | None:
    if not value:
        return None
    try:
        return ContainerPayClassification(value)
    except ValueError:
        return None


def _parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _valid_settlement_month(value: str) -> bool:
    return bool(re.fullmatch(r"\d{4}-\d{2}", value))


def _required_text(value: object) -> str | None:
    text = _optional_text(value)
    return text or None


def _optional_text(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _money_to_cents(value: object) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if not isinstance(value, int | float | str):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return int(round(number * 100))


def _cents_to_amount(cents: int) -> float:
    return round(cents / 100, 2)
