import { getBrowserAuthToken } from "./auth-token";

export interface ApiErrorResponse {
  code: string;
  message: string;
  details?: unknown;
  timestamp?: string;
  path?: string;
}

export interface ApiHealthResponse {
  status: "ok" | "degraded";
  version: string;
  database: {
    status: "up" | "down";
    message?: string;
  };
  queue?: QueueHealthResponse;
  timestamp: string;
}

export type AsyncJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface AsyncJobResponse {
  id: string;
  jobType: string;
  status: AsyncJobStatus;
  queueName: string;
  bullJobId: string | null;
  targetType: string;
  targetId: string;
  idempotencyKey: string;
  importFileId: string | null;
  containerId: string | null;
  attendanceImportId: string | null;
  generatedFileId: string | null;
  wageGeneratedFileId: string | null;
  actorUserId: string | null;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  result: unknown;
  metadata: unknown;
  queuedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QueueHealthResponse {
  status: "up" | "down" | "disabled";
  queueName: string;
  redisUrl: string | null;
  waiting?: number;
  active?: number;
  delayed?: number;
  failed?: number;
  error?: {
    code: "QUEUE_UNAVAILABLE" | "QUEUE_DISABLED";
    message: string;
  };
}

export interface AuthUserResponse {
  id: string;
  email: string | null;
  name: string | null;
  roles: string[];
  permissions: string[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: "Bearer";
  user: AuthUserResponse;
}

export interface UserRoleResponse {
  id: string;
  code: string;
  displayName: string;
  permissions: string[];
}

export interface UserResponse {
  id: string;
  email: string | null;
  name: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  roles: UserRoleResponse[];
  permissions: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserListResponse {
  items: UserResponse[];
}

export interface UserMutationResponse {
  user: UserResponse;
  audit: {
    actorUserId: string;
    action: string;
    targetUserId: string;
  };
}

export interface CreateUserRequest {
  email: string;
  name?: string | null;
  password: string;
  roleCodes?: string[];
  roleIds?: string[];
}

export interface UpdateUserRequest {
  email?: string;
  name?: string | null;
}

export interface ResetPasswordRequest {
  password: string;
}

export interface UpdateUserRolesRequest {
  roleCodes?: string[];
  roleIds?: string[];
}

export interface UpdateUserStatusRequest {
  isActive: boolean;
}

export interface PermissionResponse {
  id: string;
  code: string;
  category: string | null;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RoleResponse {
  id: string;
  code: string;
  displayName: string;
  description: string | null;
  isSystem: boolean;
  isActive: boolean;
  permissions: PermissionResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface RoleListResponse {
  items: RoleResponse[];
}

export interface PermissionListResponse {
  items: PermissionResponse[];
}

export interface RoleMutationResponse {
  role: RoleResponse;
  audit: {
    actorUserId: string;
    action: string;
    targetRoleId: string;
  };
}

export interface UpdateRolePermissionsRequest {
  permissionCodes?: string[];
  permissionIds?: string[];
}

export type OperationalSettingInputType =
  | "number"
  | "select"
  | "text"
  | "textarea";

export interface OperationalSettingOptionResponse {
  label: string;
  value: string;
}

export interface OperationalSettingFieldResponse {
  key: string;
  category: string;
  label: string;
  description: string;
  inputType: OperationalSettingInputType;
  value: string;
  defaultValue: string;
  editable: boolean;
  options?: OperationalSettingOptionResponse[];
  min?: number;
  max?: number;
  updatedAt: string | null;
  updatedById: string | null;
}

export interface OperationalSettingsResponse {
  fields: OperationalSettingFieldResponse[];
  updatedAt: string | null;
}

export interface UpdateOperationalSettingsRequest {
  values: Record<string, string>;
}

export interface OperationalSettingsMutationResponse {
  settings: OperationalSettingsResponse;
  audit: {
    actorUserId: string;
    action: "settings.update";
    changedKeys: string[];
  };
}

export interface AttendanceImportResponse {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  mimeType: string | null;
  fileSizeBytes: string | null;
  importStatus: string;
  parseStatus: string;
  parserVersion: string | null;
  settlementMonth: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  employeeCount: number;
  dayCount: number;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceImportListResponse {
  items: AttendanceImportResponse[];
  limit: number;
  offset: number;
}

export interface AttendanceImportListFilters {
  limit?: number;
  offset?: number;
}

export interface AttendanceRowResponse {
  id: string;
  rowKey: string;
  employeeId: string | null;
  employeeName: string | null;
  department: string | null;
  workDate: string;
  dayNumber: number;
  punchTimes: unknown;
  pairedGrossHours: string | null;
  lunchHours: string;
  calculatedHours: string | null;
  firstPunch: string | null;
  lastPunch: string | null;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
}

export interface WageGeneratedFileResponse {
  id: string;
  attendanceImportId: string | null;
  unloadingWageSettlementId: string | null;
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  mimeType: string | null;
  fileSizeBytes: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceParseResultResponse {
  attendanceImport: AttendanceImportResponse;
  rows: AttendanceRowResponse[];
  warnings: unknown[];
  errors: unknown[];
}

export interface WageGeneratedFileListResponse {
  items: WageGeneratedFileResponse[];
}

export interface GenerateWageRecordResponse {
  generatedFile: WageGeneratedFileResponse;
  taskReport: WageGeneratedFileResponse | null;
  warnings: unknown[];
  errors: unknown[];
}

export type ContainerPayClassification =
  | "OCEAN_CONTAINER"
  | "US_TO_CANADA_TRANSFER";

export type PayAllocationMethod =
  | "EQUAL_SPLIT"
  | "MANUAL_AMOUNT"
  | "MANUAL_PERCENT";

export interface UpdateContainerPayClassificationRequest {
  classification: ContainerPayClassification;
  note?: string | null;
  reason?: string | null;
  trailerNumber?: string | null;
}

export interface ContainerPayClassificationMutationResponse {
  container: {
    id: string;
    containerNo: string;
    payClassification: string | null;
    payTrailerNumber: string | null;
  };
}

export interface UnloadingWageWorkerResponse {
  id: string;
  displayName: string;
  workerCode: string;
  isActive: boolean;
  phone: string | null;
  note: string | null;
  createdById: string | null;
  updatedById: string | null;
  createdAt: string;
  updatedAt: string;
  email: string | null;
  roles: string[];
}

export interface UnloadingWageWorkerListResponse {
  items: UnloadingWageWorkerResponse[];
}

export interface CreateUnloadingWageWorkerRequest {
  displayName: string;
  workerCode?: string | null;
  phone?: string | null;
  note?: string | null;
  isActive?: boolean;
}

export interface ContainerUnloadingWageAssociatedContainerResponse {
  id: string;
  containerId: string;
  containerNo: string;
}

export interface ContainerUnloadingWageUnloaderResponse {
  id: string;
  unloadingWorkerId: string | null;
  workerUserId: string | null;
  workerCode: string;
  workerName: string;
  note: string | null;
}

export interface ContainerDetailUnloadingWageResponse {
  payContainerId: string;
  payContainerNo: string;
  classification: ContainerPayClassification;
  trailerNumber: string | null;
  status: string;
  currency: string;
  rateAmount: string;
  completedAt: string | null;
  completedById: string | null;
  completionNote: string | null;
  associatedContainers: ContainerUnloadingWageAssociatedContainerResponse[];
  unloaders: ContainerUnloadingWageUnloaderResponse[];
}

export interface ContainerUnloadingWageResponse {
  associatedContainers: ContainerUnloadingWageAssociatedContainerResponse[];
  completedAt: string | null;
  completedById: string | null;
  completionNote: string | null;
  containerId: string;
  containerNo: string;
  classification: ContainerPayClassification | null;
  currency: string | null;
  payContainerId: string | null;
  payContainerNo: string | null;
  rateAmount: string | null;
  status: string | null;
  trailerNumber: string | null;
  unloaders: ContainerUnloadingWageUnloaderResponse[];
}

export interface SaveContainerUnloadingWageRequest {
  classification: ContainerPayClassification;
  note?: string | null;
  reason?: string | null;
  trailerNumber?: string | null;
}

export interface UpdateContainerUnloadingWageAssociationsRequest {
  associatedContainerIds?: string[];
  associatedContainerNos?: string[];
  note?: string | null;
  reason?: string | null;
  trailerNumber?: string | null;
}

export interface CompleteContainerUnloadingRequest {
  completedAt: string;
  note?: string | null;
  reason?: string | null;
}

export interface UpdateContainerUnloaderRequest {
  note?: string | null;
  unloadingWorkerId?: string | null;
  workerCode?: string | null;
  workerName?: string | null;
  workerUserId?: string | null;
}

export interface UpdateContainerUnloadersRequest {
  note?: string | null;
  reason?: string | null;
  unloaders: UpdateContainerUnloaderRequest[];
}

export interface CreatePayContainerRequest {
  classification: ContainerPayClassification;
  containerIds: string[];
  rateAmount?: number;
  reason?: string | null;
  trailerNumber?: string | null;
}

export interface CompleteUnloadingUnloaderRequest {
  allocationAmount?: number | null;
  allocationPercent?: number | null;
  note?: string | null;
  workerCode: string;
  workerName: string;
  workerUserId?: string | null;
}

export interface CompleteUnloadingRequest {
  allocationMethod: PayAllocationMethod;
  completedAt: string;
  note?: string | null;
  reason?: string | null;
  unloaders: CompleteUnloadingUnloaderRequest[];
}

export interface PayContainerResponse {
  id: string;
  payContainerNo: string;
  classification: string;
  trailerNumber: string | null;
  status: string;
  currency: string;
  rateAmount: string;
  allocationMethod: string;
  completedAt: string | null;
  completedById: string | null;
  completionNote: string | null;
  containers: Array<{
    id: string;
    containerId: string;
    containerNo: string;
  }>;
  unloaders: Array<{
    id: string;
    unloadingWorkerId: string | null;
    workerUserId: string | null;
    workerCode: string;
    workerName: string;
    allocationAmount: string | null;
    allocationPercent: string | null;
    note: string | null;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface PayContainerListFilters {
  limit?: number;
  offset?: number;
  settlementMonth?: string;
  status?: string;
}

export interface PayContainerListResponse {
  items: PayContainerResponse[];
  limit: number;
  offset: number;
}

export interface GenerateUnloadingWageSettlementRequest {
  settlementMonth: string;
}

export interface UnloadingWageSettlementResponse {
  id: string;
  settlementMonth: string;
  currency: string;
  status: string;
  totalAmount: string;
  warningCount: number;
  errorCount: number;
  workers: Array<{
    id: string;
    workerCode: string;
    workerName: string;
    payContainerCount: number;
    totalAmount: string;
  }>;
  lines: Array<{
    id: string;
    workerCode: string;
    workerName: string;
    payContainerNo: string;
    classification: string;
    trailerNumber: string | null;
    containerNumbers: unknown;
    completedAt: string;
    rateAmount: string;
    allocationMethod: string;
    amount: string;
  }>;
  generatedFiles: Array<{
    id: string;
    fileType: string;
    storagePath: string;
    fileSha256: string | null;
    status: string;
  }>;
  warnings: unknown[];
  errors: unknown[];
  createdAt: string;
  updatedAt: string;
}

export interface UnloadingWageSettlementListResponse {
  items: UnloadingWageSettlementResponse[];
}

export interface UnloadingSummaryGeneratedFileResponse extends GeneratedFileResponse {
  downloadUrl: string;
}

export interface UnloadingSummaryRowResponse {
  sequence: number;
  containerId: string;
  containerNo: string;
  status: string;
  payContainerId: string | null;
  payContainerNo: string | null;
  classification: string | null;
  businessTag: string;
  trailerNumber: string | null;
  completedAt: string;
  dateBusinessTag: string;
  destinationId: string | null;
  destinationText: string;
  destinationCode: string | null;
  destinationType: string | null;
  cartons: number;
  finalPallets: number;
  quantityText: string;
  referenceText: string | null;
  appointmentText: string | null;
  splitOrVarianceText: string | null;
  operationNote: string | null;
  rawJson: unknown;
}

export interface UnloadingSummaryReviewItemResponse {
  code: string;
  message: string;
  containerId?: string | null;
  containerNo?: string | null;
  status?: string | null;
  payContainerId?: string | null;
  payContainerNo?: string | null;
  field?: string | null;
}

export interface UnloadingSummaryResponse {
  month: string;
  sourceContainerCount: number;
  rowCount: number;
  rows: UnloadingSummaryRowResponse[];
  reviewItems: UnloadingSummaryReviewItemResponse[];
  generatedFiles: UnloadingSummaryGeneratedFileResponse[];
}

export interface ExportUnloadingSummaryRequest {
  month: string;
}

export interface ExportUnloadingSummaryResponse extends UnloadingSummaryResponse {
  generatedFile: UnloadingSummaryGeneratedFileResponse;
  exportWarnings: unknown[];
  exportErrors: unknown[];
}

export interface ImportFileResponse {
  id: string;
  originalFilename: string;
  storedPath: string;
  fileSha256: string;
  mimeType: string | null;
  fileSizeBytes: string | null;
  format: string;
  importStatus: string;
  parseStatus: string;
  parserVersion: string | null;
  warningCount: number;
  errorCount: number;
  errorMessage: string | null;
  deletedAt: string | null;
  deletedById: string | null;
  deleteReason: string | null;
  containers: ImportFileContainerSummaryResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportFileContainerSummaryResponse {
  id: string;
  containerNo: string;
  status: string;
}

export interface ImportFileListResponse {
  items: ImportFileResponse[];
  limit: number;
  offset: number;
}

export interface ImportListFilters {
  limit?: number;
  offset?: number;
}

export interface DeleteImportRequest {
  reason?: string;
}

export interface ContainerLineResponse {
  id: string;
  lineNo: number;
  destinationCode: string | null;
  destinationType: string | null;
  cartons: number | null;
  volume: string | null;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
}

export interface ContainerDestinationResponse {
  id: string;
  destinationCode: string;
  destinationType: string | null;
  packageType: string | null;
  cartons: number;
  volume: string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  palletRuleCode: string | null;
  calculationBasisCbm: string | null;
  roundingMode: string | null;
  note: string | null;
  warnings: unknown;
  errors: unknown;
}

export interface ContainerResponse {
  id: string;
  importFileId: string | null;
  containerNo: string;
  sourceFormat: string;
  parserVersion: string | null;
  status: string;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
  lines: ContainerLineResponse[];
  destinations: ContainerDestinationResponse[];
}

export interface ImportParseResultResponse {
  importFile: ImportFileResponse;
  containers: ContainerResponse[];
  warnings: unknown[];
  errors: unknown[];
}

export interface ContainerDetailDestinationResponse {
  id: string;
  containerId: string;
  destinationCode: string;
  destinationType: string | null;
  packageType: string | null;
  totalCartons: number;
  totalVolumeCbm: string;
  calculatedPallets: number;
  manualPallets: number | null;
  finalPallets: number;
  palletRuleCode: string | null;
  calculationBasisCbm: string | null;
  roundingMode: string | null;
  note: string | null;
  warnings: unknown;
  errors: unknown;
  createdAt: string;
  updatedAt: string;
}

export interface ContainerDetailResponse {
  id: string;
  importFileId: string | null;
  containerNo: string;
  dockNo: string | null;
  company: string | null;
  sourceFormat: string;
  parserVersion: string | null;
  status: string;
  payClassification: string | null;
  payTrailerNumber: string | null;
  payContainers: Array<{
    id: string;
    payContainerId: string;
    payContainerNo: string;
    status: string;
  }>;
  unloadingWage: ContainerDetailUnloadingWageResponse | null;
  totalCartons: number;
  totalVolumeCbm: string;
  rawJson: unknown;
  warnings: unknown;
  errors: unknown;
  createdAt: string;
  updatedAt: string;
  destinations: ContainerDetailDestinationResponse[];
}

export interface UpdateContainerDestinationRequest {
  cartons?: number;
  correctionNote?: string | null;
  destinationCode?: string;
  destinationType?: string | null;
  manualPallets?: number | null;
  note?: string | null;
  packageType?: string | null;
  volume?: number;
}

export interface UpdateContainerRequest {
  company?: string | null;
  containerNo?: string;
  correctedById?: string | null;
  correctionNote?: string | null;
  dockNo?: string | null;
  reason?: string | null;
  status?: string;
}

export interface CreateContainerDestinationRequest {
  cartons: number;
  correctionNote?: string | null;
  destinationCode: string;
  destinationType?: string | null;
  manualPallets?: number | null;
  note?: string | null;
  packageType?: string | null;
  volume: number;
}

export interface CreateManualContainerDestinationRequest {
  cartons: number;
  destinationCode: string;
  destinationType?: string | null;
  note?: string | null;
  pallets: number;
  volume?: number;
}

export interface CreateManualContainerRequest {
  company?: string | null;
  containerNo: string;
  correctedById?: string | null;
  correctionNote?: string | null;
  destinations: CreateManualContainerDestinationRequest[];
  dockNo?: string | null;
  reason?: string | null;
}

export interface CorrectionFeedbackResponse {
  id: string;
  targetType: string;
  importFileId: string | null;
  containerId: string | null;
  containerLineId: string | null;
  containerDestinationId: string | null;
  palletId: string | null;
  generatedFileId: string | null;
  fieldName: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string | null;
  note: string | null;
  correctedById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CorrectionListFilters {
  containerDestinationId?: string;
  containerId?: string;
  correctedById?: string;
  limit?: number;
  offset?: number;
  targetType?: string;
}

export interface CorrectionListResponse {
  items: CorrectionFeedbackResponse[];
  limit: number;
  offset: number;
}

export interface ContainerDestinationCorrectionResponse {
  containerDestination: {
    id: string;
    containerId: string;
    destinationCode: string;
    destinationType: string | null;
    packageType: string | null;
    cartons: number;
    volume: string;
    calculatedPallets: number;
    manualPallets: number | null;
    finalPallets: number;
    palletRuleCode: string | null;
    calculationBasisCbm: string | null;
    roundingMode: string | null;
    note: string | null;
    updatedAt: string;
  };
  corrections: CorrectionFeedbackResponse[];
}

export interface ContainerCorrectionResponse {
  container: {
    id: string;
    importFileId: string | null;
    containerNo: string;
    dockNo: string | null;
    company: string | null;
    status: string;
    payClassification: string | null;
    payTrailerNumber: string | null;
    updatedAt: string;
  };
  corrections: CorrectionFeedbackResponse[];
}

export interface ManualContainerResponse {
  container: ContainerDetailResponse;
  corrections: CorrectionFeedbackResponse[];
}

export interface GeneratedFileResponse {
  id: string;
  importFileId: string | null;
  containerId: string | null;
  fileType: string;
  storagePath: string;
  fileSha256: string | null;
  mimeType: string | null;
  fileSizeBytes: string | null;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedFileListResponse {
  items: GeneratedFileResponse[];
}

export interface GenerateReportResponse {
  generatedFile: GeneratedFileResponse;
  warnings: unknown[];
  errors: unknown[];
}

export interface PalletResponse {
  id: string;
  containerId: string;
  containerDestinationId: string;
  destinationCode: string;
  destinationType: string | null;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  labelPrintedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateLabelsResponse {
  generatedFile: GeneratedFileResponse;
  pallets: PalletResponse[];
  warnings: unknown[];
  errors: unknown[];
}

export interface ReprintLabelRequest {
  reason: string;
  supervisorOverride?: boolean;
}

export interface ReprintAuditEventResponse {
  id: string;
  palletRecordId: string;
  businessPalletId: string;
  userId: string;
  printedAt: string;
  reason: string;
  palletStatus: string;
  supervisorOverride: boolean;
}

export interface PalletReprintResponse {
  event: ReprintAuditEventResponse;
  pallet: PalletResponse;
}

export interface ContainerLabelReprintResponse {
  containerId: string;
  eventCount: number;
  events: ReprintAuditEventResponse[];
}

export interface PalletStatsResponse {
  totalPallets: number;
  loadedPallets: number;
  remainingPallets: number;
}

export interface ContainerSummaryItemResponse extends PalletStatsResponse {
  containerId: string;
  containerNo: string;
  payClassification: string | null;
  payTrailerNumber: string | null;
  status: string;
}

export interface ContainerSummaryListResponse {
  items: ContainerSummaryItemResponse[];
}

export interface DestinationInventoryItemResponse extends PalletStatsResponse {
  destinationCode: string;
}

export interface InventoryListResponse {
  items: DestinationInventoryItemResponse[];
}

export interface InventoryReportFilters {
  containerNo?: string;
  destinationCode?: string;
  status?: string;
}

export interface LoadJobContainerResponse {
  id: string;
  containerNo: string;
}

export interface LoadJobUserResponse {
  id: string;
  email: string | null;
  name: string | null;
  role: string;
}

export interface LoadJobLineResponse {
  id: string;
  sequence: number;
  sourceText: string | null;
  containerNo: string | null;
  containerId: string | null;
  container: LoadJobContainerResponse | null;
  containerDestinationId: string | null;
  destinationCode: string | null;
  plannedPallets: number;
  externalTransfer: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoadJobResponse {
  id: string;
  containerId: string | null;
  container: LoadJobContainerResponse | null;
  loadNo: string | null;
  truckNo: string | null;
  dockNo: string | null;
  carrier: string | null;
  destinationRegion: string | null;
  status: string;
  canScan: boolean;
  createdById: string | null;
  createdBy: LoadJobUserResponse | null;
  completedById: string | null;
  completedBy: LoadJobUserResponse | null;
  completedAt: string | null;
  startedAt: string | null;
  scheduledDepartureAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: LoadJobLineResponse[];
  plannedPalletCount: number;
  externalPalletCount: number;
  palletCount: number;
  eventCount: number;
}

export interface LoadJobListResponse {
  items: LoadJobResponse[];
  limit: number;
  offset: number;
}

export interface LoadJobContainerSuggestionResponse {
  containerId: string;
  containerNo: string;
  containerDestinationId: string;
  destinationCode: string;
  destinationType: string | null;
  finalPallets: number;
  loadedPallets: number;
  remainingPallets: number;
  status: string;
}

export interface LoadJobContainerSuggestionListResponse {
  items: LoadJobContainerSuggestionResponse[];
  limit: number;
}

export interface LoadJobListFilters {
  containerId?: string;
  destinationRegion?: string;
  limit?: number;
  loadNo?: string;
  offset?: number;
  status?: string;
}

export interface CreateLoadJobLineRequest {
  containerDestinationId?: string;
  containerId?: string;
  containerNo?: string;
  destinationCode?: string;
  externalTransfer?: boolean;
  note?: string;
  plannedPallets?: number;
  sourceText?: string;
}

export interface CreateLoadJobRequest {
  carrier?: string;
  containerId?: string;
  createdById?: string;
  destinationRegion?: string;
  dockNo?: string;
  lines: CreateLoadJobLineRequest[];
  loadNo: string;
  scheduledDepartureAt?: string;
  startedAt?: string;
  truckNo?: string;
}

export interface UpdateLoadJobRequest {
  carrier?: string;
  createdById?: string;
  destinationRegion?: string;
  dockNo?: string;
  lines?: CreateLoadJobLineRequest[];
  loadNo?: string;
  note?: string;
  operatorId?: string;
  reason?: string;
  scheduledDepartureAt?: string;
  startedAt?: string;
  status?: "COMPLETED" | "IN_PROGRESS" | "PLANNED";
  truckNo?: string;
}

export interface CloseLoadJobRequest {
  dockNo?: string;
  note?: string;
  operatorId?: string;
  reason?: string;
}

export interface LoadJobProgressResponse {
  totalPallets: number;
  loadedPallets: number;
  remainingPallets: number;
}

export interface ScannedPalletResponse {
  id: string;
  containerId: string;
  containerNo: string;
  containerDestinationId: string;
  destinationCode: string;
  destinationType: string | null;
  palletNo: number;
  palletId: string;
  qrPayload: string;
  status: string;
  loadedAt: string | null;
  loadJobId: string | null;
}

export interface ScanPalletRequest {
  deviceId?: string;
  operatorId?: string;
  overrideReason?: string;
  qrPayload: string;
  supervisorOverride?: boolean;
}

export interface ReverseScanRequest {
  confirm: boolean;
  deviceId?: string;
  operatorId?: string;
  palletRecordId: string;
  reason: string;
}

export interface LoadJobScanResponse {
  result: "LOADED" | "DUPLICATE" | "REMOVED";
  loadJob: LoadJobResponse;
  pallet: ScannedPalletResponse;
  progress: LoadJobProgressResponse;
  eventId: string | null;
}

export interface LoadJobLoadedPalletsResponse {
  items: ScannedPalletResponse[];
}

export interface LoadJobOperatorHistoryItemResponse {
  id: string;
  loadNo: string | null;
  destinationRegion: string | null;
  truckNo: string | null;
  dockNo: string | null;
  carrier: string | null;
  scheduledDepartureAt: string | null;
  completedAt: string | null;
  completedById: string | null;
  completedBy: LoadJobUserResponse | null;
  totalPallets: number;
  pallets: ScannedPalletResponse[];
}

export interface LoadJobOperatorHistoryResponse {
  items: LoadJobOperatorHistoryItemResponse[];
  limit: number;
  offset: number;
}

export interface ApiClientOptions {
  baseUrl?: string;
  authToken?: string | null;
  fetcher?: typeof fetch;
}

export interface UploadProgress {
  loaded: number;
  percent: number | null;
  total: number | null;
}

export interface UploadImportFileOptions {
  authToken?: string | null;
  baseUrl?: string;
  onProgress?: (progress: UploadProgress) => void;
}

export interface ApiRequestOptions extends Omit<RequestInit, "body"> {
  authToken?: string | null;
  body?: BodyInit | Record<string, unknown> | null;
}

export class ApiClientError extends Error {
  readonly code: string;
  readonly details: unknown;
  readonly path?: string;
  readonly status: number;
  readonly timestamp?: string;

  constructor(input: {
    code: string;
    message: string;
    status: number;
    details?: unknown;
    path?: string;
    timestamp?: string;
  }) {
    super(input.message);
    this.name = "ApiClientError";
    this.code = input.code;
    this.details = input.details ?? {};
    this.path = input.path;
    this.status = input.status;
    this.timestamp = input.timestamp;
  }
}

const DEFAULT_BROWSER_API_BASE_URL = "/api";
const DEFAULT_SERVER_API_BASE_URL = "http://127.0.0.1:4000/api";

export function getApiBaseUrl(): string {
  const publicBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
  const serverBaseUrl =
    process.env.API_BASE_URL ?? process.env.NEXT_SERVER_API_BASE_URL;

  if (typeof window === "undefined") {
    return normalizeBaseUrl(
      serverBaseUrl ??
        (publicBaseUrl && !isRelativeUrl(publicBaseUrl)
          ? publicBaseUrl
          : DEFAULT_SERVER_API_BASE_URL),
    );
  }

  return normalizeBaseUrl(publicBaseUrl ?? DEFAULT_BROWSER_API_BASE_URL);
}

export function getPublicApiBaseUrl(): string {
  return normalizeBaseUrl(
    process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_BROWSER_API_BASE_URL,
  );
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  return new ApiClient(options);
}

export async function getApiHealth(): Promise<ApiHealthResponse> {
  return createApiClient().get<ApiHealthResponse>("/health");
}

export function getQueueHealth(
  options: ApiClientOptions = {},
): Promise<QueueHealthResponse> {
  return createApiClient(options).get<QueueHealthResponse>("/queue/health");
}

export function getAsyncJob(
  id: string,
  options: ApiClientOptions = {},
): Promise<AsyncJobResponse> {
  return createApiClient(options).get<AsyncJobResponse>(
    `/queue/jobs/${encodeURIComponent(id)}`,
  );
}

export function login(
  body: LoginRequest,
  options: ApiClientOptions = {},
): Promise<LoginResponse> {
  return createApiClient(options).post<LoginResponse>("/auth/login", {
    ...body,
  });
}

export function getCurrentUser(
  options: ApiClientOptions = {},
): Promise<AuthUserResponse> {
  return createApiClient(options).get<AuthUserResponse>("/auth/me");
}

export function listUsers(
  options: ApiClientOptions = {},
): Promise<UserListResponse> {
  return createApiClient(options).get<UserListResponse>("/users");
}

export function createUser(
  body: CreateUserRequest,
  options: ApiClientOptions = {},
): Promise<UserMutationResponse> {
  return createApiClient(options).post<UserMutationResponse>("/users", {
    ...body,
  });
}

export function getUser(
  id: string,
  options: ApiClientOptions = {},
): Promise<UserResponse> {
  return createApiClient(options).get<UserResponse>(
    `/users/${encodeURIComponent(id)}`,
  );
}

export function updateUser(
  id: string,
  body: UpdateUserRequest,
  options: ApiClientOptions = {},
): Promise<UserMutationResponse> {
  return createApiClient(options).patch<UserMutationResponse>(
    `/users/${encodeURIComponent(id)}`,
    { ...body },
  );
}

export function resetUserPassword(
  id: string,
  body: ResetPasswordRequest,
  options: ApiClientOptions = {},
): Promise<UserMutationResponse> {
  return createApiClient(options).post<UserMutationResponse>(
    `/users/${encodeURIComponent(id)}/reset-password`,
    { ...body },
  );
}

export function updateUserRoles(
  id: string,
  body: UpdateUserRolesRequest,
  options: ApiClientOptions = {},
): Promise<UserMutationResponse> {
  return createApiClient(options).patch<UserMutationResponse>(
    `/users/${encodeURIComponent(id)}/roles`,
    { ...body },
  );
}

export function updateUserStatus(
  id: string,
  body: UpdateUserStatusRequest,
  options: ApiClientOptions = {},
): Promise<UserMutationResponse> {
  return createApiClient(options).patch<UserMutationResponse>(
    `/users/${encodeURIComponent(id)}/status`,
    { ...body },
  );
}

export function listRoles(
  options: ApiClientOptions = {},
): Promise<RoleListResponse> {
  return createApiClient(options).get<RoleListResponse>("/roles");
}

export function updateRolePermissions(
  id: string,
  body: UpdateRolePermissionsRequest,
  options: ApiClientOptions = {},
): Promise<RoleMutationResponse> {
  return createApiClient(options).patch<RoleMutationResponse>(
    `/roles/${encodeURIComponent(id)}/permissions`,
    { ...body },
  );
}

export function listPermissions(
  options: ApiClientOptions = {},
): Promise<PermissionListResponse> {
  return createApiClient(options).get<PermissionListResponse>("/permissions");
}

export function getOperationalSettings(
  options: ApiClientOptions = {},
): Promise<OperationalSettingsResponse> {
  return createApiClient(options).get<OperationalSettingsResponse>(
    "/settings/operational",
  );
}

export function updateOperationalSettings(
  body: UpdateOperationalSettingsRequest,
  options: ApiClientOptions = {},
): Promise<OperationalSettingsMutationResponse> {
  return createApiClient(options).patch<OperationalSettingsMutationResponse>(
    "/settings/operational",
    { ...body },
  );
}

export function listAttendanceImports(
  filters: AttendanceImportListFilters = {},
  options: ApiClientOptions = {},
): Promise<AttendanceImportListResponse> {
  return createApiClient(options).get<AttendanceImportListResponse>(
    `/attendance-imports${toAttendanceImportListQueryString(filters)}`,
  );
}

export function getAttendanceImport(
  id: string,
  options: ApiClientOptions = {},
): Promise<AttendanceImportResponse> {
  return createApiClient(options).get<AttendanceImportResponse>(
    `/attendance-imports/${encodeURIComponent(id)}`,
  );
}

export function parseAttendanceImport(
  id: string,
  options: ApiClientOptions = {},
): Promise<AttendanceParseResultResponse> {
  return createApiClient(options).post<AttendanceParseResultResponse>(
    `/attendance-imports/${encodeURIComponent(id)}/parse`,
  );
}

export function getAttendanceParseResult(
  id: string,
  options: ApiClientOptions = {},
): Promise<AttendanceParseResultResponse> {
  return createApiClient(options).get<AttendanceParseResultResponse>(
    `/attendance-imports/${encodeURIComponent(id)}/parse-result`,
  );
}

export function generateAttendanceWageRecord(
  id: string,
  options: ApiClientOptions = {},
): Promise<GenerateWageRecordResponse> {
  return createApiClient(options).post<GenerateWageRecordResponse>(
    `/attendance-imports/${encodeURIComponent(id)}/generate-wage-record`,
  );
}

export function submitAttendanceParseJob(
  id: string,
  options: ApiClientOptions = {},
): Promise<AsyncJobResponse> {
  return createApiClient(options).post<AsyncJobResponse>(
    `/attendance-imports/${encodeURIComponent(id)}/parse-job`,
  );
}

export function submitAttendanceWageRecordJob(
  id: string,
  options: ApiClientOptions = {},
): Promise<AsyncJobResponse> {
  return createApiClient(options).post<AsyncJobResponse>(
    `/attendance-imports/${encodeURIComponent(id)}/generate-wage-record-job`,
  );
}

export function listAttendanceImportFiles(
  id: string,
  options: ApiClientOptions = {},
): Promise<WageGeneratedFileListResponse> {
  return createApiClient(options).get<WageGeneratedFileListResponse>(
    `/attendance-imports/${encodeURIComponent(id)}/files`,
  );
}

export function getImportFile(
  id: string,
  options: ApiClientOptions = {},
): Promise<ImportFileResponse> {
  return createApiClient(options).get<ImportFileResponse>(
    `/imports/${encodeURIComponent(id)}`,
  );
}

export function listImportFiles(
  filters: ImportListFilters = {},
  options: ApiClientOptions = {},
): Promise<ImportFileListResponse> {
  return createApiClient(options).get<ImportFileListResponse>(
    `/imports${toImportListQueryString(filters)}`,
  );
}

export function deleteImportFile(
  id: string,
  body: DeleteImportRequest = {},
  options: ApiClientOptions = {},
): Promise<ImportFileResponse> {
  return createApiClient(options).request<ImportFileResponse>(
    `/imports/${encodeURIComponent(id)}`,
    { body: { ...body }, method: "DELETE" },
  );
}

export function getImportParseResult(
  id: string,
  options: ApiClientOptions = {},
): Promise<ImportParseResultResponse> {
  return createApiClient(options).get<ImportParseResultResponse>(
    `/imports/${encodeURIComponent(id)}/parse-result`,
  );
}

export function parseImportFile(
  id: string,
  options: ApiClientOptions = {},
): Promise<ImportParseResultResponse> {
  return createApiClient(options).post<ImportParseResultResponse>(
    `/imports/${encodeURIComponent(id)}/parse`,
  );
}

export function submitImportParseJob(
  id: string,
  options: ApiClientOptions = {},
): Promise<AsyncJobResponse> {
  return createApiClient(options).post<AsyncJobResponse>(
    `/imports/${encodeURIComponent(id)}/parse-job`,
  );
}

export function getContainerDetail(
  id: string,
  options: ApiClientOptions = {},
): Promise<ContainerDetailResponse> {
  return createApiClient(options).get<ContainerDetailResponse>(
    `/containers/${encodeURIComponent(id)}`,
  );
}

export function updateContainer(
  id: string,
  body: UpdateContainerRequest,
  options: ApiClientOptions = {},
): Promise<ContainerCorrectionResponse> {
  return createApiClient(options).patch<ContainerCorrectionResponse>(
    `/containers/${encodeURIComponent(id)}`,
    { ...body },
  );
}

export function updateContainerPayClassification(
  id: string,
  body: UpdateContainerPayClassificationRequest,
  options: ApiClientOptions = {},
): Promise<ContainerPayClassificationMutationResponse> {
  return createApiClient(
    options,
  ).patch<ContainerPayClassificationMutationResponse>(
    `/containers/${encodeURIComponent(id)}/pay-classification`,
    { ...body },
  );
}

export function saveContainerUnloadingWage(
  id: string,
  body: SaveContainerUnloadingWageRequest,
  options: ApiClientOptions = {},
): Promise<ContainerUnloadingWageResponse> {
  return createApiClient(options).patch<ContainerUnloadingWageResponse>(
    `/containers/${encodeURIComponent(id)}/unloading-wage`,
    { ...body },
  );
}

export function updateContainerUnloadingWageAssociations(
  id: string,
  body: UpdateContainerUnloadingWageAssociationsRequest,
  options: ApiClientOptions = {},
): Promise<ContainerUnloadingWageResponse> {
  return createApiClient(options).patch<ContainerUnloadingWageResponse>(
    `/containers/${encodeURIComponent(id)}/unloading-wage-associations`,
    { ...body },
  );
}

export function completeContainerUnloading(
  id: string,
  body: CompleteContainerUnloadingRequest,
  options: ApiClientOptions = {},
): Promise<ContainerUnloadingWageResponse> {
  return createApiClient(options).post<ContainerUnloadingWageResponse>(
    `/containers/${encodeURIComponent(id)}/complete-unloading`,
    { ...body },
  );
}

export function updateContainerUnloaders(
  id: string,
  body: UpdateContainerUnloadersRequest,
  options: ApiClientOptions = {},
): Promise<ContainerUnloadingWageResponse> {
  return createApiClient(options).request<ContainerUnloadingWageResponse>(
    `/containers/${encodeURIComponent(id)}/unloaders`,
    { body: { ...body }, method: "PUT" },
  );
}

export function listUnloadingWageWorkers(
  options: ApiClientOptions = {},
): Promise<UnloadingWageWorkerListResponse> {
  return createApiClient(options).get<UnloadingWageWorkerListResponse>(
    "/unloading-wage/workers",
  );
}

export function createUnloadingWageWorker(
  body: CreateUnloadingWageWorkerRequest,
  options: ApiClientOptions = {},
): Promise<UnloadingWageWorkerResponse> {
  return createApiClient(options).post<UnloadingWageWorkerResponse>(
    "/unloading-wage/workers",
    { ...body },
  );
}

export function createPayContainer(
  body: CreatePayContainerRequest,
  options: ApiClientOptions = {},
): Promise<PayContainerResponse> {
  return createApiClient(options).post<PayContainerResponse>(
    "/pay-containers",
    {
      ...body,
    },
  );
}

export function listPayContainers(
  filters: PayContainerListFilters = {},
  options: ApiClientOptions = {},
): Promise<PayContainerListResponse> {
  return createApiClient(options).get<PayContainerListResponse>(
    `/pay-containers${toPayContainerListQueryString(filters)}`,
  );
}

export function getPayContainer(
  id: string,
  options: ApiClientOptions = {},
): Promise<PayContainerResponse> {
  return createApiClient(options).get<PayContainerResponse>(
    `/pay-containers/${encodeURIComponent(id)}`,
  );
}

export function completePayContainer(
  id: string,
  body: CompleteUnloadingRequest,
  options: ApiClientOptions = {},
): Promise<PayContainerResponse> {
  return createApiClient(options).post<PayContainerResponse>(
    `/pay-containers/${encodeURIComponent(id)}/complete-unloading`,
    { ...body },
  );
}

export function generateUnloadingWageSettlement(
  body: GenerateUnloadingWageSettlementRequest,
  options: ApiClientOptions = {},
): Promise<UnloadingWageSettlementResponse> {
  return createApiClient(options).post<UnloadingWageSettlementResponse>(
    "/unloading-wage-settlements",
    { ...body },
  );
}

export function listUnloadingWageSettlements(
  options: ApiClientOptions = {},
): Promise<UnloadingWageSettlementListResponse> {
  return createApiClient(options).get<UnloadingWageSettlementListResponse>(
    "/unloading-wage-settlements",
  );
}

export function getUnloadingWageSettlement(
  id: string,
  options: ApiClientOptions = {},
): Promise<UnloadingWageSettlementResponse> {
  return createApiClient(options).get<UnloadingWageSettlementResponse>(
    `/unloading-wage-settlements/${encodeURIComponent(id)}`,
  );
}

export function getUnloadingSummary(
  month: string,
  options: ApiClientOptions = {},
): Promise<UnloadingSummaryResponse> {
  const params = new URLSearchParams({ month });
  return createApiClient(options).get<UnloadingSummaryResponse>(
    `/unloading-summary?${params.toString()}`,
  );
}

export function exportUnloadingSummary(
  body: ExportUnloadingSummaryRequest,
  options: ApiClientOptions = {},
): Promise<ExportUnloadingSummaryResponse> {
  return createApiClient(options).post<ExportUnloadingSummaryResponse>(
    "/unloading-summary/exports",
    { ...body },
  );
}

export function updateContainerDestination(
  id: string,
  body: UpdateContainerDestinationRequest,
  options: ApiClientOptions = {},
): Promise<ContainerDestinationCorrectionResponse> {
  return createApiClient(options).patch<ContainerDestinationCorrectionResponse>(
    `/container-destinations/${encodeURIComponent(id)}`,
    { ...body },
  );
}

export function createContainerDestination(
  containerId: string,
  body: CreateContainerDestinationRequest,
  options: ApiClientOptions = {},
): Promise<ContainerDestinationCorrectionResponse> {
  return createApiClient(options).post<ContainerDestinationCorrectionResponse>(
    `/containers/${encodeURIComponent(containerId)}/destinations`,
    { ...body },
  );
}

export function deleteContainerDestination(
  id: string,
  options: ApiClientOptions = {},
): Promise<ContainerDestinationCorrectionResponse> {
  return createApiClient(
    options,
  ).delete<ContainerDestinationCorrectionResponse>(
    `/container-destinations/${encodeURIComponent(id)}`,
  );
}

export function createManualContainer(
  body: CreateManualContainerRequest,
  options: ApiClientOptions = {},
): Promise<ManualContainerResponse> {
  return createApiClient(options).post<ManualContainerResponse>(
    "/containers/manual",
    { ...body },
  );
}

export function listCorrections(
  filters: CorrectionListFilters = {},
  options: ApiClientOptions = {},
): Promise<CorrectionListResponse> {
  return createApiClient(options).get<CorrectionListResponse>(
    `/corrections${toCorrectionListQueryString(filters)}`,
  );
}

export function getContainerGeneratedFiles(
  id: string,
  options: ApiClientOptions = {},
): Promise<GeneratedFileListResponse> {
  return createApiClient(options).get<GeneratedFileListResponse>(
    `/containers/${encodeURIComponent(id)}/files`,
  );
}

export function generateContainerReport(
  id: string,
  options: ApiClientOptions = {},
): Promise<GenerateReportResponse> {
  return createApiClient(options).post<GenerateReportResponse>(
    `/containers/${encodeURIComponent(id)}/generate-report`,
  );
}

export function submitContainerReportJob(
  id: string,
  options: ApiClientOptions = {},
): Promise<AsyncJobResponse> {
  return createApiClient(options).post<AsyncJobResponse>(
    `/containers/${encodeURIComponent(id)}/generate-report-job`,
  );
}

export function generateContainerLabels(
  id: string,
  options: ApiClientOptions = {},
): Promise<GenerateLabelsResponse> {
  return createApiClient(options).post<GenerateLabelsResponse>(
    `/containers/${encodeURIComponent(id)}/generate-labels`,
  );
}

export function submitContainerLabelsJob(
  id: string,
  options: ApiClientOptions = {},
): Promise<AsyncJobResponse> {
  return createApiClient(options).post<AsyncJobResponse>(
    `/containers/${encodeURIComponent(id)}/generate-labels-job`,
  );
}

export function reprintContainerLabels(
  id: string,
  body: ReprintLabelRequest,
  options: ApiClientOptions = {},
): Promise<ContainerLabelReprintResponse> {
  return createApiClient(options).post<ContainerLabelReprintResponse>(
    `/containers/${encodeURIComponent(id)}/labels/reprint`,
    { ...body },
  );
}

export function reprintPalletLabel(
  id: string,
  body: ReprintLabelRequest,
  options: ApiClientOptions = {},
): Promise<PalletReprintResponse> {
  return createApiClient(options).post<PalletReprintResponse>(
    `/pallets/${encodeURIComponent(id)}/print`,
    { ...body },
  );
}

export function getContainerInventorySummary(
  filters: InventoryReportFilters = {},
  options: ApiClientOptions = {},
): Promise<ContainerSummaryListResponse> {
  return createApiClient(options).get<ContainerSummaryListResponse>(
    `/reports/container-summary${toInventoryQueryString(filters)}`,
  );
}

export function getDestinationInventory(
  filters: InventoryReportFilters = {},
  options: ApiClientOptions = {},
): Promise<InventoryListResponse> {
  return createApiClient(options).get<InventoryListResponse>(
    `/reports/inventory${toInventoryQueryString(filters)}`,
  );
}

export function listLoadJobs(
  filters: LoadJobListFilters = {},
  options: ApiClientOptions = {},
): Promise<LoadJobListResponse> {
  return createApiClient(options).get<LoadJobListResponse>(
    `/load-jobs${toLoadJobListQueryString(filters)}`,
  );
}

export function getLoadJob(
  id: string,
  options: ApiClientOptions = {},
): Promise<LoadJobResponse> {
  return createApiClient(options).get<LoadJobResponse>(
    `/load-jobs/${encodeURIComponent(id)}`,
  );
}

export function listLoadJobContainerSuggestions(
  destinationRegion: string,
  filters: { containerNo?: string } = {},
  options: ApiClientOptions = {},
): Promise<LoadJobContainerSuggestionListResponse> {
  const params = new URLSearchParams();
  appendQueryParam(params, "destinationRegion", destinationRegion);
  appendQueryParam(params, "containerNo", filters.containerNo);
  appendNumberQueryParam(params, "limit", 20);

  return createApiClient(options).get<LoadJobContainerSuggestionListResponse>(
    `/load-jobs/container-suggestions?${params.toString()}`,
  );
}

export function getLoadJobLoadedPallets(
  id: string,
  options: ApiClientOptions = {},
): Promise<LoadJobLoadedPalletsResponse> {
  return createApiClient(options).get<LoadJobLoadedPalletsResponse>(
    `/load-jobs/${encodeURIComponent(id)}/loaded-pallets`,
  );
}

export function listMyLoadJobOperatorHistory(
  filters: Pick<LoadJobListFilters, "limit" | "offset"> = {},
  options: ApiClientOptions = {},
): Promise<LoadJobOperatorHistoryResponse> {
  return createApiClient(options).get<LoadJobOperatorHistoryResponse>(
    `/load-jobs/operator-history/me${toLoadJobListQueryString(filters)}`,
  );
}

export function createLoadJob(
  body: CreateLoadJobRequest,
  options: ApiClientOptions = {},
): Promise<LoadJobResponse> {
  return createApiClient(options).post<LoadJobResponse>("/load-jobs", {
    ...body,
  });
}

export function updateLoadJob(
  id: string,
  body: UpdateLoadJobRequest,
  options: ApiClientOptions = {},
): Promise<LoadJobResponse> {
  return createApiClient(options).patch<LoadJobResponse>(
    `/load-jobs/${encodeURIComponent(id)}`,
    { ...body },
  );
}

export function deleteLoadJob(
  id: string,
  options: ApiClientOptions = {},
): Promise<LoadJobResponse> {
  return createApiClient(options).delete<LoadJobResponse>(
    `/load-jobs/${encodeURIComponent(id)}`,
  );
}

export function closeLoadJob(
  id: string,
  body: CloseLoadJobRequest,
  options: ApiClientOptions = {},
): Promise<LoadJobResponse> {
  return createApiClient(options).post<LoadJobResponse>(
    `/load-jobs/${encodeURIComponent(id)}/close`,
    { ...body },
  );
}

export function scanLoadJobPallet(
  id: string,
  body: ScanPalletRequest,
  options: ApiClientOptions = {},
): Promise<LoadJobScanResponse> {
  return createApiClient(options).post<LoadJobScanResponse>(
    `/load-jobs/${encodeURIComponent(id)}/scan`,
    { ...body },
  );
}

export function reverseLoadJobScan(
  id: string,
  body: ReverseScanRequest,
  options: ApiClientOptions = {},
): Promise<LoadJobScanResponse> {
  return createApiClient(options).post<LoadJobScanResponse>(
    `/load-jobs/${encodeURIComponent(id)}/scan/reverse`,
    { ...body },
  );
}

export function getGeneratedFileDownloadUrl(
  containerId: string,
  fileId: string,
  baseUrl = getPublicApiBaseUrl(),
): string {
  const encodedContainerId = encodeURIComponent(containerId);
  const encodedFileId = encodeURIComponent(fileId);

  return buildWebUrl(
    `/containers/${encodedContainerId}/files/${encodedFileId}/download`,
    apiBaseToWebBaseUrl(baseUrl),
  );
}

export function getAttendanceGeneratedFileDownloadUrl(
  attendanceImportId: string,
  fileId: string,
  baseUrl = getPublicApiBaseUrl(),
): string {
  const encodedImportId = encodeURIComponent(attendanceImportId);
  const encodedFileId = encodeURIComponent(fileId);

  return buildWebUrl(
    `/work-hours/${encodedImportId}/files/${encodedFileId}/download`,
    apiBaseToWebBaseUrl(baseUrl),
  );
}

export function getUnloadingWageSettlementFileDownloadUrl(
  settlementId: string,
  fileId: string,
  baseUrl = getPublicApiBaseUrl(),
): string {
  const encodedSettlementId = encodeURIComponent(settlementId);
  const encodedFileId = encodeURIComponent(fileId);

  return buildWebUrl(
    `/unloading-wage/settlements/${encodedSettlementId}/files/${encodedFileId}/download`,
    apiBaseToWebBaseUrl(baseUrl),
  );
}

export function getUnloadingSummaryExportDownloadUrl(
  fileId: string,
  baseUrl = getPublicApiBaseUrl(),
): string {
  const encodedFileId = encodeURIComponent(fileId);

  return buildWebUrl(
    `/unloading-summary/exports/${encodedFileId}/download`,
    apiBaseToWebBaseUrl(baseUrl),
  );
}

export function uploadImportFile(
  file: File,
  options: UploadImportFileOptions = {},
): Promise<ImportFileResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return uploadFormData<ImportFileResponse>("/imports", formData, options);
}

export function uploadAttendanceImportFile(
  file: File,
  options: UploadImportFileOptions = {},
): Promise<AttendanceImportResponse> {
  const formData = new FormData();
  formData.append("file", file);

  return uploadFormData<AttendanceImportResponse>(
    "/attendance-imports",
    formData,
    options,
  );
}

export class ApiClient {
  private readonly authToken: string | null;
  private readonly baseUrl: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.authToken =
      options.authToken === undefined
        ? getBrowserAuthToken()
        : options.authToken;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? getApiBaseUrl());
    this.fetcher = options.fetcher ?? defaultFetcher();
  }

  get<TResponse>(
    path: string,
    options: Omit<ApiRequestOptions, "method" | "body"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, { ...options, method: "GET" });
  }

  post<TResponse>(
    path: string,
    body?: ApiRequestOptions["body"],
    options: Omit<ApiRequestOptions, "method" | "body"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, { ...options, method: "POST", body });
  }

  patch<TResponse>(
    path: string,
    body?: ApiRequestOptions["body"],
    options: Omit<ApiRequestOptions, "method" | "body"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, {
      ...options,
      method: "PATCH",
      body,
    });
  }

  delete<TResponse>(
    path: string,
    options: Omit<ApiRequestOptions, "method" | "body"> = {},
  ): Promise<TResponse> {
    return this.request<TResponse>(path, { ...options, method: "DELETE" });
  }

  async request<TResponse>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<TResponse> {
    const headers = new Headers(options.headers);
    const authToken =
      options.authToken === undefined ? this.authToken : options.authToken;
    const body = serializeBody(options.body, headers);

    if (authToken) {
      headers.set("Authorization", `Bearer ${authToken}`);
    }

    let response: Response;
    try {
      response = await this.fetcher(this.urlFor(path), {
        ...options,
        body,
        cache: options.cache ?? "no-store",
        headers,
      });
    } catch (error) {
      throw new ApiClientError({
        code: "API_NETWORK_ERROR",
        message:
          error instanceof Error
            ? error.message
            : "The API request could not be sent.",
        status: 0,
        details: { baseUrl: this.baseUrl, path },
      });
    }

    if (!response.ok) {
      throw await toApiClientError(response);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    return (await parseResponseBody(response)) as TResponse;
  }

  private urlFor(path: string): string {
    return buildApiUrl(path, this.baseUrl);
  }
}

export function buildApiUrl(path: string, baseUrl = getApiBaseUrl()): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (normalizedBaseUrl.startsWith("/")) {
    return `${normalizedBaseUrl}${normalizedPath}`;
  }

  return new URL(
    normalizedPath.replace(/^\//, ""),
    `${normalizedBaseUrl}/`,
  ).toString();
}

function buildWebUrl(path: string, baseUrl: string): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const normalizedBaseUrl = baseUrl ? normalizeBaseUrl(baseUrl) : "";

  if (!normalizedBaseUrl) {
    return normalizedPath;
  }
  if (normalizedBaseUrl.startsWith("/")) {
    return `${normalizedBaseUrl}${normalizedPath}`;
  }

  return new URL(
    normalizedPath.replace(/^\//, ""),
    `${normalizedBaseUrl}/`,
  ).toString();
}

function apiBaseToWebBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized === "/api") {
    return "";
  }
  if (normalized.startsWith("/")) {
    return normalized.endsWith("/api") ? normalized.slice(0, -4) : normalized;
  }

  try {
    const url = new URL(normalized);
    if (url.pathname === "/api") {
      url.pathname = "/";
    } else if (url.pathname.endsWith("/api")) {
      url.pathname = url.pathname.slice(0, -4);
    }
    return normalizeBaseUrl(url.toString());
  } catch {
    return "";
  }
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim();
  return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
}

function defaultFetcher(): typeof fetch {
  if (typeof window !== "undefined" && typeof window.fetch === "function") {
    return window.fetch.bind(window);
  }

  return globalThis.fetch.bind(globalThis);
}

function isRelativeUrl(value: string): boolean {
  return value.trim().startsWith("/");
}

function toInventoryQueryString(filters: InventoryReportFilters): string {
  const params = new URLSearchParams();

  appendQueryParam(params, "containerNo", filters.containerNo);
  appendQueryParam(params, "destinationCode", filters.destinationCode);
  appendQueryParam(params, "status", filters.status);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function toImportListQueryString(filters: ImportListFilters): string {
  const params = new URLSearchParams();

  appendNumberQueryParam(params, "limit", filters.limit);
  appendNumberQueryParam(params, "offset", filters.offset);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function toAttendanceImportListQueryString(
  filters: AttendanceImportListFilters,
): string {
  const params = new URLSearchParams();

  appendNumberQueryParam(params, "limit", filters.limit);
  appendNumberQueryParam(params, "offset", filters.offset);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function toPayContainerListQueryString(
  filters: PayContainerListFilters,
): string {
  const params = new URLSearchParams();

  appendNumberQueryParam(params, "limit", filters.limit);
  appendNumberQueryParam(params, "offset", filters.offset);
  appendQueryParam(params, "settlementMonth", filters.settlementMonth);
  appendQueryParam(params, "status", filters.status);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function toLoadJobListQueryString(filters: LoadJobListFilters): string {
  const params = new URLSearchParams();

  appendQueryParam(params, "containerId", filters.containerId);
  appendQueryParam(params, "destinationRegion", filters.destinationRegion);
  appendNumberQueryParam(params, "limit", filters.limit);
  appendQueryParam(params, "loadNo", filters.loadNo);
  appendNumberQueryParam(params, "offset", filters.offset);
  appendQueryParam(params, "status", filters.status);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function toCorrectionListQueryString(filters: CorrectionListFilters): string {
  const params = new URLSearchParams();

  appendQueryParam(
    params,
    "containerDestinationId",
    filters.containerDestinationId,
  );
  appendQueryParam(params, "containerId", filters.containerId);
  appendQueryParam(params, "correctedById", filters.correctedById);
  appendNumberQueryParam(params, "limit", filters.limit);
  appendNumberQueryParam(params, "offset", filters.offset);
  appendQueryParam(params, "targetType", filters.targetType);

  const query = params.toString();
  return query ? `?${query}` : "";
}

function appendQueryParam(
  params: URLSearchParams,
  key: string,
  value: string | undefined,
) {
  const trimmed = value?.trim();
  if (trimmed) {
    params.set(key, trimmed);
  }
}

function appendNumberQueryParam(
  params: URLSearchParams,
  key: string,
  value: number | undefined,
) {
  if (value !== undefined) {
    params.set(key, String(value));
  }
}

function serializeBody(
  body: ApiRequestOptions["body"],
  headers: Headers,
): BodyInit | null | undefined {
  if (body === null || body === undefined) {
    return body;
  }

  if (
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams ||
    typeof body === "string"
  ) {
    return body;
  }

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return JSON.stringify(body);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    return response.json();
  }

  return response.text();
}

function uploadFormData<TResponse>(
  path: string,
  body: FormData,
  options: UploadImportFileOptions,
): Promise<TResponse> {
  if (typeof XMLHttpRequest === "undefined") {
    return Promise.reject(
      new ApiClientError({
        code: "UPLOAD_UNAVAILABLE",
        message: "File uploads must be started from a browser session.",
        status: 0,
      }),
    );
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", buildApiUrl(path, options.baseUrl));
    xhr.responseType = "text";

    const authToken =
      options.authToken === undefined
        ? getBrowserAuthToken()
        : options.authToken;
    if (authToken) {
      xhr.setRequestHeader("Authorization", `Bearer ${authToken}`);
    }

    xhr.upload.onprogress = (event) => {
      options.onProgress?.({
        loaded: event.loaded,
        percent: event.lengthComputable
          ? (event.loaded / event.total) * 100
          : null,
        total: event.lengthComputable ? event.total : null,
      });
    };

    xhr.onerror = () => {
      reject(
        new ApiClientError({
          code: "API_NETWORK_ERROR",
          message: "The API request could not be sent.",
          status: 0,
          details: { path },
        }),
      );
    };

    xhr.onload = () => {
      const responseText =
        typeof xhr.response === "string" ? xhr.response : xhr.responseText;

      if (xhr.status < 200 || xhr.status >= 300) {
        reject(
          toApiClientErrorFromPayload(
            xhr.status,
            xhr.statusText,
            xhr.getResponseHeader("content-type") ?? "",
            responseText,
          ),
        );
        return;
      }

      resolve(parseXhrSuccess<TResponse>(responseText));
    };

    xhr.send(body);
  });
}

function parseXhrSuccess<TResponse>(responseText: string): TResponse {
  if (!responseText) {
    return undefined as TResponse;
  }

  return JSON.parse(responseText) as TResponse;
}

function toApiClientErrorFromPayload(
  status: number,
  statusText: string,
  contentType: string,
  responseText: string,
): ApiClientError {
  const body = parseErrorPayload(status, statusText, contentType, responseText);

  return new ApiClientError({
    code: body.code,
    message: body.message,
    status,
    details: body.details,
    path: body.path,
    timestamp: body.timestamp,
  });
}

function parseErrorPayload(
  status: number,
  statusText: string,
  contentType: string,
  responseText: string,
): ApiErrorResponse {
  if (contentType.includes("application/json") && responseText) {
    const parsed = JSON.parse(responseText) as unknown;
    if (isApiErrorResponse(parsed)) {
      return parsed;
    }
  }

  return {
    code: `HTTP_${status}`,
    message: statusText || `API request failed with HTTP status ${status}.`,
    details: responseText ? { bodyPreview: responseText.slice(0, 500) } : {},
  };
}

async function toApiClientError(response: Response): Promise<ApiClientError> {
  const body = await parseErrorBody(response);
  return new ApiClientError({
    code: body.code,
    message: body.message,
    status: response.status,
    details: body.details,
    path: body.path,
    timestamp: body.timestamp,
  });
}

async function parseErrorBody(response: Response): Promise<ApiErrorResponse> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const parsed = await response.json();
    if (isApiErrorResponse(parsed)) {
      return parsed;
    }
  }

  const text = await response.text();
  return {
    code: `HTTP_${response.status}`,
    message:
      response.statusText ||
      `API request failed with HTTP status ${response.status}.`,
    details: text ? { bodyPreview: text.slice(0, 500) } : {},
  };
}

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return (
    value !== null &&
    typeof value === "object" &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}
