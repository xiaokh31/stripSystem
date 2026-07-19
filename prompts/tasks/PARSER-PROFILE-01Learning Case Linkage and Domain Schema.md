# 执行 PARSER-PROFILE-01：Learning Case Linkage and Domain Schema

## 优先级与前置任务

- 优先级：P0，新客户拆柜清单解析扩展的基础任务。
- 前置任务：无；先读取已确认的产品方案与 ADR。
- 后续任务：`PARSER-PROFILE-02Deterministic Workbook Fingerprint and Mapping Engine.md`。
- 本 Task 只执行本任务，不自动进入 02。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/04-adaptive-parser-profiles.md`
- `docs/adr/0004-approved-parser-profiles.md`
- `docs/architecture/02-data-model.md`
- `docs/architecture/04-api-contracts.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- Prisma schema/migrations、imports/manual container/corrections/auth/default RBAC 实现及测试

## 已确认现状

1. `ImportFile` 保存原始文件与 SHA-256；`Container.importFileId` 当前表示成功解析所得 container。
2. 手工 container 使用 `importFileId = null` 和 `manual-entry-v1`。
3. Web 的 `sourceImportId` 目前只生成 reason/note 文本，没有形成数据库关系。
4. 删除导入会清理 storage 文件；学习案例或证据不能留下 dangling source。
5. 当前没有 parser profile、learning case、profile evidence、profile audit 或 review-required parse 状态。

## 目标

建立可迁移、可审计的数据与权限基础，让一个失败原始导入可以正式关联一个手工 container 和后续 parser profile 证据，同时不改变现有成功导入和无来源手工录入语义。

## 数据模型要求

结合现有 Prisma 风格实现以下概念，具体表名可在不改变语义的前提下调整：

1. Profile family：稳定名称、可选客户显示标签、创建人、生命周期审计关系。
2. Profile version：family、递增版本、`DRAFT/ACTIVE/PAUSED/RETIRED` lifecycle、
   `REVIEW_REQUIRED/TRUSTED` trust state、immutable mapping/fingerprint JSON、matcher/mapping version、批准人和时间。
3. Parser learning case：唯一关联原始 `ImportFile`，可关联一个 manual `Container`，保存状态、draft definition、
   completion snapshot、replay summary、创建/更新/关闭 actor/time。
4. Profile evidence：固定 profile version + distinct import + acceptance/material-correction 结果；数据库唯一约束必须阻止同一 import 重复计数。
5. Profile audit event：create/link/map/submit/replay/approve/accept/trust/pause/retire 等稳定 event code、actor、时间、结构化 metadata。
6. 为 profile-mapped 来源增加稳定 source format/parser identity；为待人工复核导入增加明确 parse status，不得把待复核冒充 `PARSED`。
7. JSON 字段只保存结构化定义、snapshot 和 diff；不要存可执行代码或本地化句子。
8. 所有新关系、状态、unique/index、onDelete 行为和 migration 必须明确并有回归测试。

## 关系边界

1. 不重载 `Container.importFileId`：成功 parser container 继续使用它；失败导入对应的手工 container 通过 learning case 关联。
2. 一个 import 最多有一个 active learning case；重复 start 返回现有 case 或稳定冲突码，不得产生重复候选。
3. 一个 manual container 最多属于一个 learning case。
4. 普通无来源 `POST /containers/manual` 保持兼容，不强迫创建 learning case。
5. 有 learning case/evidence 的 import 默认阻止物理删除并返回 `IMPORT_USED_BY_PARSER_LEARNING` 等稳定 code；不得先删文件再发现关系冲突。
6. 明确废弃且没有 approved/evidence 依赖的 draft case 可以通过受权限、受审计的关闭/解除流程释放 import；不得级联删除历史 profile/evidence。

## API 与权限基础

1. 新增稳定权限：
   - `parser_profiles.read`
   - `parser_profiles.train`
   - `parser_profiles.review`
   - `parser_profiles.approve`
2. 默认 `ADMIN` 拥有全部；`OFFICE` 默认拥有 read/train/review；其他角色默认没有。不得新增 `OFFICE_MANAGER` 角色。
3. 提供最小 learning-case create/read/link contract，建议：
   - 从失败 import 创建或读取 learning case；
   - 把 manual container 原子关联到 case；
   - 查询 case 的稳定 ID、状态、source import 和 linked container raw metadata。
4. `POST /containers/manual` 可接受稳定 `learningCaseId`，但不能接受前端自由文本来代替关系；创建 container、destinations、correction audit 和 case link 必须事务一致。
5. 只接受 `ERROR/WARNING/UNKNOWN` 等被产品允许的导入进入学习流程；成功解析导入不得误建失败案例，除非后续产品明确增加“误解析反馈”。

## 审计要求

- 每次 case 创建、manual link、close/unlink 和 deletion blocker 均保存 actor ID、稳定 event code、target IDs 和时间。
- API 不接受调用方伪造 correctedBy/approvedBy。
- 不在 audit metadata 保存密码、token、完整 workbook 内容或本地 storage 绝对路径。
- 原始文件 SHA、import ID、container ID 和 profile IDs 可作为稳定引用。

## 严格 i18n 硬门禁

1. 本任务即使主要是 schema/API，也必须只返回 stable code/enum/labelKey/raw data；禁止在 API 新增中文或英文 UI 句子。
2. 新 permission、case lifecycle、source format、parse status、删除 blocker 和 validation code 必须登记 Web typed `en`/`zh-CN` catalog/status helper 所需 contract。
3. Existing UI 若因 response shape 变化展示状态，必须由当前 locale 映射，不能显示 raw enum 或后端 `message`。
4. English/中文一次只显示一种语言；不得加入双语 fallback 字符串。
5. 增加 catalog parity、stable-code coverage 或 contract test，防止后续任务遗漏翻译入口。

## 非目标

- 不实现 Worker fingerprint/mapping。
- 不实现 mapping wizard、replay、approval 或 trusted auto-parse。
- 不修改现有托盘、报告、库存、工资、loading scan 业务规则。
- 不使用 synthetic customer workbook 冒充真实 parser fixture。

## 验收标准

1. Migration 可在空库和现有数据库上前进部署，Prisma client/typecheck 通过。
2. 失败 import 可幂等创建 learning case，并原子关联手工 container；现有普通 manual create 保持通过。
3. 学习关系不是 reason/note 文本，API read contract 能取得正式 source import ID。
4. 同一 import/container/evidence 的数据库唯一性可抵抗并发重复请求。
5. 被学习案例/证据引用的 import 删除在任何文件清理前被稳定阻止。
6. ADMIN/OFFICE/WAREHOUSE/HR_MANAGER/WAREHOUSE_MANAGER 权限矩阵符合产品文档。
7. 新 API/enum/error contract 无硬编码可见双语文案。

## 必须增加或执行的测试

- Prisma migration/schema 约束测试和 `prisma migrate status`。
- API unit：幂等 start、manual link、非法 import 状态、重复 container、close/unlink、delete blocker、事务回滚。
- API E2E：真实上传失败 import -> case -> manual container；RBAC；并发重复 start/link；原文件仍存在。
- 现有 imports/manual container/delete/corrections/auth 回归。
- Docker-only API lint、typecheck、focused unit/E2E；本任务不运行宿主 pnpm/Jest/Prisma。
- `git diff --check`。

## 完成输出

- 列出 migration、models/enums/index/关系和删除策略。
- 列出 endpoint、permission 与稳定 code。
- 给出普通 manual flow 不回归和 learning link 事务证据。
- 更新任务索引、完成度报告和 `HANDOFF.md`，下一建议任务只能是 PARSER-PROFILE-02。
