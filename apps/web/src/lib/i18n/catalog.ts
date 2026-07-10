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
  dynamic(
    /^(\d+) pallet$/,
    (count) => `${count} pallet`,
    (count) => `${count} 托`,
  ),
  dynamic(
    /^(\d+) pallets$/,
    (count) => `${count} pallets`,
    (count) => `${count} 托`,
  ),
  dynamic(
    /^(\d+) 托$/,
    (count) => `${count} pallets`,
    (count) => `${count} 托`,
  ),
  dynamic(
    /^(\d+) active filter$/,
    (count) => `${count} active filter`,
    (count) => `${count} 个筛选条件`,
  ),
  dynamic(
    /^(\d+) active filters$/,
    (count) => `${count} active filters`,
    (count) => `${count} 个筛选条件`,
  ),
  dynamic(
    /^(\d+) 个筛选条件$/,
    (count) => `${count} active filters`,
    (count) => `${count} 个筛选条件`,
  ),
  dynamic4(
    /^Package (.+) · (.+) · Basis (.+) CBM · Rounding (.+)$/,
    (packageType, rule, basis, rounding) =>
      `Package ${containerPackageLabel(packageType, "en")} · ${palletRuleLabel(rule, "en")} · Basis ${basis} CBM · Rounding ${roundingLabel(rounding, "en")}`,
    (packageType, rule, basis, rounding) =>
      `包装：${containerPackageLabel(packageType, "zh-CN")} · ${palletRuleLabel(rule, "zh-CN")} · 基准 ${basis} CBM · ${roundingLabel(rounding, "zh-CN")}`,
  ),
  dynamic4(
    /^包装：(.+) · (.+) · 基准 (.+) CBM · (.+)$/,
    (packageType, rule, basis, rounding) =>
      `Package ${containerPackageLabel(packageType, "en")} · ${palletRuleLabel(rule, "en")} · Basis ${basis} CBM · Rounding ${roundingLabel(rounding, "en")}`,
    (packageType, rule, basis, rounding) =>
      `包装：${containerPackageLabel(packageType, "zh-CN")} · ${palletRuleLabel(rule, "zh-CN")} · 基准 ${basis} CBM · ${roundingLabel(rounding, "zh-CN")}`,
  ),
  dynamic3(
    /^Package (.+) · (.+) · Rounding (.+)$/,
    (packageType, rule, rounding) =>
      `Package ${containerPackageLabel(packageType, "en")} · ${palletRuleLabel(rule, "en")} · Rounding ${roundingLabel(rounding, "en")}`,
    (packageType, rule, rounding) =>
      `包装：${containerPackageLabel(packageType, "zh-CN")} · ${palletRuleLabel(rule, "zh-CN")} · ${roundingLabel(rounding, "zh-CN")}`,
  ),
  dynamic3(
    /^包装：(.+) · (.+) · (.+)$/,
    (packageType, rule, rounding) =>
      `Package ${containerPackageLabel(packageType, "en")} · ${palletRuleLabel(rule, "en")} · Rounding ${roundingLabel(rounding, "en")}`,
    (packageType, rule, rounding) =>
      `包装：${containerPackageLabel(packageType, "zh-CN")} · ${palletRuleLabel(rule, "zh-CN")} · ${roundingLabel(rounding, "zh-CN")}`,
  ),
  dynamic3(
    /^(.+) · Basis (.+) CBM · Rounding (.+)$/,
    (rule, basis, rounding) =>
      `${palletRuleLabel(rule, "en")} · Basis ${basis} CBM · Rounding ${roundingLabel(rounding, "en")}`,
    (rule, basis, rounding) =>
      `${palletRuleLabel(rule, "zh-CN")} · 基准 ${basis} CBM · ${roundingLabel(rounding, "zh-CN")}`,
  ),
  dynamic3(
    /^(.+) · 基准 (.+) CBM · (.+)$/,
    (rule, basis, rounding) =>
      `${palletRuleLabel(rule, "en")} · Basis ${basis} CBM · Rounding ${roundingLabel(rounding, "en")}`,
    (rule, basis, rounding) =>
      `${palletRuleLabel(rule, "zh-CN")} · 基准 ${basis} CBM · ${roundingLabel(rounding, "zh-CN")}`,
  ),
  dynamic2(
    /^(.+) (\d+)x$/,
    (message, count) => `${containerIssueMessage(message, "en")}  ${count}x`,
    (message, count) => `${containerIssueMessage(message, "zh-CN")}（${count} 次）`,
  ),
  dynamic2(
    /^(.+)（(\d+) 次）$/,
    (message, count) => `${containerIssueMessage(message, "en")}  ${count}x`,
    (message, count) => `${containerIssueMessage(message, "zh-CN")}（${count} 次）`,
  ),
  dynamic2(
    /^Destination (.+) volume is zero with (.+) carton\(s\); 0\.01 CBM was used for pallet calculation\.$/,
    (destination, cartons) =>
      `Destination ${destination} volume is zero with ${cartons} carton(s); 0.01 CBM was used for pallet calculation.`,
    (destination, cartons) =>
      `目的仓 ${destination} 体积为 0，箱数 ${cartons}；已按 0.01 CBM 参与托盘计算。`,
  ),
  dynamic2(
    /^目的仓 (.+) 体积为 0，箱数 (.+)；已按 0\.01 CBM 参与托盘计算。$/,
    (destination, cartons) =>
      `Destination ${destination} volume is zero with ${cartons} carton(s); 0.01 CBM was used for pallet calculation.`,
    (destination, cartons) =>
      `目的仓 ${destination} 体积为 0，箱数 ${cartons}；已按 0.01 CBM 参与托盘计算。`,
  ),
  dynamic2(
    /^Row (.+) volume is zero with (.+) carton\(s\); 0\.01 CBM was used for pallet calculation\.$/,
    (row, cartons) =>
      `Row ${row} volume is zero with ${cartons} carton(s); 0.01 CBM was used for pallet calculation.`,
    (row, cartons) =>
      `第 ${row} 行体积为 0，箱数 ${cartons}；已按 0.01 CBM 参与托盘计算。`,
  ),
  dynamic2(
    /^第 (.+) 行体积为 0，箱数 (.+)；已按 0\.01 CBM 参与托盘计算。$/,
    (row, cartons) =>
      `Row ${row} volume is zero with ${cartons} carton(s); 0.01 CBM was used for pallet calculation.`,
    (row, cartons) =>
      `第 ${row} 行体积为 0，箱数 ${cartons}；已按 0.01 CBM 参与托盘计算。`,
  ),
  dynamic2(
    /^Could not parse numeric field (.+): (.+)$/,
    (field, value) => `Could not parse numeric field ${field}: ${value}`,
    (field, value) => `无法解析数字字段 ${field}：${value}`,
  ),
  dynamic2(
    /^无法解析数字字段 (.+)：(.+)$/,
    (field, value) => `Could not parse numeric field ${field}: ${value}`,
    (field, value) => `无法解析数字字段 ${field}：${value}`,
  ),
  dynamic(
    /^Showing (.+) latest records from the import API\.$/,
    (count) => `Showing ${count} latest records from the import API.`,
    (count) => `显示 ${count} 条来自导入 API 的最新记录。`,
  ),
  dynamic(
    /^显示 (.+) 条来自导入 API 的最新记录。$/,
    (count) => `Showing ${count} latest records from the import API.`,
    (count) => `显示 ${count} 条来自导入 API 的最新记录。`,
  ),
  dynamic(
    /^Showing (.+) latest records from the load job API\.$/,
    (count) => `Showing ${count} latest records from the load job API.`,
    (count) => `显示 ${count} 条来自装车任务 API 的最新记录。`,
  ),
  dynamic(
    /^显示 (.+) 条来自装车任务 API 的最新记录。$/,
    (count) => `Showing ${count} latest records from the load job API.`,
    (count) => `显示 ${count} 条来自装车任务 API 的最新记录。`,
  ),
  dynamic(
    /^Showing (.+) latest attendance workbook\(s\)\.$/,
    (count) => `Showing ${count} latest attendance workbook(s).`,
    (count) => `显示 ${count} 个最新考勤工作簿。`,
  ),
  dynamic(
    /^显示 (.+) 个最新考勤工作簿。$/,
    (count) => `Showing ${count} latest attendance workbook(s).`,
    (count) => `显示 ${count} 个最新考勤工作簿。`,
  ),
  dynamic2(
    /^Showing (.+) load jobs from offset (.+)\.$/,
    (count, offset) => `Showing ${count} load jobs from offset ${offset}.`,
    (count, offset) => `显示 ${count} 条装车任务，偏移量 ${offset}。`,
  ),
  dynamic2(
    /^显示 (.+) 条装车任务，偏移量 (.+)。$/,
    (count, offset) => `Showing ${count} load jobs from offset ${offset}.`,
    (count, offset) => `显示 ${count} 条装车任务，偏移量 ${offset}。`,
  ),
  dynamic2(
    /^Limit (.+), offset (.+)$/,
    (limit, offset) => `Limit ${limit}, offset ${offset}`,
    (limit, offset) => `每页 ${limit}，偏移量 ${offset}`,
  ),
  dynamic2(
    /^每页 (.+)，偏移量 (.+)$/,
    (limit, offset) => `Limit ${limit}, offset ${offset}`,
    (limit, offset) => `每页 ${limit}，偏移量 ${offset}`,
  ),
  dynamic(
    /^Unloaded \/ Loading in progress \/ Delivered to destination$/,
    () => "Unloaded / Loading in progress / Delivered to destination",
    () => "已拆完 / 装车中 / 已送库",
  ),
  dynamic(
    /^已拆完 \/ 装车中 \/ 已送库$/,
    () => "Unloaded / Loading in progress / Delivered to destination",
    () => "已拆完 / 装车中 / 已送库",
  ),
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
  dynamic(
    /^Loaded by (.+)$/,
    (value) => `Loaded by ${value}`,
    (value) => `装车人：${value}`,
  ),
  dynamic(
    /^装车人：(.+)$/,
    (value) => `Loaded by ${value}`,
    (value) => `装车人：${value}`,
  ),
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
    /^Last updated (.+)\. Inventory remaining is global warehouse inventory from the API, not load job planned remaining\.$/,
    (value) =>
      `Last updated ${value}. Inventory remaining is global warehouse inventory from the API, not load job planned remaining.`,
    (value) =>
      `最近更新 ${value}。剩余库存是 API 返回的全局仓库库存，不是装车任务计划剩余数。`,
  ),
  dynamic(
    /^最近更新 (.+)。剩余库存是 API 返回的全局仓库库存，不是装车任务计划剩余数。$/,
    (value) =>
      `Last updated ${value}. Inventory remaining is global warehouse inventory from the API, not load job planned remaining.`,
    (value) =>
      `最近更新 ${value}。剩余库存是 API 返回的全局仓库库存，不是装车任务计划剩余数。`,
  ),
  dynamic(
    /^Polling (.+)$/,
    (value) => `Polling ${value}`,
    (value) => `轮询 ${value}`,
  ),
  dynamic(
    /^轮询 (.+)$/,
    (value) => `Polling ${value}`,
    (value) => `轮询 ${value}`,
  ),
  dynamic(
    /^Roles: (.+)$/,
    (value) => `Roles: ${value}`,
    (value) => `角色：${value === "None" ? "无" : value}`,
  ),
  dynamic(
    /^角色：(.+)$/,
    (value) => `Roles: ${value === "无" ? "None" : value}`,
    (value) => `角色：${value === "None" ? "无" : value}`,
  ),
  dynamic(
    /^Mobile permissions: (.+)$/,
    (value) => `Mobile permissions: ${value}`,
    (value) => `移动端权限：${value === "Read only" ? "只读" : value}`,
  ),
  dynamic(
    /^移动端权限：(.+)$/,
    (value) => `Mobile permissions: ${value === "只读" ? "Read only" : value}`,
    (value) => `移动端权限：${value === "Read only" ? "只读" : value}`,
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
    (range, destination) =>
      `面单 PDF 已重新生成。请为 ${destination} 打印补充面单 ${range}。`,
  ),
  dynamic(
    /^(.+) must be a whole number of 0 or greater\.$/,
    (label) => `${label} must be a whole number of 0 or greater.`,
    (label) => `${label} 必须是大于或等于 0 的整数。`,
  ),
  dynamic(
    /^(.+) must be a whole number of 1 or greater\. Delete the destination row instead when there is no cargo\.$/,
    (label) =>
      `${label} must be a whole number of 1 or greater. Delete the destination row instead when there is no cargo.`,
    (label) => `${label} 必须是大于或等于 1 的整数。没有货时请删除目的仓行。`,
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
    (label, region) =>
      `${label} destination must match Destination region ${region}.`,
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
    (label) =>
      `${label} 必须填写计划托数，或填写以 -5P 这类托数结尾的来源文本。`,
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
    /^Delete destination (.+)\? This removes the destination from the actual unloading data and records an audit entry\.$/,
    (value) =>
      `Delete destination ${value}? This removes the destination from the actual unloading data and records an audit entry.`,
    (value) =>
      `删除目的仓 ${value}？这会从实际拆柜数据中移除该目的仓，并记录审计。`,
  ),
  dynamic(
    /^Delete import "(.+)" from active history\? This permanently removes the original uploaded file and all related generated storage files\. This action remains audited\.$/,
    (value) =>
      `Delete import "${value}" from active history? This permanently removes the original uploaded file and all related generated storage files. This action remains audited.`,
    (value) =>
      `从当前记录中删除导入 "${value}"？这会永久删除原始上传文件和所有关联生成文件，并保留审计记录。`,
  ),
  dynamic(
    /^This import already has business records and cannot be deleted\. Blockers: (.+)\.$/,
    (value) =>
      `This import already has business records and cannot be deleted. Blockers: ${value}.`,
    (value) => `此导入已有业务记录，不能删除。阻塞项：${value}。`,
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
    /^Upload (.+) files$/,
    (value) => `Upload ${value} files`,
    (value) => `上传 ${value} 个文件`,
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
    (value) =>
      `扫码已保存为装车任务 ${value} 的待同步记录。同步成功前库存不会变化。`,
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
  dynamic2(
    /^Issue (.+): (.+)$/,
    (index, value) => `Issue ${index}: ${value}`,
    (index, value) => `问题 ${index}：${value}`,
  ),
  dynamic(
    /^(.+) Existing pallets have already been assigned, loaded, marked unloaded, or entered loading, so the label PDF and pallet records cannot be rebuilt\.$/,
    (value) =>
      `${value} Existing pallets have already been assigned, loaded, marked unloaded, or entered loading, so the label PDF and pallet records cannot be rebuilt.`,
    (value) =>
      `${value} 已有托盘被分配、装车、标记已拆完或进入装车流程，因此无法重建面单 PDF 和托盘记录。`,
  ),
  dynamic(
    /^(.+) Use the scan correction workflow for loading changes, or work from a container that has not entered loading\.$/,
    (value) =>
      `${value} Use the scan correction workflow for loading changes, or work from a container that has not entered loading.`,
    (value) =>
      `${value} 装车变更请使用扫码更正流程，或改用尚未进入装车流程的柜子。`,
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
      "zh-CN": (match: RegExpMatchArray) => zh(match[1] ?? "", match[2] ?? ""),
    },
  };
}

function dynamic3(
  source: RegExp,
  en: (left: string, middle: string, right: string) => string,
  zh: (left: string, middle: string, right: string) => string,
) {
  return {
    source,
    render: {
      en: (match: RegExpMatchArray) =>
        en(match[1] ?? "", match[2] ?? "", match[3] ?? ""),
      "zh-CN": (match: RegExpMatchArray) =>
        zh(match[1] ?? "", match[2] ?? "", match[3] ?? ""),
    },
  };
}

function dynamic4(
  source: RegExp,
  en: (
    first: string,
    second: string,
    third: string,
    fourth: string,
  ) => string,
  zh: (
    first: string,
    second: string,
    third: string,
    fourth: string,
  ) => string,
) {
  return {
    source,
    render: {
      en: (match: RegExpMatchArray) =>
        en(
          match[1] ?? "",
          match[2] ?? "",
          match[3] ?? "",
          match[4] ?? "",
        ),
      "zh-CN": (match: RegExpMatchArray) =>
        zh(
          match[1] ?? "",
          match[2] ?? "",
          match[3] ?? "",
          match[4] ?? "",
        ),
    },
  };
}

const containerPackageLabels = {
  en: {
    "wooden crate": "wooden crate",
    carton: "carton",
    "木箱/木架": "wooden crate",
    纸箱: "carton",
  },
  "zh-CN": {
    "wooden crate": "木箱/木架",
    carton: "纸箱",
    "木箱/木架": "木箱/木架",
    纸箱: "纸箱",
  },
} satisfies Record<Locale, Record<string, string>>;

const palletRuleLabels = {
  en: {
    "1.7 CBM volume rule": "1.7 CBM volume rule",
    "2.2 CBM volume rule": "2.2 CBM volume rule",
    "Private/commercial carton volume rule":
      "Private/commercial carton volume rule",
    "Private/commercial wooden crate piece-count rule":
      "Private/commercial wooden crate piece-count rule",
    "Unknown destination 1.7 CBM review rule":
      "Unknown destination 1.7 CBM review rule",
    "YEG1 1.7 CBM plus 5 pallets rule":
      "YEG1 1.7 CBM plus 5 pallets rule",
    "1.7 CBM 按体积规则": "1.7 CBM volume rule",
    "2.2 CBM 按体积规则": "2.2 CBM volume rule",
    "YEG1 1.7 CBM 加 5 托规则": "YEG1 1.7 CBM plus 5 pallets rule",
    "未知目的仓 1.7 CBM 待复核规则":
      "Unknown destination 1.7 CBM review rule",
    "私人/商业地址木箱按件数规则":
      "Private/commercial wooden crate piece-count rule",
    "私人/商业地址纸箱按体积规则":
      "Private/commercial carton volume rule",
  },
  "zh-CN": {
    "1.7 CBM volume rule": "1.7 CBM 按体积规则",
    "2.2 CBM volume rule": "2.2 CBM 按体积规则",
    "Private/commercial carton volume rule": "私人/商业地址纸箱按体积规则",
    "Private/commercial wooden crate piece-count rule":
      "私人/商业地址木箱按件数规则",
    "Unknown destination 1.7 CBM review rule": "未知目的仓 1.7 CBM 待复核规则",
    "YEG1 1.7 CBM plus 5 pallets rule": "YEG1 1.7 CBM 加 5 托规则",
    "1.7 CBM 按体积规则": "1.7 CBM 按体积规则",
    "2.2 CBM 按体积规则": "2.2 CBM 按体积规则",
    "YEG1 1.7 CBM 加 5 托规则": "YEG1 1.7 CBM 加 5 托规则",
    "未知目的仓 1.7 CBM 待复核规则": "未知目的仓 1.7 CBM 待复核规则",
    "私人/商业地址木箱按件数规则": "私人/商业地址木箱按件数规则",
    "私人/商业地址纸箱按体积规则": "私人/商业地址纸箱按体积规则",
  },
} satisfies Record<Locale, Record<string, string>>;

const roundingLabels = {
  en: {
    up: "up",
    "by piece count": "by piece count",
    向上取整: "up",
    按件数计算: "by piece count",
  },
  "zh-CN": {
    up: "向上取整",
    "by piece count": "按件数计算",
    向上取整: "向上取整",
    按件数计算: "按件数计算",
  },
} satisfies Record<Locale, Record<string, string>>;

const containerIssueMessages = {
  en: {
    "Cartons are missing or zero.": "Cartons are missing or zero.",
    "Commercial or private address destination requires a waybill number.":
      "Commercial or private address destination requires a waybill number.",
    "Courier delivery is requested, but the delivery method or note does not specify a carrier such as UPS, Purolator, FedEx, Canpar, DHL, or Canada Post.":
      "Courier delivery is requested, but the delivery method or note does not specify a carrier such as UPS, Purolator, FedEx, Canpar, DHL, or Canada Post.",
    "Destination code is missing.": "Destination code is missing.",
    "Destination type was not recognized; pallet rule needs confirmation.":
      "Destination type was not recognized; pallet rule needs confirmation.",
    "Manual pallet override is negative; calculated pallet count was used instead.":
      "Manual pallet override is negative; calculated pallet count was used instead.",
    "Volume is missing.": "Volume is missing.",
    "Volume is zero while cartons are greater than zero; 0.01 CBM was used for pallet calculation.":
      "Volume is zero while cartons are greater than zero; 0.01 CBM was used for pallet calculation.",
    "0.01 CBM 已用于托盘计算，因为体积为 0 但箱数大于 0。":
      "Volume is zero while cartons are greater than zero; 0.01 CBM was used for pallet calculation.",
    "目的仓代码缺失。": "Destination code is missing.",
    "目的仓类型无法识别，托盘规则需要复核。":
      "Destination type was not recognized; pallet rule needs confirmation.",
    "商业或私人地址目的仓需要运单号。":
      "Commercial or private address destination requires a waybill number.",
    "已请求快递派送，但派送方式或备注未指定 UPS、Purolator、FedEx、Canpar、DHL 或 Canada Post 等承运商。":
      "Courier delivery is requested, but the delivery method or note does not specify a carrier such as UPS, Purolator, FedEx, Canpar, DHL, or Canada Post.",
    "手工托数为负数，已改用系统计算托数。":
      "Manual pallet override is negative; calculated pallet count was used instead.",
    "箱数缺失或为 0。": "Cartons are missing or zero.",
    "体积缺失。": "Volume is missing.",
  },
  "zh-CN": {
    "Cartons are missing or zero.": "箱数缺失或为 0。",
    "Commercial or private address destination requires a waybill number.":
      "商业或私人地址目的仓需要运单号。",
    "Courier delivery is requested, but the delivery method or note does not specify a carrier such as UPS, Purolator, FedEx, Canpar, DHL, or Canada Post.":
      "已请求快递派送，但派送方式或备注未指定 UPS、Purolator、FedEx、Canpar、DHL 或 Canada Post 等承运商。",
    "Destination code is missing.": "目的仓代码缺失。",
    "Destination type was not recognized; pallet rule needs confirmation.":
      "目的仓类型无法识别，托盘规则需要复核。",
    "Manual pallet override is negative; calculated pallet count was used instead.":
      "手工托数为负数，已改用系统计算托数。",
    "Volume is missing.": "体积缺失。",
    "Volume is zero while cartons are greater than zero; 0.01 CBM was used for pallet calculation.":
      "0.01 CBM 已用于托盘计算，因为体积为 0 但箱数大于 0。",
    "0.01 CBM 已用于托盘计算，因为体积为 0 但箱数大于 0。":
      "0.01 CBM 已用于托盘计算，因为体积为 0 但箱数大于 0。",
    "目的仓代码缺失。": "目的仓代码缺失。",
    "目的仓类型无法识别，托盘规则需要复核。":
      "目的仓类型无法识别，托盘规则需要复核。",
    "商业或私人地址目的仓需要运单号。": "商业或私人地址目的仓需要运单号。",
    "已请求快递派送，但派送方式或备注未指定 UPS、Purolator、FedEx、Canpar、DHL 或 Canada Post 等承运商。":
      "已请求快递派送，但派送方式或备注未指定 UPS、Purolator、FedEx、Canpar、DHL 或 Canada Post 等承运商。",
    "手工托数为负数，已改用系统计算托数。":
      "手工托数为负数，已改用系统计算托数。",
    "箱数缺失或为 0。": "箱数缺失或为 0。",
    "体积缺失。": "体积缺失。",
  },
} satisfies Record<Locale, Record<string, string>>;

function containerPackageLabel(value: string, locale: Locale): string {
  const labels: Record<string, string> = containerPackageLabels[locale];
  return labels[value.trim()] ?? value;
}

function palletRuleLabel(value: string, locale: Locale): string {
  const trimmed = value.trim();
  const labels: Record<string, string> = palletRuleLabels[locale];
  const translated = labels[trimmed];
  if (translated) {
    return translated;
  }

  if (locale === "zh-CN" && trimmed.startsWith("Rule ")) {
    return `规则 ${trimmed.slice("Rule ".length)}`;
  }

  if (locale === "en" && trimmed.startsWith("规则 ")) {
    return `Rule ${trimmed.slice("规则 ".length)}`;
  }

  return trimmed;
}

function roundingLabel(value: string, locale: Locale): string {
  const labels: Record<string, string> = roundingLabels[locale];
  return labels[value.trim()] ?? value;
}

function containerIssueMessage(value: string, locale: Locale): string {
  const messages: Record<string, string> = containerIssueMessages[locale];
  return messages[value.trim()] ?? value;
}
