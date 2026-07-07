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
    /^Operational settings saved\. (.+) field\(s\) updated\.$/,
    (count) => `Operational settings saved. ${count} field(s) updated.`,
    (count) => `运营设置已保存。已更新 ${count} 个字段。`,
  ),
  dynamic(
    /^(.+) permissions saved\. Data was refreshed from API\.$/,
    (value) => `${value} permissions saved. Data was refreshed from API.`,
    (value) => `${value} 权限已保存。数据已从 API 刷新。`,
  ),
  dynamic(
    /^(.+) saved\. Data was refreshed from the API\.$/,
    (value) => `${value} saved. Data was refreshed from the API.`,
    (value) => `${value} 已保存。数据已从 API 刷新。`,
  ),
  dynamic2(
    /^Label PDF regenerated\. Print supplemental label\(s\) (.+) for (.+)\.$/,
    (range, destination) =>
      `Label PDF regenerated. Print supplemental label(s) ${range} for ${destination}.`,
    (range, destination) => `面单 PDF 已重新生成。请为 ${destination} 打印补充面单 ${range}。`,
  ),
  dynamic(
    /^(.+) must be a whole number of 0 or greater\.$/,
    (label) => `${label} must be a whole number of 0 or greater.`,
    (label) => `${label} 必须是大于或等于 0 的整数。`,
  ),
  dynamic(
    /^(.+) must be 0 or greater\.$/,
    (label) => `${label} must be 0 or greater.`,
    (label) => `${label} 必须大于或等于 0。`,
  ),
  dynamic(
    /^(.+) must be a number of 0 or greater\.$/,
    (label) => `${label} must be a number of 0 or greater.`,
    (label) => `${label} 必须是大于或等于 0 的数字。`,
  ),
  dynamic(
    /^(.+) must be greater than 0\.$/,
    (label) => `${label} must be greater than 0.`,
    (label) => `${label} 必须大于 0。`,
  ),
  dynamic(
    /^(.+) is running\.$/,
    (value) => `${value} is running.`,
    (value) => `${value} 正在运行。`,
  ),
  dynamic(
    /^Reprint audit recorded for (.+) pallet labels?\.$/,
    (count) => `Reprint audit recorded for ${count} pallet labels.`,
    (count) => `已为 ${count} 张托盘面单记录补打审计。`,
  ),
  dynamic(
    /^Destination (.+) requires a destination code\.$/,
    (index) => `Destination ${index} requires a destination code.`,
    (index) => `目的仓 ${index} 必须填写目的仓代码。`,
  ),
  dynamic2(
    /^(.+) destination must match Destination region (.+)\.$/,
    (label, region) => `${label} destination must match Destination region ${region}.`,
    (label, region) => `${label} 的目的仓必须匹配目的仓区域 ${region}。`,
  ),
  dynamic(
    /^(.+) requires source text or container number\.$/,
    (label) => `${label} requires source text or container number.`,
    (label) => `${label} 必须填写来源文本或柜号。`,
  ),
  dynamic(
    /^(.+) requires planned pallets or source text ending with a pallet count such as -5P\.$/,
    (label) =>
      `${label} requires planned pallets or source text ending with a pallet count such as -5P.`,
    (label) => `${label} 必须填写计划托数，或填写以 -5P 这类托数结尾的来源文本。`,
  ),
  dynamic(
    /^(.+) system pallets must be greater than 0\.$/,
    (label) => `${label} system pallets must be greater than 0.`,
    (label) => `${label} 的系统托盘数必须大于 0。`,
  ),
  dynamic(
    /^API request failed with HTTP status (.+)\.$/,
    (status) => `API request failed with HTTP status ${status}.`,
    (status) => `API 请求失败，HTTP 状态：${status}。`,
  ),
  dynamic(
    /^Created (.+)\.$/,
    (value) => `Created ${value}.`,
    (value) => `已创建 ${value}。`,
  ),
  dynamic(
    /^Deleted (.+)\.$/,
    (value) => `Deleted ${value}.`,
    (value) => `已删除 ${value}。`,
  ),
  dynamic(
    /^Saved (.+)\.$/,
    (value) => `Saved ${value}.`,
    (value) => `已保存 ${value}。`,
  ),
  dynamic(
    /^Published (.+)\.$/,
    (value) => `Published ${value}.`,
    (value) => `已发布 ${value}。`,
  ),
  dynamic(
    /^Uploaded (.+)\.$/,
    (value) => `Uploaded ${value}.`,
    (value) => `已上传 ${value}。`,
  ),
  dynamic(
    /^Parsed (.+) employee-day row\(s\)\.$/,
    (count) => `Parsed ${count} employee-day row(s).`,
    (count) => `已解析 ${count} 条员工日工时行。`,
  ),
  dynamic(
    /^Generated summary export (.+)\.$/,
    (value) => `Generated summary export ${value}.`,
    (value) => `已生成汇总导出 ${value}。`,
  ),
  dynamic(
    /^Generated settlement (.+)\.$/,
    (value) => `Generated settlement ${value}.`,
    (value) => `已生成结算 ${value}。`,
  ),
  dynamic(
    /^(.+) marked completed\.$/,
    (value) => `${value} marked completed.`,
    (value) => `${value} 已标记完成。`,
  ),
  dynamic(
    /^Scan saved as pending for load job (.+)\. Inventory will not change until sync succeeds\.$/,
    (value) =>
      `Scan saved as pending for load job ${value}. Inventory will not change until sync succeeds.`,
    (value) => `扫码已保存为装车任务 ${value} 的待同步记录。同步成功前库存不会变化。`,
  ),
  dynamic(
    /^Dock saved: (.+)$/,
    (value) => `Dock saved: ${value}`,
    (value) => `月台已保存：${value}`,
  ),
  dynamic(
    /^Load job completed by (.+)\.$/,
    (value) => `Load job completed by ${value}.`,
    (value) => `装车任务已由 ${value} 完成。`,
  ),
  dynamic(
    /^Legacy unloader "(.+)" must be reselected from the temporary unloader directory before saving\.$/,
    (value) =>
      `Legacy unloader "${value}" must be reselected from the temporary unloader directory before saving.`,
    (value) => `旧拆柜人 "${value}" 保存前必须从临时拆柜工目录重新选择。`,
  ),
  dynamic(
    /^Duplicate unloader: (.+)\.$/,
    (value) => `Duplicate unloader: ${value}.`,
    (value) => `重复拆柜人：${value}。`,
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

function dynamic2(
  source: RegExp,
  en: (left: string, right: string) => string,
  zh: (left: string, right: string) => string,
) {
  return {
    source,
    render: {
      en: (match: RegExpMatchArray) => en(match[1] ?? "", match[2] ?? ""),
      "zh-CN": (match: RegExpMatchArray) =>
        zh(match[1] ?? "", match[2] ?? ""),
    },
  };
}
