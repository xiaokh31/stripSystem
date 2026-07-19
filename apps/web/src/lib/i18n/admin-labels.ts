import type { Locale, MessageKey } from "./catalog";
import { createTranslator } from "./translator";

const permissionResourceKeys: Record<string, MessageKey> = {
  attendance: "i18n.admin.permissionResource.attendance",
  containers: "i18n.admin.permissionResource.containers",
  corrections: "i18n.admin.permissionResource.corrections",
  imports: "i18n.admin.permissionResource.imports",
  inventory: "i18n.admin.permissionResource.inventory",
  labels: "i18n.admin.permissionResource.labels",
  load_jobs: "i18n.admin.permissionResource.loadJobs",
  parser_profiles: "i18n.admin.permissionResource.parserProfiles",
  reports: "i18n.admin.permissionResource.reports",
  roles: "i18n.admin.permissionResource.roles",
  scan: "i18n.admin.permissionResource.scan",
  settings: "i18n.admin.permissionResource.settings",
  unloading_summary: "i18n.admin.permissionResource.unloadingSummary",
  unloading_wage: "i18n.admin.permissionResource.unloadingWage",
  users: "i18n.admin.permissionResource.users",
};

const permissionActionKeys: Record<string, MessageKey> = {
  adjust: "i18n.admin.permissionAction.adjust",
  approve: "i18n.admin.permissionAction.approve",
  classify: "i18n.admin.permissionAction.classify",
  complete: "i18n.admin.permissionAction.complete",
  create: "i18n.admin.permissionAction.create",
  delete: "i18n.admin.permissionAction.delete",
  export: "i18n.admin.permissionAction.export",
  generate: "i18n.admin.permissionAction.generate",
  manage: "i18n.admin.permissionAction.manage",
  parse: "i18n.admin.permissionAction.parse",
  read: "i18n.admin.permissionAction.read",
  review: "i18n.admin.permissionAction.review",
  reprint: "i18n.admin.permissionAction.reprint",
  reverse: "i18n.admin.permissionAction.reverse",
  scan: "i18n.admin.permissionAction.scan",
  settle: "i18n.admin.permissionAction.settle",
  train: "i18n.admin.permissionAction.train",
  update: "i18n.admin.permissionAction.update",
};

export function permissionCategoryLabel(
  category: string | null | undefined,
  locale: Locale,
): string {
  const { t } = createTranslator(locale);
  return t(
    permissionResourceKeys[category?.trim() ?? ""] ??
      "i18n.admin.permissionResource.other",
  );
}

export function permissionDescriptionLabel(
  code: string | null | undefined,
  locale: Locale,
): string {
  const { format, t } = createTranslator(locale);
  if (code === "scan.create") {
    return t("i18n.admin.permissionScanCreate");
  }

  const [resource, action] = code?.trim().split(".") ?? [];
  const resourceKey = permissionResourceKeys[resource ?? ""];
  const actionKey = permissionActionKeys[action ?? ""];

  if (!resourceKey || !actionKey) {
    return t("i18n.admin.permissionDescriptionUnavailable");
  }

  return format("i18n.admin.permissionDescription", {
    action: t(actionKey),
    resource: t(resourceKey),
  });
}
