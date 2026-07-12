"use client";

import { useMemo, useState, useTransition } from "react";
import {
  ApiClientError,
  type OperationalSettingFieldResponse,
  type OperationalSettingsResponse,
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
}: {
  canEdit: boolean;
  initialSettings: OperationalSettingsResponse;
}) {
  const { format, locale, t } = useI18n();
  const isHydrated = useClientHydrated();
  const [settings, setSettings] = useState(initialSettings);
  const [draft, setDraft] = useState(() => valuesFromFields(initialSettings.fields));
  const [notice, setNotice] = useState<SaveNotice | null>(null);
  const [isPending, startTransition] = useTransition();
  const groupedFields = useMemo(
    () => groupFields(settings.fields),
    [settings.fields],
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
  const { format, locale } = useI18n();
  const disabled = !canEdit || !isHydrated || !field.editable;
  const commonClassName =
    "mt-2 min-h-11 w-full border border-zinc-300 bg-white px-3 text-sm text-zinc-950 outline-none focus:border-teal-700 disabled:bg-zinc-100 disabled:text-zinc-500";

  return (
    <label className="grid gap-1 text-sm text-zinc-700">
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
        <input
          className={commonClassName}
          disabled={disabled}
          max={field.max}
          min={field.min}
          onChange={(event) => onChange(field.key, event.target.value)}
          type={field.inputType === "number" ? "number" : "text"}
          value={value}
        />
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
  return code === "FORBIDDEN"
    ? "Permission denied"
    : "Operational settings could not be saved.";
}

interface SaveNotice {
  code?: string;
  message: string;
  status: "error" | "running" | "success";
}
