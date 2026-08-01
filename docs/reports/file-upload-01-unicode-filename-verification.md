# FILE-UPLOAD-01 Unicode 文件名完整性验证

日期：2026-08-01 MDT  
结论：`DONE`

## 根因与红灯

原实现未配置 multipart 参数字符集。Multer 2.1.1 通过 Busboy 1.6.0 使用默认
`defParamCharset=latin1`，因此浏览器发送的 UTF-8 文件名在进入两个 service 前已变成
mojibake；service 又直接把 `file.originalname` 写入显示字段和 storage basename。
nginx 没有改写请求体，Prisma/PostgreSQL 只是忠实保存了错误字符串。

修复前的单命令 repro 通过真实 Chromium `FormData`、nginx、API 和数据库稳定失败，
边界证据显示收到 Latin-1 code points，而不是期望 UTF-8 code points。测试只记录
escaped code points、稳定 code、计数和 SHA，没有输出现场样本中的员工姓名、打卡时间
或表格内容。

## 交付

- 卸货 `.xlsx` 与考勤 `.xls` controller 使用同一 UTF-8 multipart 配置和
  `upload-filename-v1` codec。
- codec 使用 NFC，正确 Unicode 不二次解码；仅在明显 mojibake、fatal UTF-8、扩展名
  和严格 byte round-trip 全部成立时做一次 Latin-1→UTF-8 恢复。
- `transport_filename`、canonical `original_filename`、codec/review code 和
  `storage_basename` 分字段持久化；绝对 `storedPath` 不再出现在普通 API 响应。
- storage basename 清除分隔符、控制/bidi、平台保留字符并限制 UTF-8 byte length；
  写入前执行 storage-root containment，已存在内容必须 SHA/bytes 一致。
- list/detail/dashboard/parser-learning/deletion-impact/deletion-history 对尚未 apply 的可逆
  历史记录也使用相同 canonical projection。
- filename review code 在严格 typed English/中文 catalog 中映射；Web 仅按 text 渲染
  canonical 名称并允许长名称换行。
- 所有现有生成物下载统一使用安全 ASCII fallback + RFC 5987 UTF-8 `filename*` helper；
  CRLF、control 和 bidi 输入由 unit gate 覆盖。系统当前没有原始上传文件下载 endpoint，
  因此未新增可能绕过权限的原始文件下载路由。
- 新增默认 dry-run、显式 apply 的历史 metadata 修复工具；apply 强制匹配的 PostgreSQL +
  storage backup manifest、advisory transaction lock、文件 containment/SHA 证据和第二次
  zero-change。

## 受控真实样本证据

- 卸货输入 SHA-256：
  `a30b0373c0dbcd46ab55fe98016058e6479aea7c6bb12a4bc4e5766f1f89450e`
- 7 月现场考勤输入 SHA-256：
  `63927d94a027f77b41ce4345e38fb9f7b9df8b8d44b989e710fe7f50f4172597`
- 修复前后两份源 SHA 均不变。
- 专项成功流持久化证据数：2；最终清理后测试用户、卸货导入、考勤导入、考勤删除审计
  和两份源 SHA 对应测试行均为 0。
- 历史修复隔离门禁：dry-run candidate=1、apply=1、second apply=0；无备份 apply 被
  `MATCHED_BACKUP_MANIFEST_REQUIRED` 拒绝。

## 自动化结果

- Compose 全栈冻结锁文件重建：通过；API、Web、worker、PostgreSQL、Redis、nginx
  均 healthy。
- Prisma：39 migrations，schema up to date；新增 migration
  `20260801010000_unicode_upload_filename_evidence` 已部署。
- API：lint 通过；typecheck 通过；50 suites / 403 unit tests 通过；21 suites /
  131 E2E tests 通过；Nest production build 通过。
- Web：lint 通过；typecheck 通过；284/284 unit tests 通过；Next.js production build
  通过。
- Worker：235/235 pytest 通过。
- `scripts/run-file-upload-01-e2e.sh verify`：通过。包含故意失败 cleanup probe、正常
  Chromium 流、真实 multipart→nginx→API→DB→response→DOM、刷新、locale switch、
  dark、390/1366、真实 200% 浏览器缩放、删除影响/历史、console/pageerror、DB/storage
  evidence、源 SHA 和精确零残留。
- `scripts/verify-file-upload-01-repair.sh`：通过；隔离数据库、storage 与备份均由 trap
  清理。
- `scripts/healthcheck.sh`、shell syntax、`git diff --check`：通过。

## 验收与限制

全部当前环境验收项已完成，无外部设备、Microsoft Excel、真实打印机、业务签字或目标
主机 gate。不可逆或在用户电脑上已经损坏的任意名称不会被猜测；它们保留 raw evidence
并以 stable review code 进入人工检查。后续只可在新的 supervisor Session 中开始
`WAGE-HOURS-08`，本 Session 未执行该 Task。
