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

export type LocaleMessages = typeof enMessages;

export const I18N_DYNAMIC_TRANSLATIONS: Array<{
  source: RegExp;
  render: Record<Locale, (match: RegExpMatchArray) => string>;
}> = [
  {
    source: /^(\d+) pallet$/,
    render: {
      en: (match) => `${match[1]} pallet`,
      "zh-CN": (match) => `${match[1]} 托`,
    },
  },
  {
    source: /^(\d+) pallets$/,
    render: {
      en: (match) => `${match[1]} pallets`,
      "zh-CN": (match) => `${match[1]} 托`,
    },
  },
  {
    source: /^(\d+) 托$/,
    render: {
      en: (match) => `${match[1]} pallets`,
      "zh-CN": (match) => `${match[1]} 托`,
    },
  },
  {
    source: /^(\d+) active filter$/,
    render: {
      en: (match) => `${match[1]} active filter`,
      "zh-CN": (match) => `${match[1]} 个筛选条件`,
    },
  },
  {
    source: /^(\d+) active filters$/,
    render: {
      en: (match) => `${match[1]} active filters`,
      "zh-CN": (match) => `${match[1]} 个筛选条件`,
    },
  },
  {
    source: /^(\d+) 个筛选条件$/,
    render: {
      en: (match) => `${match[1]} active filters`,
      "zh-CN": (match) => `${match[1]} 个筛选条件`,
    },
  },
  {
    source: /^Signed in as (.+)\.$/,
    render: {
      en: (match) => `Signed in as ${match[1]}.`,
      "zh-CN": (match) => `当前登录：${match[1]}。`,
    },
  },
  {
    source: /^当前登录：(.+)。$/,
    render: {
      en: (match) => `Signed in as ${match[1]}.`,
      "zh-CN": (match) => `当前登录：${match[1]}。`,
    },
  },
  {
    source: /^Loaded by (.+)$/,
    render: {
      en: (match) => `Loaded by ${match[1]}`,
      "zh-CN": (match) => `装车人：${match[1]}`,
    },
  },
  {
    source: /^装车人：(.+)$/,
    render: {
      en: (match) => `Loaded by ${match[1]}`,
      "zh-CN": (match) => `装车人：${match[1]}`,
    },
  },
  {
    source: /^Requested load job: (.+)$/,
    render: {
      en: (match) => `Requested load job: ${match[1]}`,
      "zh-CN": (match) => `请求的装车任务：${match[1]}`,
    },
  },
  {
    source: /^请求的装车任务：(.+)$/,
    render: {
      en: (match) => `Requested load job: ${match[1]}`,
      "zh-CN": (match) => `请求的装车任务：${match[1]}`,
    },
  },
];
