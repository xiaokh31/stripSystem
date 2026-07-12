import type { Locale, MessageKey } from "./catalog";
import { createTranslator } from "./translator";

const categoryKeys: Record<string, MessageKey> = {
  Deployment: "Deployment",
  "Generated files": "Generated files",
  "Operational profile": "Operational profile",
  "Warehouse rules": "Warehouse rules",
};

const fieldLabelKeys: Record<string, MessageKey> = {
  backupPolicy: "Backup policy",
  deliveryPhase: "Delivery phase",
  duplicateImportPolicy: "Duplicate import policy",
  inventorySource: "Inventory source",
  labelHeightMm: "Label height mm",
  labelWidthMm: "Label width mm",
  manualCorrectionPolicy: "Manual correction policy",
  operationalTimeZone: "Operational time zone",
  qrTargetSizeMm: "QR target size mm",
  reportTemplateName: "Report template",
  runtimeMode: "Runtime mode",
  siteName: "Site name",
  storagePolicy: "Storage policy",
  unloadingWageOceanContainerRateCad: "Ocean container unloading wage CAD",
  unloadingWageUsToCanadaTransferRateCad:
    "US-to-Canada transfer unloading wage CAD",
};

const fieldDescriptionKeys: Record<string, MessageKey> = {
  backupPolicy: "PostgreSQL backup expectation for production operations.",
  deliveryPhase: "Current rollout stage shown on the dashboard.",
  duplicateImportPolicy:
    "Policy for uploaded Excel files with the same SHA-256.",
  inventorySource: "Authoritative source for remaining pallet inventory.",
  labelHeightMm: "Physical PDF label height in millimeters.",
  labelWidthMm: "Physical PDF label width in millimeters.",
  manualCorrectionPolicy:
    "How office corrections are tracked after parser output.",
  operationalTimeZone: "IANA time zone used for local warehouse timestamps.",
  qrTargetSizeMm: "Target QR print box size in millimeters.",
  reportTemplateName: "Company unloading report template name.",
  runtimeMode: "Expected local and production runtime mode.",
  siteName: "Name shown to office and warehouse users.",
  storagePolicy: "Persistence expectation for uploads, reports, and labels.",
  unloadingWageOceanContainerRateCad:
    "Default unloading wage rate for one ocean pay container.",
  unloadingWageUsToCanadaTransferRateCad:
    "Default unloading wage rate for one trailer-group pay container.",
};

const optionLabelKeys: Record<string, Record<string, MessageKey>> = {
  deliveryPhase: {
    "P2 Office": "P2 Office",
    "P5 Pilot Ready": "P5 Pilot Ready",
    "Pilot Running": "Pilot Running",
    Production: "Production",
  },
  duplicateImportPolicy: {
    block: "Block duplicate uploads",
    warn: "Warn and keep existing import",
  },
  inventorySource: {
    backend_state: "Backend/database state",
  },
  manualCorrectionPolicy: {
    admin_approval: "Admin approval required",
    audit_required: "Audit required",
  },
  operationalTimeZone: {
    "America/Edmonton": "Calgary / Edmonton",
    "America/Toronto": "Toronto",
    "America/Vancouver": "Vancouver",
    UTC: "UTC",
  },
  runtimeMode: {
    docker_compose: "Docker Compose full stack",
  },
};

export function operationalSettingCategoryLabel(
  category: string | null | undefined,
  locale: Locale,
): string {
  const { t } = createTranslator(locale);
  return t(categoryKeys[category?.trim() ?? ""] ?? "i18n.settings.unknownCategory");
}

export function operationalSettingFieldLabel(
  fieldKey: string,
  locale: Locale,
): string {
  const { format, t } = createTranslator(locale);
  const key = fieldLabelKeys[fieldKey];
  return key ? t(key) : format("i18n.settings.unknownField", { key: fieldKey });
}

export function operationalSettingFieldDescription(
  fieldKey: string,
  locale: Locale,
): string {
  const { t } = createTranslator(locale);
  return t(
    fieldDescriptionKeys[fieldKey] ?? "i18n.settings.fieldDescriptionUnavailable",
  );
}

export function operationalSettingOptionLabel(
  fieldKey: string,
  value: string,
  locale: Locale,
): string {
  const { format, t } = createTranslator(locale);
  const key = optionLabelKeys[fieldKey]?.[value];
  return key ? t(key) : format("i18n.settings.unknownOption", { value });
}
