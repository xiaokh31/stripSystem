from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    ValidationError,
    field_validator,
    model_validator,
)


MAPPING_SCHEMA_VERSION: Literal["parser-profile-mapping-v1"] = (
    "parser-profile-mapping-v1"
)
INSPECTION_CONTRACT_VERSION: Literal["workbook-inspection-v1"] = (
    "workbook-inspection-v1"
)
FINGERPRINT_ALGORITHM_VERSION: Literal["workbook-fingerprint-v1"] = (
    "workbook-fingerprint-v1"
)
PROFILE_PARSER_VERSION: Literal["parser-profile-engine-v1"] = "parser-profile-engine-v1"

CANONICAL_ROW_FIELDS = frozenset(
    {
        "waybillNo",
        "fbaNo",
        "poNumber",
        "itemNo",
        "description",
        "cartons",
        "weight",
        "volumeCbm",
        "destinationCode",
        "packageType",
        "deliveryMethod",
        "note",
        "totalSkidCount",
    }
)
CANONICAL_METADATA_FIELDS = frozenset(
    {"company", "poNumber", "customer", "clearOrderNo"}
)
JsonPrimitive = str | int | float | bool | None


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, populate_by_name=True)


class ContractIssue(ContractModel):
    code: str
    path: str | None = None
    row: int | None = None
    field: str | None = None
    rawValue: Any = None
    params: dict[str, Any] = Field(default_factory=dict)


class ProfileDefinitionError(ValueError):
    def __init__(self, issues: tuple[ContractIssue, ...]):
        self.issues = issues
        super().__init__(",".join(issue.code for issue in issues))


class WorkbookInspectionError(ValueError):
    def __init__(self, issues: tuple[ContractIssue, ...]):
        self.issues = issues
        super().__init__(",".join(issue.code for issue in issues))


class InspectionLimits(ContractModel):
    maxSheets: int = Field(default=20, ge=1, le=100)
    maxRowsPerSheet: int = Field(default=500, ge=1, le=10_000)
    maxColumnsPerSheet: int = Field(default=100, ge=1, le=1_000)
    maxCells: int = Field(default=20_000, ge=1, le=200_000)
    maxSampleCellsPerSheet: int = Field(default=500, ge=1, le=5_000)
    maxHeaderCandidatesPerSheet: int = Field(default=20, ge=1, le=100)
    maxMergedRangesPerSheet: int = Field(default=5_000, ge=1, le=20_000)
    maxArchiveEntries: int = Field(default=2_000, ge=10, le=20_000)
    maxArchiveEntryBytes: int = Field(default=20_000_000, ge=1_024, le=100_000_000)
    maxArchiveTotalBytes: int = Field(default=100_000_000, ge=10_240, le=500_000_000)


class BoundedDimensions(ContractModel):
    maxRow: int
    maxColumn: int
    scannedRows: int
    scannedColumns: int


class InspectedCell(ContractModel):
    row: int
    column: int
    cell: str
    value: Any
    valueType: str
    isFormula: bool = False
    hasCachedValue: bool | None = None
    cachedValue: Any = None
    cachedValueType: str | None = None


class HeaderCandidate(ContractModel):
    row: int
    rowCount: int
    nonEmptyCells: int
    cells: tuple[InspectedCell, ...]


class DataRangeCandidate(ContractModel):
    startRow: int
    endRow: int
    nonEmptyRows: int


class SheetInspection(ContractModel):
    index: int
    name: str
    visibility: str
    boundedDimensions: BoundedDimensions
    mergedRanges: tuple[str, ...]
    sampleCells: tuple[InspectedCell, ...]
    candidateHeaderAreas: tuple[HeaderCandidate, ...]
    candidateDataRanges: tuple[DataRangeCandidate, ...]


class WorkbookInspection(ContractModel):
    contractVersion: Literal["workbook-inspection-v1"] = INSPECTION_CONTRACT_VERSION
    workbookType: Literal["OOXML_XLSX", "OOXML_XLSM"]
    inputSha256: str
    sheets: tuple[SheetInspection, ...]
    limits: InspectionLimits
    issues: tuple[ContractIssue, ...]


class SheetSelector(ContractModel):
    name: str | None = None
    index: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def exactly_one_identity(self) -> SheetSelector:
        if (self.name is None) == (self.index is None):
            raise ValueError("sheet identity")
        return self


class HeaderSelector(ContractModel):
    row: int = Field(ge=1)
    rowCount: int = Field(default=1, ge=1, le=3)


class DataRangeSelector(ContractModel):
    startRow: int = Field(ge=1)
    maxRows: int = Field(default=500, ge=1, le=10_000)
    endRow: int | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def ordered_range(self) -> DataRangeSelector:
        if self.endRow is not None and self.endRow < self.startRow:
            raise ValueError("data range order")
        return self


class ColumnSource(ContractModel):
    kind: Literal["column"]
    header: str = Field(min_length=1, max_length=256)


class CellSource(ContractModel):
    kind: Literal["cell"]
    cell: str

    @field_validator("cell")
    @classmethod
    def valid_cell(cls, value: str) -> str:
        if not re.fullmatch(r"[A-Z]{1,3}[1-9]\d{0,6}", value.upper()):
            raise ValueError("invalid cell")
        return value.upper()


class ConstantSource(ContractModel):
    kind: Literal["constant"]
    value: JsonPrimitive = None


SourceSelector = Annotated[
    ColumnSource | CellSource | ConstantSource, Field(discriminator="kind")
]


class TrimOperation(ContractModel):
    op: Literal["trim"]


class CaseOperation(ContractModel):
    op: Literal["case"]
    mode: Literal["upper", "lower"]


class BlankOperation(ContractModel):
    op: Literal["blank"]
    values: tuple[JsonPrimitive, ...] = Field(default=("",), max_length=50)


class ParseDecimalOperation(ContractModel):
    op: Literal["parse_decimal"]
    groupSeparator: str = Field(default=",", max_length=1)
    decimalSeparator: str = Field(default=".", min_length=1, max_length=1)

    @model_validator(mode="after")
    def distinct_separators(self) -> ParseDecimalOperation:
        if self.groupSeparator and self.groupSeparator == self.decimalSeparator:
            raise ValueError("numeric separators conflict")
        return self


class ParseIntegerOperation(ContractModel):
    op: Literal["parse_integer"]
    groupSeparator: str = Field(default=",", max_length=1)
    decimalSeparator: str = Field(default=".", min_length=1, max_length=1)

    @model_validator(mode="after")
    def distinct_separators(self) -> ParseIntegerOperation:
        if self.groupSeparator and self.groupSeparator == self.decimalSeparator:
            raise ValueError("numeric separators conflict")
        return self


class CoalesceOperation(ContractModel):
    op: Literal["coalesce"]


class LookupOperation(ContractModel):
    op: Literal["lookup"]
    dictionary: dict[str, JsonPrimitive] = Field(min_length=1, max_length=500)
    caseSensitive: bool = True


class ConcatenateOperation(ContractModel):
    op: Literal["concatenate"]
    separator: str = Field(default="", max_length=50)


class RegexExtractOperation(ContractModel):
    op: Literal["regex_extract"]
    pattern: str = Field(min_length=1, max_length=256)
    group: int = Field(default=0, ge=0, le=20)

    @field_validator("pattern")
    @classmethod
    def bounded_regex(cls, value: str) -> str:
        quantified_group = re.search(
            r"\([^)]*(?:[+*?]|\{\d+(?:,\d*)?\})[^)]*\)"
            r"(?:[+*?]|\{\d+(?:,\d*)?\})",
            value,
        )
        excessive_repeat = any(
            int(bound) > 1_000
            for repeat in re.findall(r"\{(\d+)(?:,(\d*))?\}", value)
            for bound in repeat
            if bound
        )
        variable_atoms = list(
            re.finditer(
                r"(?:\\.|\[[^]]*\]|[^\\])(?:[+*?]|\{\d+,\d*\})",
                value,
            )
        )
        adjacent_variable_quantifiers = any(
            left.end() == right.start()
            for left, right in zip(variable_atoms, variable_atoms[1:])
        )
        if (
            quantified_group
            or re.search(r"\([^)]*\|[^)]*\)[+*{]", value)
            or re.search(r"(\.\*|\.\+).*(\.\*|\.\+)", value)
            or re.search(r"\\[1-9]", value)
            or excessive_repeat
            or adjacent_variable_quantifiers
            or "(?=" in value
            or "(?!" in value
            or "(?<=" in value
            or "(?<!" in value
            or "(?R" in value
            or "(?0" in value
        ):
            raise ValueError("unsafe regex")
        try:
            re.compile(value)
        except re.error as exc:
            raise ValueError("invalid regex") from exc
        return value


class MultiplyOperation(ContractModel):
    op: Literal["multiply"]
    factor: Decimal


class DivideOperation(ContractModel):
    op: Literal["divide"]
    divisor: Decimal

    @field_validator("divisor")
    @classmethod
    def nonzero(cls, value: Decimal) -> Decimal:
        if value == 0:
            raise ValueError("zero divisor")
        return value


class UnitConversionOperation(ContractModel):
    op: Literal["unit_conversion"]
    fromUnit: Literal["CBM", "CUBIC_FEET", "CUBIC_INCHES", "CUBIC_METRES"]
    toUnit: Literal["CBM"]


TransformOperation = Annotated[
    TrimOperation
    | CaseOperation
    | BlankOperation
    | ParseDecimalOperation
    | ParseIntegerOperation
    | CoalesceOperation
    | LookupOperation
    | ConcatenateOperation
    | RegexExtractOperation
    | MultiplyOperation
    | DivideOperation
    | UnitConversionOperation,
    Field(discriminator="op"),
]


class FieldMapping(ContractModel):
    scope: Literal["row", "workbook"] = "row"
    sources: tuple[SourceSelector, ...] = Field(min_length=1, max_length=8)
    transforms: tuple[TransformOperation, ...] = Field(default=(), max_length=16)


class SkipBlankPredicate(ContractModel):
    op: Literal["skip_blank"]
    headers: tuple[str, ...] = Field(min_length=1, max_length=50)


class SkipSummaryPredicate(ContractModel):
    op: Literal["skip_summary"]
    whenBlank: tuple[str, ...] = Field(min_length=1, max_length=50)
    whenPresent: tuple[str, ...] = Field(min_length=1, max_length=50)


class ConditionalPredicateBase(ContractModel):
    source: SourceSelector
    operator: Literal["equals", "not_equals", "contains", "in", "regex", "is_blank"]
    value: JsonPrimitive = None
    values: tuple[JsonPrimitive, ...] = Field(default=(), max_length=100)
    pattern: str | None = Field(default=None, max_length=256)

    @model_validator(mode="after")
    def valid_operator_arguments(self) -> ConditionalPredicateBase:
        if self.operator == "regex":
            if not self.pattern:
                raise ValueError("regex pattern missing")
            RegexExtractOperation(op="regex_extract", pattern=self.pattern)
        if self.operator == "in" and not self.values:
            raise ValueError("in values missing")
        return self


class IncludePredicate(ConditionalPredicateBase):
    op: Literal["include"]


class ExcludePredicate(ConditionalPredicateBase):
    op: Literal["exclude"]


class StopPredicate(ConditionalPredicateBase):
    op: Literal["stop"]


RowPredicate = Annotated[
    SkipBlankPredicate
    | SkipSummaryPredicate
    | IncludePredicate
    | ExcludePredicate
    | StopPredicate,
    Field(discriminator="op"),
]


class MappingDefinition(ContractModel):
    schemaVersion: Literal["parser-profile-mapping-v1"]
    profileVersion: str = Field(min_length=1, max_length=128)
    formatType: Literal["UNLOADING_PLAN_CN", "BESTAR_RECEIVING"]
    sheet: SheetSelector
    header: HeaderSelector
    dataRange: DataRangeSelector
    container: FieldMapping | None = None
    metadataFields: dict[str, FieldMapping] = Field(default_factory=dict, max_length=10)
    fields: dict[str, FieldMapping] = Field(min_length=1, max_length=30)
    rowPredicates: tuple[RowPredicate, ...] = Field(default=(), max_length=30)
    groupBy: tuple[str, ...] = Field(
        default=("destinationCode", "packageType"), max_length=5
    )

    @model_validator(mode="after")
    def container_must_come_from_workbook(self) -> MappingDefinition:
        if self.container is not None and any(
            isinstance(source, ConstantSource) for source in self.container.sources
        ):
            raise ValueError("container constant forbidden")
        if any(
            mapping.scope != "workbook"
            or any(isinstance(source, ColumnSource) for source in mapping.sources)
            for mapping in self.metadataFields.values()
        ):
            raise ValueError("metadata field source invalid")
        return self

    @field_validator("fields")
    @classmethod
    def canonical_fields_only(
        cls, value: dict[str, FieldMapping]
    ) -> dict[str, FieldMapping]:
        unknown = sorted(set(value) - CANONICAL_ROW_FIELDS)
        if unknown:
            raise ValueError(f"unknown canonical fields: {','.join(unknown)}")
        return value

    @field_validator("metadataFields")
    @classmethod
    def canonical_metadata_fields_only(
        cls, value: dict[str, FieldMapping]
    ) -> dict[str, FieldMapping]:
        unknown = sorted(set(value) - CANONICAL_METADATA_FIELDS)
        if unknown:
            raise ValueError(f"unknown canonical fields: {','.join(unknown)}")
        return value

    @field_validator("groupBy")
    @classmethod
    def valid_group_fields(cls, value: tuple[str, ...]) -> tuple[str, ...]:
        if any(field not in CANONICAL_ROW_FIELDS for field in value):
            raise ValueError("unknown group field")
        return value

    @classmethod
    def validate_definition(cls, payload: Any) -> MappingDefinition:
        try:
            return cls.model_validate(payload)
        except ValidationError as exc:
            issues = tuple(
                _definition_issue(error) for error in exc.errors(include_url=False)
            )
            raise ProfileDefinitionError(issues) from exc


class FingerprintAnchor(ContractModel):
    value: str = Field(min_length=1, max_length=256)
    required: bool = True
    row: int = Field(ge=1)
    column: int = Field(ge=1)
    rowTolerance: int = Field(default=0, ge=0, le=20)
    columnTolerance: int = Field(default=0, ge=0, le=20)


class RelativeColumn(ContractModel):
    anchor: str = Field(min_length=1, max_length=256)
    header: str = Field(min_length=1, max_length=256)
    offset: int = Field(ge=-1_000, le=1_000)
    expectedValueTypes: tuple[Literal["string", "number", "date", "boolean"], ...] = (
        Field(default=(), max_length=4)
    )
    requireCachedFormula: bool = False


class DataStartMarker(ContractModel):
    rowOffsetFromHeader: int = Field(default=1, ge=0, le=100)


class DataStopMarker(ContractModel):
    header: str = Field(min_length=1, max_length=256)
    value: str = Field(min_length=1, max_length=256)


class FingerprintDefinition(ContractModel):
    profileId: str = Field(min_length=1, max_length=128)
    algorithmVersion: Literal["workbook-fingerprint-v1"]
    workbookType: Literal["OOXML_XLSX", "OOXML_XLSM"]
    sheet: SheetSelector
    anchors: tuple[FingerprintAnchor, ...] = Field(min_length=1, max_length=50)
    requiredRelativeColumns: tuple[RelativeColumn, ...] = Field(
        default=(), max_length=50
    )
    dataStart: DataStartMarker = Field(default_factory=DataStartMarker)
    dataStop: DataStopMarker | None = None

    @classmethod
    def validate_definition(cls, payload: Any) -> FingerprintDefinition:
        try:
            return cls.model_validate(payload)
        except ValidationError as exc:
            issues = tuple(
                _fingerprint_definition_issue(error)
                for error in exc.errors(include_url=False)
            )
            raise ProfileDefinitionError(issues) from exc


class FingerprintReason(ContractModel):
    code: str
    matched: bool
    params: dict[str, Any] = Field(default_factory=dict)


class StructuralFingerprint(ContractModel):
    profileId: str
    algorithmVersion: Literal["workbook-fingerprint-v1"]
    hash: str
    matched: bool
    reasons: tuple[FingerprintReason, ...]
    structuralEvidence: dict[str, Any]


class RankedMatches(ContractModel):
    candidates: tuple[StructuralFingerprint, ...]
    selectedProfileId: str | None
    issueCode: str | None


class SourceReference(ContractModel):
    sheet: str
    row: int | None
    column: int | None
    cell: str | None
    rawValue: Any = None


class FieldProvenance(ContractModel):
    field: str
    sourceRefs: tuple[SourceReference, ...]
    transformChain: tuple[str, ...]


class ProfileParsedLine(ContractModel):
    rowNumber: int
    waybillNo: str | None = None
    fbaNo: str | None = None
    poNumber: str | None = None
    itemNo: str | None = None
    description: str | None = None
    cartons: int | None = None
    weight: float | None = None
    volumeCbm: float | None = None
    destinationCode: str | None = None
    packageType: str | None = None
    deliveryMethod: str | None = None
    note: str | None = None
    totalSkidCount: int | None = None
    raw_json: dict[str, Any]
    provenance: dict[str, FieldProvenance]


class ProfileDestinationSummary(ContractModel):
    destinationCode: str | None
    packageType: str | None = None
    totalCartons: int
    totalVolumeCbm: float
    totalSkidCount: int | None = None
    lineCount: int
    status: str | None = None


class ProfileParseResult(ContractModel):
    containerNo: str | None
    company: str | None = None
    poNumber: str | None = None
    customer: str | None = None
    clearOrderNo: str | None = None
    formatType: Literal["UNLOADING_PLAN_CN", "BESTAR_RECEIVING"]
    confidence: float
    parserVersion: Literal["parser-profile-engine-v1"] = PROFILE_PARSER_VERSION
    lines: tuple[ProfileParsedLine, ...]
    destinationSummaries: tuple[ProfileDestinationSummary, ...]
    warnings: tuple[ContractIssue, ...]
    errors: tuple[ContractIssue, ...]
    rawMetadata: dict[str, Any]
    provenance: dict[str, FieldProvenance]


class SuggestionEvidence(ContractModel):
    sheet: str
    row: int
    column: int
    cell: str
    rawHeader: str
    normalizedHeader: str


class MappingSuggestion(ContractModel):
    canonicalField: str
    source: ColumnSource
    certainty: float
    approved: Literal[False] = False
    reasonCode: Literal["HEADER_ALIAS_MATCH"] = "HEADER_ALIAS_MATCH"
    evidence: SuggestionEvidence


def json_value(value: Any) -> Any:
    if isinstance(value, datetime | date):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, bytes):
        return value.hex()
    return value


def mapping_definition_json_schema() -> dict[str, Any]:
    return MappingDefinition.model_json_schema()


def workbook_inspection_json_schema() -> dict[str, Any]:
    return WorkbookInspection.model_json_schema()


def fingerprint_definition_json_schema() -> dict[str, Any]:
    return FingerprintDefinition.model_json_schema()


def profile_parse_result_json_schema() -> dict[str, Any]:
    return ProfileParseResult.model_json_schema()


def _definition_issue(error: Any) -> ContractIssue:
    location = list(error.get("loc", ()))
    location = [
        part
        for index, part in enumerate(location)
        if index == 0 or part != location[index - 1]
    ]
    path = ".".join(str(part) for part in location)
    error_type = str(error.get("type", ""))
    message = str(error.get("msg", ""))
    raw_value = error.get("input")

    if error_type == "extra_forbidden":
        code = "MAPPING_DEFINITION_UNKNOWN_FIELD"
    elif error_type == "union_tag_invalid":
        code = "MAPPING_OPERATION_UNKNOWN"
        path = f"{path}.op" if path else "op"
    elif path.endswith(".cell") and "invalid cell" in message:
        code = "MAPPING_SOURCE_CELL_INVALID"
    elif "unsafe regex" in message:
        code = "MAPPING_REGEX_UNSAFE"
    elif "invalid regex" in message:
        code = "MAPPING_REGEX_INVALID"
    elif "zero divisor" in message:
        code = "MAPPING_DIVISOR_ZERO"
    elif "unknown canonical fields" in message or "unknown group field" in message:
        code = "MAPPING_CANONICAL_FIELD_UNKNOWN"
    elif "container constant forbidden" in message:
        code = "MAPPING_CONTAINER_CONSTANT_FORBIDDEN"
    elif "sheet identity" in message:
        code = "MAPPING_SHEET_SELECTOR_INVALID"
    else:
        code = "MAPPING_DEFINITION_INVALID"

    return ContractIssue(code=code, path=path or None, rawValue=raw_value)


def _fingerprint_definition_issue(error: Any) -> ContractIssue:
    location = list(error.get("loc", ()))
    path = ".".join(str(part) for part in location)
    error_type = str(error.get("type", ""))
    message = str(error.get("msg", ""))
    if error_type == "extra_forbidden":
        code = "FINGERPRINT_DEFINITION_UNKNOWN_FIELD"
    elif "sheet identity" in message:
        code = "FINGERPRINT_SHEET_SELECTOR_INVALID"
    elif path == "algorithmVersion":
        code = "FINGERPRINT_VERSION_UNSUPPORTED"
    else:
        code = "FINGERPRINT_DEFINITION_INVALID"
    return ContractIssue(
        code=code,
        path=path or None,
        rawValue=error.get("input"),
    )
