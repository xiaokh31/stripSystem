# 执行 FILE-UPLOAD-01：Unicode Original Filename Integrity Regression

## 优先级与执行状态

- 优先级：P0。中文文件名经上传后显示为 mojibake，办公室人员无法可靠识别原始清单和考勤批次。
- Task-Status: DONE
- 前置任务：无代码前置；保留 `IMPORT-DELETE-01`、`WAGE-HOURS-07` 的删除与审计语义。
- 后续任务：`WAGE-HOURS-08Parsed Attendance Wage Workbook Generation Regression.md`
  必须在本 Task 完成后执行，避免把文件名编码问题混入工资表生成根因。
- 只执行本 Task。达到监督终态后更新本文件、Task Index、完成度报告、验证报告和
  `HANDOFF.md`；不得在同一 Session 自动开始 WAGE-HOURS-08。

## 用户报告

含中文字符的文件名在导入后显示乱码。

## 用户确认的真实样本

1. `samples/attendance_test/` 目录存放的是用户提供的**7月现场真实打卡记录样本**，
   不是 synthetic/mock fixture。
2. 本 Task 必须使用该目录中的真实 `.xls` 字节复现中文文件名问题；不得只用新建的
   空 Excel 或人工构造 Multer object 代替真实样本退出门禁。
3. 真实样本原始字节必须只读，修复前后 SHA-256 不变。不得改写、覆盖、删除或把其中
   员工姓名、打卡时间及其他个人数据复制到代码、日志、截图、验证报告或 `HANDOFF.md`。
4. 当前仓库物理路径已经呈现 mojibake，因此测试 runner 应在隔离临时目录保留相同
   文件字节并使用确认的 UTF-8 中文文件名建立 multipart 输入；不得把乱码路径本身
   当作正确期望值，也不得直接重命名原始现场样本来掩盖上传边界缺陷。

当前真实样本的 `.xls` 文件路径呈现典型的 UTF-8 字节被按 Latin-1 解读后的
mojibake。现有卸柜导入与考勤导入均
直接使用 Multer `file.originalname` 写入 `originalFilename` 和 storage basename，
没有共享的上传文件名解码、Unicode 规范化或 transport/raw evidence 合约。

以上只是诊断入口，不得直接假设所有非 ASCII 文件名都需要 Latin-1 -> UTF-8
转换；必须先建立能复现用户原始症状的测试。

## 业务目标与边界

1. 浏览器选择名称为 `1_(7月)员工刷卡记录表.xls` 的文件后，上传成功提示、导入
   列表、详情、考勤记录、删除影响/历史和相关下载名称均显示同一个可读中文文件名。
2. 卸柜 `.xlsx` 与考勤 `.xls` 使用同一文件名边界规则，不能分别实现两套不一致的
   猜测逻辑。
3. 文件内容 SHA-256、duplicate detection、原始上传字节、parser 输入和既有审计
   语义不得因文件名修复而改变。
4. 用户文件名是原始业务数据，不翻译；English 和中文 UI 中均显示文件本身的名称，
   只有字段标签、错误、提示和操作文案按当前 locale 翻译。
5. 内部 storage path 不依赖未经处理的用户路径。显示名与安全 storage basename
   必须明确分离，路径穿越、控制字符或异常长文件名不得逃逸 storage root。
6. 已经导入的可逆 mojibake 记录也必须有安全处理方案；不能要求办公室人员删除历史
   审计后重新上传，也不能无备份、无 evidence 地批量改数据库或移动原始字节。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.agents/skills/diagnosing-bugs/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/api/src/imports/imports.controller.ts`
- `apps/api/src/imports/imports.service.ts`
- `apps/api/src/attendance/attendance.controller.ts`
- `apps/api/src/attendance/attendance.service.ts`
- `apps/api/prisma/schema.prisma`
- `apps/web/src/components/imports/**`
- `apps/web/src/components/wage/**`
- `apps/web/src/app/imports/**`、`apps/web/src/app/work-hours/**`
- `apps/web/src/lib/i18n/**`
- `infra/nginx/nginx.conf`、`infra/nginx/nginx.public.conf`
- `samples/attendance_test/*.xls`：用户提供的7月现场真实打卡记录样本，只读用于
  受控回归；不得输出员工姓名、打卡时间或其他个人数据

## 修改前红灯复现

在阅读实现并提出修复前，先提供一个可重复、秒级或分钟级的单命令 repro：

1. 在测试临时目录把受控 `.xls` 字节置于真正的 UTF-8 文件名
   `1_(7月)员工刷卡记录表.xls`。不得把仓库中已经 mojibake 的物理路径直接当成
   正确预期名称。
2. 通过真实 multipart parser 分别请求卸柜导入和考勤导入；至少一个集成用例必须
   经 nginx，不能只手工构造 `Express.Multer.File` 对象绕过故障边界。
3. 断言浏览器/FormData 名称、API 持久化 `originalFilename`、response JSON 和 Web
   DOM 的期望值都是完整中文名称，并证明当前代码在至少一个真实边界变成乱码。
4. 用 escaped code points 或 hash 记录边界，不在日志、截图或验证报告中打印员工
   内容。删除临时 debug instrumentation。
5. 同时建立 ASCII、已正确 Unicode、带重音拉丁文、空格/括号、emoji、路径分隔符、
   C0/C1 control、超长名称和无效/可疑编码负向样本，防止“修中文、毁其他文件名”。

若现场文件在进入浏览器前物理名称已经损坏，记录为独立 `SOURCE_FILENAME_ALREADY_MOJIBAKE`
诊断；系统不能凭空猜测任意不可逆名称，但对本例这种经过严格 round-trip 验证的可逆
编码错误仍须提供受控修复。

## 实现要求

### 1. 共享 transport filename codec

1. 在 API 的共享 upload boundary 增加单一、可单测的文件名处理模块，由卸柜和考勤
   controller/service 共同调用。不得在 React、两个 service 或 Python Worker 中各自
   `Buffer.from(name, "latin1")`。
2. 先确定 multipart library 的实际 charset 行为；优先在正确的 parser/transport
   边界配置 UTF-8。只有经过严格、无损 round-trip 和明显 mojibake 证据时，才允许
   从 Latin-1 transport string 恢复 UTF-8。
3. 已正确的中文、日文、韩文、emoji 和拉丁重音名称必须原样保留；规范化采用明确
   Unicode normalization form（建议 NFC），并以测试固定。
4. 禁止宽泛的“看起来像乱码”替换、二次解码、URL decode 或 locale-dependent
   heuristic。无法确定时保留 raw 名称并返回 stable review/error code，不能静默损坏。
5. 文件扩展名校验必须基于规范化后的 canonical 名称，但 MIME、magic bytes 和现有
   `.xlsx` / legacy `.xls` 业务校验继续保留。

### 2. 显示名、原始证据与 storage 安全

1. 明确区分：
   - transport/raw filename evidence；
   - canonical original display filename；
   - storage-safe basename / internal generated path。
2. 若规范化改变 transport 值，必须在耐久 raw metadata 或 append-only audit evidence
   中保留原 transport 值和 codec/version；普通 UI 只显示 canonical 名称。
3. storage-safe 名称必须去除 `/`、`\\`、NUL、控制字符和平台保留字符，限制 UTF-8
   byte length，并继续位于 SHA/import-id 目录下。不得使用 basename 替代 containment
   检查，也不得在 API response/UI 暴露本地绝对路径。
4. canonical 名称为空或不安全时使用稳定 internal basename，但 UI 必须通过 stable
   code 显示本地化 review 状态；不能把 `upload.xlsx` 伪称为用户原始名称。
5. 原始文件内容和 SHA 不变；若 content-addressed bytes 已存在，不得因 canonical
   名称不同覆盖、复制冲突或绕过 duplicate SHA 规则。

### 3. 既有乱码记录

1. 提供默认 dry-run、显式 `--apply` 的 Docker 内修复命令或等价受控流程，只列出
   record id、模型、old/new escaped filename、round-trip verdict；不得输出客户内容、
   storage absolute path 或个人信息。
2. 只修复能严格可逆并通过 extension/normalization/security validation 的候选；
   ambiguous 候选必须跳过并报告 stable reason。
3. apply 前要求 PostgreSQL + `storage/` matched backup。更新 canonical metadata 时保留
   raw evidence；不改 immutable deletion event，不删除/覆盖/移动原始 bytes，不改变
   SHA、import id、actor、createdAt 或 generated-file history。
4. 普通 list/detail/deletion-history 响应对尚未 apply 的可逆历史记录也必须有一致的
   canonical display projection，避免同一记录在一个页面正常、另一个页面乱码。
5. 修复可重复运行且第二次为 zero-change；提供 before/dry-run/apply/after count，禁止
   直接 SQL 手工替换整个表。

### 4. API、Web 与下载

1. 所有受影响 DTO 返回 canonical `originalFilename`；如管理/审计 contract 需要 raw
   evidence，使用明确 permissioned 字段，不能覆盖 canonical 字段或默认暴露。
2. Web 不自行 decode，不使用 `dangerouslySetInnerHTML`；按 raw text 渲染并允许长名称
   换行，不能造成页面级横向滚动。
3. 需要由原始名驱动的下载使用 RFC 6266/RFC 5987 兼容的 ASCII fallback +
   `filename*=UTF-8''...`，并防 CRLF/header injection。
4. 上传成功、duplicate、删除影响、历史和详情必须显示同一 canonical 名称；刷新、
   SSR/hydration 和 locale switch 不能恢复乱码或闪现另一名称。

## Strict i18n 硬门禁

1. 新增的 filename encoding review、unsafe filename、repair skipped、upload/storage
   failure、tooltip、aria/title、empty state 和帮助提示全部进入 typed `en` / `zh-CN`
   catalog。
2. API 只返回 stable code/enum、字段和安全 raw evidence；不返回让 Web 直接显示的
   英文诊断句子。
3. 文件名本身不翻译、不双语拼接、不附加 raw code；中文页面只显示中文 UI，English
   页面只显示 English UI。
4. 中文 direct refresh、hydration、上传 progress、失败、duplicate、history 和 locale
   switch 不得先闪英文；catalog parity、unmanaged-string 和 stable-code mapping gate
   必须通过。
5. 不通过 CSS 隐藏乱码、不用 DOM walker/MutationObserver 修正文案、不增加宽泛 i18n
   ignore。

## 必须新增/更新的测试

### API / storage

1. 真实 multipart UTF-8 中文名在卸柜 `.xlsx` 和考勤 `.xls` 两条入口完整保留。
2. 正确 Unicode 不二次解码；Latin-1 重音、emoji、NFC/NFD、ASCII 保持预期。
3. 可逆 mojibake 只解码一次；ambiguous/invalid bytes 返回或记录稳定 review code。
4. slash/backslash、NUL、CRLF、bidi/control、超长名称不能逃逸 storage 或注入 header。
5. canonical 名称修复前后文件 bytes/SHA、duplicate behavior、parse 输入和审计不变。
6. dry-run 不写数据，apply 只改批准字段并保留 raw evidence，第二次 apply zero-change；
   rollback/失败不留下半修复记录。

### Web / full-stack

1. 经 nginx 上传中文卸柜文件和中文考勤文件，列表、详情、成功提示、删除 dialog/history
   与 response JSON 精确显示 canonical 名称。
2. en/zh-CN、light/dark、390/1366、200% zoom、refresh/locale switch 无乱码、混合语言、
   overflow、hydration、console、pageerror 或 missing key。
3. 相关下载的 `Content-Disposition` 同时包含安全 ASCII fallback 和 UTF-8 filename；
   浏览器保存名正确且内容 SHA 一致。
4. 使用受控现场 `.xls` 只记录 SHA/count/code；截图和报告使用脱敏结构 fixture，禁止
   暴露员工姓名或打卡记录。
5. 测试用户、DB rows、临时 storage 和 artifact directory 精确清理；不得删除
   `samples/attendance_test` 或既有生产 storage。

## Docker-only 验证

所有 Node、Prisma、Worker、test、build 和 Playwright 必须在 Docker/Compose 中运行：

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
scripts/healthcheck.sh
git diff --check
```

新增专用 `FILE-UPLOAD-01` full-stack runner，包含故意失败 cleanup 探针；不得只运行
手工构造 Multer object 的 unit test 后宣称完成。

## 验收标准

1. 正确 UTF-8 中文原始文件名在 multipart -> API -> DB -> response -> Web 全链路一致。
2. 卸柜和考勤入口共用一个严格 codec；正确 Unicode、ASCII、重音和 emoji 不回归。
3. display filename、raw transport evidence 和 storage-safe path 分离；无路径穿越、
   header injection、二次解码或 SHA/duplicate 改变。
4. 已有可逆乱码记录可通过有备份、dry-run、审计、幂等流程恢复显示，原始 bytes 与
   immutable history 不被删除或覆盖。
5. strict en/zh-CN、no-flash、responsive/a11y、下载名和 privacy gate 全部通过。
6. Docker API/Web/Worker、真实 nginx multipart、浏览器、healthcheck、cleanup 和
   `git diff --check` 全部通过。
7. 生成 `docs/reports/file-upload-01-unicode-filename-verification.md`，同步 Task、Index、
   completion report 和 `HANDOFF.md`；没有剩余实现/外部 gate 时返回 `DONE`。

## 非目标

- 不猜测不可逆或用户电脑上已经损坏的任意文件名。
- 不修改 Excel 内容、parser、工时计算、托盘计算或报告模板。
- 不删除/改写原始上传 bytes、SHA、employee-day audit 或 import deletion history。
- 不以关闭 Unicode、强制英文重命名或只显示 storage basename 作为修复。
- 不在同一 Session 开始 WAGE-HOURS-08 或 PUBLIC-DEPLOY-04。

## 完成证据（2026-08-01 MDT）

- 根因已定位为 Multer 2.1.1 / Busboy 1.6.0 在未指定 `defParamCharset` 时按
  Latin-1 解读 multipart filename；nginx、原始上传 bytes 和 SHA 未改变。
- 卸柜与考勤入口现共用严格 UTF-8 codec，raw transport evidence、canonical display
  name 与 storage-safe basename 已分离；Prisma migration、DTO/API/Web 显示、strict
  en/zh-CN review code 和统一安全 `Content-Disposition` 已完成。
- 既有记录修复 CLI 默认 dry-run；apply 强制同一恢复点的 PostgreSQL + `storage/`
  匹配备份 manifest、SHA 校验、advisory lock、并发复核与幂等。隔离验证证明首次修复
  1 条、源文件 SHA 不变、再次 apply 0 条，且缺少备份时拒绝执行。
- Docker 门禁通过：API lint/typecheck、50 suites / 403 unit、21 suites / 131 E2E；
  Web lint/typecheck、284 unit、Next production build；Worker 235 pytest；39 个 Prisma
  migrations 全部 applied；full-stack build、healthcheck 和 `git diff --check` 通过。
- `scripts/run-file-upload-01-e2e.sh verify` 通过真实 Chromium/FormData/nginx/API/DB/Web
  全链路、正确源文件 SHA、en/zh-CN、dark、390/1366、真实 200% browser zoom、无
  console/page error、故意失败 cleanup 探针和最终零残留。
- 完整脱敏证据见
  `docs/reports/file-upload-01-unicode-filename-verification.md`；生产修复步骤见
  `docs/runbooks/upload-filename-repair.md`。本 Task 没有剩余仓库工作或外部 gate。
- 未启动 `WAGE-HOURS-08` 或 `PUBLIC-DEPLOY-04`；后续必须分别使用 fresh supervisor
  Session。
