import { enMessages } from "./locales/en";
import { zhMessages } from "./locales/zh";

export const SUPPORTED_LOCALES = ["en", "zh-CN"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE_NAME = "bestar_locale";

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  "zh-CN": "中文",
};

export const LOCALE_MESSAGES = {
  en: enMessages,
  "zh-CN": zhMessages,
} as const;

export const I18N_DYNAMIC_TRANSLATIONS: Array<{
  source: RegExp;
  render: Record<Locale, (match: RegExpMatchArray) => string>;
}> = [
  dynamic(/^(\d+) pallet$/, (count) => `${count} pallet`, (count) => `${count} 托`),
  dynamic(/^(\d+) pallets$/, (count) => `${count} pallets`, (count) => `${count} 托`),
  dynamic(/^(\d+) 托$/, (count) => `${count} pallets`, (count) => `${count} 托`),
  dynamic(/^(\d+) active filter$/, (count) => `${count} active filter`, (count) => `${count} 个筛选条件`),
  dynamic(/^(\d+) active filters$/, (count) => `${count} active filters`, (count) => `${count} 个筛选条件`),
  dynamic(/^(\d+) 个筛选条件$/, (count) => `${count} active filters`, (count) => `${count} 个筛选条件`),
  dynamic(
    /^Signed in as (.+)\.$/,
    (value) => `Signed in as ${value}.`,
    (value) => `当前登录：${value}。`,
  ),
  dynamic(
    /^当前登录：(.+)。$/,
    (value) => `Signed in as ${value}.`,
    (value) => `当前登录：${value}。`,
  ),
  dynamic(/^Loaded by (.+)$/, (value) => `Loaded by ${value}`, (value) => `装车人：${value}`),
  dynamic(/^装车人：(.+)$/, (value) => `Loaded by ${value}`, (value) => `装车人：${value}`),
  dynamic(
    /^Requested load job: (.+)$/,
    (value) => `Requested load job: ${value}`,
    (value) => `请求的装车任务：${value}`,
  ),
  dynamic(
    /^请求的装车任务：(.+)$/,
    (value) => `Requested load job: ${value}`,
    (value) => `请求的装车任务：${value}`,
  ),
  dynamic(
    /^Operational settings saved\. (\d+) field\(s\) updated\.$/,
    (count) => `Operational settings saved. ${count} field(s) updated.`,
    (count) => `运营设置已保存。已更新 ${count} 个字段。`,
  ),
];

function dynamic(
  source: RegExp,
  en: (value: string) => string,
  zh: (value: string) => string,
) {
  return {
    source,
    render: {
      en: (match: RegExpMatchArray) => en(match[1] ?? ""),
      "zh-CN": (match: RegExpMatchArray) => zh(match[1] ?? ""),
    },
  };
}
