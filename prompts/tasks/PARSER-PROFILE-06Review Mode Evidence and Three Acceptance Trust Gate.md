# 执行 PARSER-PROFILE-06：Review Mode Evidence and Three Acceptance Trust Gate

## 优先级与前置任务

- 优先级：P0 可信自动解析前的强制复核阶段。
- 前置任务：PARSER-PROFILE-01 至 05 必须 `DONE`；至少有一个可测试的 `ACTIVE + REVIEW_REQUIRED` profile version。
- 后续任务：`PARSER-PROFILE-07Trusted Auto Parse Drift and Fallback Integration.md`。
- 本 Task 不自动进入后续任务。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `docs/product/04-adaptive-parser-profiles.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- imports parse persistence、profile matcher、container transaction、corrections、profile governance 和 i18n 实现

## 目标

让后续匹配 approved profile 的导入先进入强制 review，办公室人员接受或修正 staged canonical result。只有连续 3 个不同 SHA 的导入被接受且没有实质 parser 修正，才原子提升该 exact profile version 为 `TRUSTED`。

## Review-Required Parse Flow

1. Normal parse request 计算 built-in detector 与 active profile match evidence；本任务仅对唯一、合法的 review-required profile 建立 staged result。
2. Import parse status 设为稳定 `REVIEW_REQUIRED`，不能提前写成 `PARSED` 或创建可被下游误用的正式 container/pallet/report。
3. Staged result 固定 import SHA、profile version、fingerprint/matcher/mapping/Worker versions、canonical rows、provenance、warnings/errors 和 destination summary。
4. Import detail 显示 source preview、profile match reasons、canonical rows/destinations、report preview 和 required warnings。
5. `parser_profiles.review` 用户可：
   - 无修改接受；
   - 对 parser-relevant fields 做审计修正后接受；
   - 拒绝当前 profile match 并进入 manual/learning flow。
6. Accept 时事务创建正式 container/lines/destinations/pallet calculations，并写 evidence/audit；失败不得留下半 container。
7. 同一个 import 的重复 accept 幂等返回已有结果，不重复创建 container/evidence/count。

## Material Correction 与 Evidence Streak

1. Material fields 以产品文档为准：source selection、row inclusion、container number、destination/grouping、cartons、volume/unit、parser-affecting reference/package、row add/remove、mapping definition。
2. Dock、unloaders/wage、status、manual pallet physical override 和 report download 不算 parser material correction。
3. 无 material correction 的 accepted import 为 valid evidence；必须是 distinct `ImportFile.fileSha256`。
4. 任何 material correction 或 explicit reject：
   - 保存 diff/reason/actor/time；
   - 当前 consecutive streak 重置为 0；
   - 既有 evidence history 不删除；
   - profile 保持 `REVIEW_REQUIRED`，可提示 fork 新 version。
5. Reparse、重复 accept、复制 DB row、重复 job 或同 SHA 不得增加 streak。
6. 第 1/2 次 valid acceptance 显示 `1/3`、`2/3`；第 3 次在 row lock/transaction 中写 evidence + audit 并提升 exact version 为 `TRUSTED`。
7. 两个并发 accept 不能越过 unique/distinct/streak gate 或产生 `4/3`。

## Review UI

- Import detail 的 review panel 必须把“待复核解析”与“解析成功”明确区分。
- 显示 profile/version、match reasons、当前 streak、material field diff、provenance 和 warnings。
- Accept/Correct/Reject 使用明确命令；correct 后标记本次不计入 streak，并在提交前再次确认。
- Profile detail evidence timeline 显示每个 import SHA 的脱敏短 hash、accepted/corrected/rejected、actor/time 和 streak after event。
- 不显示原始 storage path、内部 JSON 或代码操作说明。

## 权限与审计

- read panel 需要 import/profile read 权限；accept/correct/reject 需要 `parser_profiles.review` 加现有相应 container correction 权限。
- OFFICE/ADMIN 默认可 review；WAREHOUSE/HR_MANAGER 默认 403。
- API guard 是权威；不能由前端传 evidence count/trust state/material flag 而直接相信。
- 服务端根据 persisted diff 计算 material correction 和 streak。

## 严格 i18n 硬门禁

1. API 返回 stable review/evidence/material/trust codes 和 raw values，不返回本地化句子。
2. `REVIEW_REQUIRED`、accept/correct/reject、`0/3..3/3`、match reasons、diff fields、warnings、dialogs、empty/error、ARIA/tooltip 全部进入 typed `en`/`zh-CN` catalog。
3. English/中文一次只显示一种语言；source customer text 可原样显示但不能充当 UI fallback。
4. Locale switch/refresh/SSR/hydration 不闪另一语言；staged data 与 locale 无关，切语言不能重复 mutation。
5. 长英文 diff/reject reason 在 mobile/desktop/200% zoom 下不遮挡 data table 与 actions。

## 非目标

- 不让 TRUSTED profile 自动 commit 新 import；留给 07。
- 不引入外部 AI 或自动修改 mapping。
- 不改变现有 built-in parser 成功路径，除非 exact approved profile review flow 明确匹配。

## 验收标准

1. 唯一 active review-required profile match 产生 staged result 和 `REVIEW_REQUIRED`，下游不能误用未批准数据。
2. 无修正 accept 原子提交正式数据并按 distinct SHA 增加 streak。
3. Material correction/reject 保存审计并把 streak 重置 0；non-material 操作不误判。
4. 连续 3 个不同 SHA valid accept 后才变 `TRUSTED`；1/3、2/3、同 SHA、并发重复均不能提前提升。
5. Review UI/RBAC/i18n/locale refresh 行为完整。
6. Existing built-in imports、duplicate SHA、container uniqueness、pallet/report/scan source-of-truth 不回归。

## 必须增加或执行的测试

- API unit：staged persistence、material classifier、accept transaction、same SHA、streak reset、three promotion、concurrency/row lock/idempotency。
- API E2E：至少四个真实或已存在 real-fixture-derived distinct workbook imports，覆盖 initial approved profile + 1/3 + material reset + 1/3/2/3/3/3；RBAC。
- Web unit/E2E：review panel、provenance/diff、accept/correct/reject、streak display、locale/theme/refresh。
- Built-in parser/import/container/pallet/report regression。
- Docker-only API/Web/Worker checks、focused/full relevant tests、production build/healthcheck 和 `git diff --check`。

## 完成输出

- 列出 staged-data boundary、material classifier、streak transaction 和 trust promotion 证据。
- 给出 distinct SHA、duplicate/concurrency、RBAC 与双语 UI 结果。
- 更新索引、报告和 `HANDOFF.md`；下一建议任务只能是 PARSER-PROFILE-07。
