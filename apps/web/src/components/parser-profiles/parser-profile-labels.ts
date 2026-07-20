import type { MessageKey } from "@/lib/i18n/catalog";
import type {
  ParserProfileLifecycle,
  ParserProfileTrustState,
} from "@/lib/api-client";
import { parserFieldLabel } from "../parser-learning/parser-learning-labels";
import type { ParserCanonicalField } from "../parser-learning/parser-learning-flow";

type Translate = (key: MessageKey) => string;

export type ParserProfileAction = "approve" | "fork" | "pause" | "resume" | "retire";

export function lifecycleKey(value: ParserProfileLifecycle): MessageKey {
  return `i18n.parserProfiles.lifecycle.${value}` as MessageKey;
}

export function trustKey(value: ParserProfileTrustState): MessageKey {
  return `i18n.parserProfiles.trust.${value}` as MessageKey;
}

export function eligibilityKey(code: string): MessageKey {
  if (code.includes("SOURCE")) return "i18n.parserProfiles.code.source";
  if (code.includes("SNAPSHOT") || code.includes("COMPLETION")) {
    return "i18n.parserProfiles.code.snapshot";
  }
  if (code.includes("PROVENANCE")) {
    return "i18n.parserProfiles.code.provenance";
  }
  if (code.includes("CONFLICT")) return "i18n.parserProfiles.code.conflict";
  if (code.includes("STALE") || code.includes("REVISION")) {
    return "i18n.parserProfiles.code.stale";
  }
  if (code.includes("REPLAY")) return "i18n.parserProfiles.code.replay";
  return "i18n.parserProfiles.code.generic";
}

export function availableParserProfileActions(
  lifecycle: ParserProfileLifecycle,
  eligible: boolean,
  canApprove: boolean,
  canTrain: boolean,
): ParserProfileAction[] {
  const actions: ParserProfileAction[] = [];
  if (lifecycle === "DRAFT" && eligible && canApprove) actions.push("approve");
  if (lifecycle === "ACTIVE" && canApprove) actions.push("pause", "retire");
  if (lifecycle === "PAUSED" && canApprove) actions.push("resume", "retire");
  if (lifecycle !== "DRAFT" && canTrain) actions.push("fork");
  return actions;
}

export function parserProfileErrorKey(code: string): MessageKey {
  if (code === "REASON_REQUIRED") return "i18n.parserProfiles.reasonRequired";
  if (code === "FORBIDDEN" || code.includes("FORBIDDEN")) {
    return "i18n.parserProfiles.forbidden";
  }
  if (code.includes("STALE") || code.includes("REVISION")) {
    return "i18n.parserProfiles.code.stale";
  }
  if (code.includes("CONFLICT")) return "i18n.parserProfiles.code.conflict";
  return "i18n.parserProfiles.actionFailed";
}

export function parserProfileMappedFieldLabel(
  value: string,
  t: Translate,
): string {
  if (isParserField(value)) return parserFieldLabel(value, t);
  return t("i18n.parserProfiles.additionalMappedField");
}

export function parserProfileStructuralAnchors(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const anchors = (value as Record<string, unknown>).anchors;
  if (!Array.isArray(anchors)) return [];
  return anchors.flatMap((anchor) => {
    if (typeof anchor === "string" && anchor.trim()) return [anchor.trim()];
    if (!anchor || typeof anchor !== "object" || Array.isArray(anchor)) return [];
    const label = (anchor as Record<string, unknown>).value;
    return typeof label === "string" && label.trim() ? [label.trim()] : [];
  });
}

function isParserField(value: string): value is ParserCanonicalField | "containerNo" {
  return [
    "cartons",
    "containerNo",
    "deliveryMethod",
    "destinationCode",
    "note",
    "packageType",
    "poNumber",
    "volumeCbm",
    "waybillNo",
  ].includes(value);
}
