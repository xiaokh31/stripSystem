"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ApiClientError,
  type OperationalSettingFieldResponse,
  type OperationalSettingsResponse,
  type PalletPolicySnapshotResponse,
  updateOperationalSettings,
} from "@/lib/api-client";
import { useI18n } from "@/components/i18n/i18n-provider";
import { formatOperationalDateTime } from "@/lib/date-time";
import {
  operationalSettingCategoryLabel,
  operationalSettingFieldDescription,
  operationalSettingFieldLabel,
  operationalSettingOptionLabel,
} from "@/lib/i18n/operational-settings-labels";
import type { Locale, MessageKey } from "@/lib/i18n/catalog";
import { createTranslator } from "@/lib/i18n/translator";
import { useClientHydrated } from "@/lib/use-client-hydrated";

export function OperationalSettingsForm({
  canEdit,
  initialSettings,
  palletPolicy,
}: {
  canEdit: boolean;
  initialSettings: OperationalSettingsResponse;
  palletPolicy: PalletPolicySnapshotResponse;
}) {
  const { format, locale, t } = useI18n();
  const isHydrated = useClientHydrated();
  const [settings, setSettings] = useState(initialSettings);
  const [policy, setPolicy] = useState(palletPolicy);
  const [draft, setDraft] = useState(() => valuesFromFields(initialSettings.fields));
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [isPending, startTransition] = useTransition();
  const palletFields = settings.fields.filter(
    (field) => field.key === "palletLengthM" || field.key === "palletWidthM",
  );
  const groupedFields = useMemo(
    () => groupFields(settings.fields.filter((field) => !palletFields.includes(field))),
    [palletFields, settings.fields],
  );

  function updateDraft(key: string, value: string) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function resetDraft() {
    setDraft(valuesFromFields(settings.fields));
    setNotice(null);
  }

  function resetToDefaults() {
    setDraft(
      Object.fromEntries(
        settings.fields.map((field) => [field.key, field.defaultValue]),
      ),
    );
    setNotice({
      message: t("i18n.settings.defaultsStaged"),
      status: "success",
    });
  }

  function save() {
    if (!canEdit || !isHydrated || isPending) {
      return;
    }

    startTransition(() => {
      void saveSettings();
    });

    async function saveSettings() {
      setNotice({ message: t("Saving operational settings."), status: "running" });
      try {
        const response = await updateOperationalSettings({
          values: editableValuesFromDraft(settings.fields, draft),
        });
        setSettings(response.settings);
        setPolicy(response.palletPolicy);
        setDraft(valuesFromFields(response.settings.fields));
        setNotice({
          message: format("i18n.settings.updatedFields", {
            count: response.audit.changedKeys.length,
          }),
          status: "success",
        });
      } catch (error) {
        setNotice(toSaveNotice(error, locale));
      }
    }
  }

  return (
    <section className="border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-zinc-950">
            {t("Editable operational settings")}
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
            {t(
              "Values are loaded from the Settings API and saved to the database. Role permissions decide who can edit them.",
            )}
          </p>
          <p className="mt-2 text-sm text-zinc-500">
            {t("Last saved:")}{" "}
            <span className="font-semibold text-zinc-800">
              {settings.updatedAt
                ? formatOperationalDateTime(settings.updatedAt)
                : t("Not saved yet")}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
            disabled={!isHydrated || isPending}
            onClick={resetDraft}
            type="button"
          >
            {t("Reset draft")}
          </button>
          {canEdit ? (
            <button
              className="inline-flex min-h-10 items-center border border-zinc-300 bg-white px-4 text-sm font-semibold text-zinc-950 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500"
              disabled={!isHydrated || isPending}
              onClick={resetToDefaults}
              type="button"
            >
              {t("Stage defaults")}
            </button>
          ) : null}
          <button
            className="inline-flex min-h-10 items-center border border-teal-700 bg-teal-700 px-4 text-sm font-semibold text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500"
            disabled={!canEdit || !isHydrated || isPending}
            onClick={save}
            type="button"
          >
            {isPending ? t("Saving") : t("Save settings")}
          </button>
        </div>
      </div>

      {!canEdit ? (
        <p className="mt-4 border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-950">
          {t("You can view operational settings, but your role cannot edit them.")}
        </p>
      ) : null}

      {notice ? <SaveNoticePanel notice={notice} /> : null}

      <section
        className="mt-5 border border-teal-200 bg-teal-50 p-4"
        data-testid="pallet-calculation-section"
      >
        <h3 className="text-sm font-semibold text-zinc-950">
          {t("i18n.settings.palletCalculation.title")}
        </h3>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
          {t("i18n.settings.palletCalculation.description")}
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {palletFields.map((field) => (
            <SettingInput
              canEdit={canEdit}
              field={field}
              isHydrated={isHydrated}
              key={field.key}
              onChange={updateDraft}
              value={draft[field.key] ?? field.value}
            />
          ))}
        </div>
        <dl className="mt-4 grid gap-3 border-t border-teal-200 pt-4 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <dt className="font-medium text-zinc-700">
              {format("i18n.settings.palletCalculation.capacity", {
                height: policy.lowHeightM,
              })}
            </dt>
            <dd
              className="mt-1 text-lg font-semibold text-zinc-950"
              data-testid="pallet-low-height-capacity"
            >
              {policy.lowHeightCapacityCbm} {t("i18n.settings.unitCbm")}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="font-medium text-zinc-700">
              {format("i18n.settings.palletCalculation.capacity", {
                height: policy.otherHeightM,
              })}
            </dt>
            <dd
              className="mt-1 text-lg font-semibold text-zinc-950"
              data-testid="pallet-other-height-capacity"
            >
              {policy.otherDestinationCapacityCbm} {t("i18n.settings.unitCbm")}
            </dd>
          </div>
        </dl>
        <p className="mt-4 max-w-4xl text-sm leading-6 text-zinc-700">
          {format("i18n.settings.palletCalculation.fixedRule", {
            count: policy.yeg1ExtraPallets,
          })}
        </p>
      </section>

      <div className="mt-5 grid gap-5">
        {groupedFields.map((section) => (
          <section
            className="border border-zinc-200 bg-zinc-50 p-4"
            key={section.category}
          >
            <h3 className="text-sm font-semibold uppercase text-zinc-600">
              {operationalSettingCategoryLabel(section.category, locale)}
            </h3>
            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              {section.fields.map((field) => (
                <SettingInput
                  canEdit={canEdit}
                  field={field}
                  isHydrated={isHydrated}
                  key={field.key}
                  onChange={updateDraft}
                  value={draft[field.key] ?? field.value}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}

function SettingInput({
  canEdit,
  field,
  isHydrated,
  onChange,
  value,
}: {
  canEdit: boolean;
  field: OperationalSettingFieldResponse;
  isHydrated: boolean;
  onChange: (key: string, value: string) => void;
  value: string;
}) {
  const { format, locale, t } = useI18n();
  const disabled = !canEdit || !isHydrated || !field.editable;
  const isPalletDimension =
    field.key === "palletLengthM" || field.key === "palletWidthM";
  const commonClassName =
    "mt-2 min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 disabled:bg-zinc-100 disabled:text-zinc-500";

  return (
    <label className="grid min-w-0 gap-1 text-sm text-zinc-700">
      <span className="font-semibold text-zinc-950">
        {operationalSettingFieldLabel(field.key, locale)}
      </span>
      <span className="leading-5 text-zinc-500">
        {operationalSettingFieldDescription(field.key, locale)}
      </span>
      {field.inputType === "select" ? (
        <select
          className={commonClassName}
          disabled={disabled}
          onChange={(event) => onChange(field.key, event.target.value)}
          value={value}
        >
          {(field.options ?? []).map((option) => (
            <option key={option.value} value={option.value}>
              {operationalSettingOptionLabel(field.key, option.value, locale)}
            </option>
          ))}
        </select>
      ) : field.inputType === "textarea" ? (
        <textarea
          className={`${commonClassName} min-h-24 py-3 leading-6`}
          disabled={disabled}
          onChange={(event) => onChange(field.key, event.target.value)}
          value={value}
        />
      ) : (
        <div
          className="relative min-w-0"
          data-testid={isPalletDimension ? "pallet-dimension-control" : undefined}
        >
          <input
            className={`${commonClassName} ${isPalletDimension ? "pr-12" : ""}`}
            data-testid={
              field.key === "palletLengthM"
                ? "pallet-length-input"
                : field.key === "palletWidthM"
                  ? "pallet-width-input"
                  : undefined
            }
            disabled={disabled}
            max={field.max}
            min={field.min}
            onChange={(event) => onChange(field.key, event.target.value)}
            step={isPalletDimension ? "0.001" : undefined}
            type={field.inputType === "number" ? "number" : "text"}
            value={value}
          />
          {isPalletDimension ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500">
              {t("i18n.settings.unitMeter")}
            </span>
          ) : null}
        </div>
      )}
      <span className="text-xs text-zinc-500">
        {format("i18n.settings.defaultValue", {
          value:
            field.inputType === "select"
              ? operationalSettingOptionLabel(
                  field.key,
                  field.defaultValue,
                  locale,
                )
              : field.defaultValue,
        })}
        {field.updatedAt ? (
          <>
            {" "}
            {format("i18n.settings.fieldSavedAt", {
              date: formatOperationalDateTime(field.updatedAt),
            })}
          </>
        ) : null}
      </span>
    </label>
  );
}

function SaveNoticePanel({ notice }: { notice: SaveNotice }) {
  const isError = notice.status === "error";
  return (
    <div
      className={[
        "mt-4 border p-3 text-sm font-medium",
        isError
          ? "border-red-200 bg-red-50 text-red-950"
          : notice.status === "running"
            ? "border-amber-200 bg-amber-50 text-amber-950"
            : "border-emerald-200 bg-emerald-50 text-emerald-950",
      ].join(" ")}
      role={isError ? "alert" : "status"}
    >
      <p>{notice.message}</p>
      {notice.code ? (
        <p
          className="mt-1 text-xs font-semibold uppercase"
          data-i18n-ignore="true"
        >
          {notice.code}
        </p>
      ) : null}
    </div>
  );
}

function valuesFromFields(
  fields: OperationalSettingFieldResponse[],
): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, field.value]));
}

function editableValuesFromDraft(
  fields: OperationalSettingFieldResponse[],
  draft: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    fields
      .filter((field) => field.editable)
      .map((field) => [field.key, draft[field.key] ?? field.value]),
  );
}

function groupFields(fields: OperationalSettingFieldResponse[]) {
  const groups = new Map<string, OperationalSettingFieldResponse[]>();
  for (const field of fields) {
    groups.set(field.category, [...(groups.get(field.category) ?? []), field]);
  }
  return Array.from(groups, ([category, grouped]) => ({
    category,
    fields: grouped,
  }));
}

function toSaveNotice(error: unknown, locale: Locale): SaveNotice {
  const { t } = createTranslator(locale);

  if (error instanceof ApiClientError) {
    return {
      code: error.code,
      message: t(settingsSaveErrorMessageKey(error.code)),
      status: "error",
    };
  }

  return {
    code: "SETTINGS_SAVE_FAILED",
    message: t("Operational settings could not be saved."),
    status: "error",
  };
}

function settingsSaveErrorMessageKey(code: string): MessageKey {
  if (code === "FORBIDDEN") return "Permission denied";
  if (code === "PALLET_DIMENSION_INVALID") {
    return "i18n.settings.palletCalculation.dimensionInvalid";
  }
  return "Operational settings could not be saved.";
}

interface SaveNotice {
  code?: string;
  message: string;
  status: "error" | "running" | "success";
}
