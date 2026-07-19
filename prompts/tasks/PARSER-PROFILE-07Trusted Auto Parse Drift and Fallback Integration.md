# 执行 PARSER-PROFILE-07：Trusted Auto Parse Drift and Fallback Integration

## 优先级与前置任务

- 优先级：P0 可信模板进入生产导入主链路。
- 前置任务：PARSER-PROFILE-01 至 06 必须 `DONE`，并有自动化证明的 TRUSTED profile version。
- 后续任务：`PARSER-PROFILE-08Golden Sample Full Stack I18n Exit Gate.md`。
- 本 Task 不自动进入后续任务。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `docs/product/04-adaptive-parser-profiles.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- import detector/queue/persistence、built-in parsers、profile matcher/trust、corrections、dashboard/import UI

## 目标

把 TRUSTED profile 安全接入正常 import parse：只有唯一、active、trusted 且 required structural anchors/tolerances 匹配时自动提交 canonical result；ambiguity、drift、paused/retired、required warning 或版本变化都必须回退到 review/manual，不得 silent wrong parse。

## Parser Selection Order

1. 保留 SHA duplicate/original preservation 作为最前置步骤。
2. 对同一 workbook 计算 built-in detector result 和 active profile match candidates。
3. 唯一 exact/high structural match 的 explicit approved profile 可优先于 broad generic built-in detector；选择原因必须持久化。
4. 无 profile match 时继续现有 built-in parser，保持 fixture 输出。
5. REVIEW_REQUIRED profile 继续走 06 staged review。
6. TRUSTED profile 只有在 commit 前仍为 active/trusted、version 未变化、required fields 无 blocker error时自动提交。
7. 多 profile collision、required anchor drift、type mismatch、medium/uncertain match、missing formula cache 或 parser blocker error进入 review/unsupported，不自动挑 winner。

## Trusted Commit

- 复用现有 import -> container/lines/destinations/pallet calculation transaction，不建立 frontend source of truth。
- Persist `PROFILE_MAPPED` source format（或 01 定义的稳定 enum）、profile family/version、fingerprint/matcher/mapping/Worker versions、selection reasons、raw JSON/provenance/warnings/errors。
- Queue retry/idempotency 不重复 container、pallet、generated parsed JSON 或 audit event。
- Trusted parse success 仍可产生非 blocker warnings；是否自动提交由稳定 severity contract 决定。
- Auto parse 不自动生成报告/labels，不改变 unload/loading/wage 状态。

## Drift And Trust Revocation

1. Trusted output 后续发生 material parser correction时，服务端自动：
   - 保存 correction/evidence；
   - 将 exact version trust demote 为 `REVIEW_REQUIRED`；
   - consecutive streak 重置为 0，历史保留；
   - 写 `TRUST_REVOKED_BY_MATERIAL_CORRECTION` 稳定 audit event。
2. Demotion 之后的新 imports 必须进入 06 review flow；已完成历史 import 不回滚。
3. Structural drift 不一定修改 trust，但当前 import 必须 review；重复 drift 可提示 approver pause/fork new version。
4. Profile 在 queued job 中被 pause/retire/demote 时，commit 前重新校验并安全转 review，不使用 stale trust。

## 用户可见行为

- Import detail 显示解析来源：built-in、profile review、trusted profile、ambiguous/drift/fallback，使用本地化业务 label。
- 显示 profile name/version、match anchors、warnings、provenance 和是否自动提交；raw code 仅限诊断 title/expandable area。
- Collision/drift 给出可行动入口：选择 profile review、创建新 learning case、打开 profile detail。
- Dashboard/import list 如新增统计，只返回/消费 stable enum/count，不在 API 写 localized summary。
- 自动解析不弹出阻塞日常流程的成功 marketing modal。

## 严格 i18n 硬门禁

1. Selection/drift/collision/demotion/fallback/audit API 只返回 stable codes/enums/structured params。
2. Parse source、trusted/review、match reasons、drift/collision、demotion、actions、warning/error/ARIA/tooltip 全部进入 typed `en`/`zh-CN` catalogs。
3. English/中文单语显示；禁止 `Trusted / 可信`、`PROFILE_MAPPED (模板解析)` 等双语组合。
4. SSR/refresh/client navigation/locale switch 不闪另一语言，不因翻译切换重新触发 parse。
5. 长英文 reason 在 import detail/list 和 mobile width/200% zoom 不造成 overflow/错位。

## 可观测性与性能

- 记录 match candidate count、selected path、stable reason、profile version、duration 和 outcome，不记录 workbook 原始内容/隐私值。
- Profile candidate query 有索引和 bounded set，不为每次 parse 加载所有 historical evidence/content。
- Fingerprint/inspection 复用同一 job 内结果，避免重复打开 workbook。
- 定义并测试常规 fixture 的 profile overhead budget；不得显著拖慢所有 built-in imports。

## 非目标

- 不使用外部 AI 决定 profile。
- 不自动编辑/fork mapping。
- 不把 filename/customer label 设为 sole matcher。
- 不修改 report/pallet/inventory/loading/wage 业务含义。

## 验收标准

1. Unique trusted match 自动提交正确 canonical/container/destination/pallet data，并保存完整 version/provenance/audit。
2. No match 保持 built-in path；review profile 保持 staged；collision/drift/paused/stale trust 不自动 commit。
3. Trusted result 的 material correction 立即 demote/reset，后续 import 进入 review，历史不被改写。
4. Queue retry/concurrency/profile state race 不产生重复或 stale trusted commit。
5. Existing real fixtures、reports、labels、inventory、loading scan 和 duplicate imports 不回归。
6. 所有来源/错误/回退状态双语完整且单语稳定。

## 必须增加或执行的测试

- Worker/API unit：selection precedence、unique/collision/drift、active/trusted recheck、warning severity、performance bounds。
- API E2E：trusted auto commit、built-in fallback、review-required、collision、paused/retired、queued demotion race、material correction trust revoke。
- Web unit/E2E：parse source/match reasons/actions、locale/theme/refresh、无 raw code 主显示。
- Existing import/parser/pallet/report/label/inventory/scan regressions and queue concurrency。
- Docker full relevant suites、production build/healthcheck、query/performance evidence 和 `git diff --check`。

## 完成输出

- 列出 parser selection precedence、trusted commit、drift/collision fallback 和 demotion contract。
- 给出真实 fixture、race/idempotency、性能、i18n/视觉证据。
- 更新索引、报告和 `HANDOFF.md`；下一建议任务只能是 PARSER-PROFILE-08。
