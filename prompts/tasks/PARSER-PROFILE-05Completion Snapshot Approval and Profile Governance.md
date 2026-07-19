# 执行 PARSER-PROFILE-05：Completion Snapshot Approval and Profile Governance

## 优先级与前置任务

- 优先级：P0 首次模板审批门槛。
- 前置任务：PARSER-PROFILE-01 至 04 必须 `DONE`。
- 后续任务：`PARSER-PROFILE-06Review Mode Evidence and Three Acceptance Trust Gate.md`。
- 本 Task 不自动进入后续任务。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `docs/product/04-adaptive-parser-profiles.md`
- `docs/adr/0004-approved-parser-profiles.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/nextjs-pwa-ui/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- container lifecycle、unloading completion、pay-container completion、inventory sync、queue、learning case/replay 实现

## 目标

当关联手工 container 首次形成持久“已拆完”业务事实时，冻结 parser-relevant final snapshot 并异步 replay candidate。Replay passed 后仍必须由 `parser_profiles.approve` 权限显式批准，才能形成 `ACTIVE + REVIEW_REQUIRED + 0/3` 的 profile version。

## Completion Snapshot 规则

1. 触发依据是现有统一 unloading completion domain service/event，而不是页面文字、报告下载或简单查询当前状态。
2. `UNLOADED`、后续 `LOADING_IN_PROGRESS/LOADED` 可证明已经完成拆柜，但每个 learning case 只冻结一次首次 completion snapshot。
3. 对历史已经装车中/已送库但后来补建 case 的合法数据，提供幂等 catch-up；不得降级 container 状态。
4. Snapshot 包含 container number、parser detail inclusion、destination/cartons/volume/reference/package evidence 及相关 correction IDs/revisions。
5. 不把 unloaders、工资标签、dock、manual pallet physical override、inventory/loading status 写成 parser mapping 正确性。
6. Snapshot/replay enqueue 失败不能回滚或阻止仓库“已拆完”操作；记录 stable learning warning/job status 后可重试。
7. Completion transaction、snapshot 和 outbox/job linkage 必须避免半状态及重复 job。

## Replay And Approval Eligibility

批准前必须同时满足：

- preserved original import/SHA 可读取；
- learning case 与 manual container/snapshot 完整关联；
- submitted immutable draft profile definition；
- Worker replay 使用固定 source/draft/Worker versions；
- container/destination/cartons exact match；
- volume canonical 3-decimal match，或明确不参与且不影响 required mapping；
- required fields 有 provenance；
- 无 unresolved blocker errors；
- replay diff 为 passed；
- profile name 非空。

不满足时返回稳定 eligibility codes，并保持 DRAFT/manual operational result 不变。

## Approval Governance API

1. 增加 profile family/version read/list/detail、approve、pause、resume（回到既有 trust state）和 retire endpoints。
2. `approve` 只接受当前 immutable submitted version + expected revision/replay ID，防止批准 stale draft。
3. 批准事务写 approver/time/reason、lifecycle `ACTIVE`、trust `REVIEW_REQUIRED`、current streak `0/3` 和 audit event。
4. 同一 family 同一 matcher scope 的 active versions 冲突必须显式检测；不能批准会形成不可解释 automatic winner 的版本。
5. Active version 的 mapping 不可原地编辑；edit/fork 创建新 DRAFT version，trust/streak 不继承。
6. Pause/retire 不删除历史结果/evidence；queued match 在 commit 前重新检查 active version。
7. Approver 不能由 DTO 指定 actor；来自当前 auth user。

## Web Profile Governance

1. 新增安静、工作型 profile list/detail/review 页面，可从 learning wizard 的 awaiting approval 状态进入。
2. 列表显示 profile name/customer label、version、lifecycle、trust、current streak、last replay、updated/approved actor/time。
3. Detail 显示 structural anchors、mapping summary、source provenance、completion snapshot、replay diff 和 unresolved blockers。
4. Approve 必须有明确确认对话，说明批准后仅进入“每次需复核”，不会立即自动解析。
5. Pause/retire 要求 reason 并显示影响；不显示 mapping JSON/代码作为主工作流。
6. OFFICE 可 read/train 但默认看不到 approve/pause/retire mutation；ADMIN 或被授权角色可操作。

## 严格 i18n 硬门禁

1. Completion/replay/eligibility/lifecycle/trust/audit/permission API 只返回 stable codes/enums/raw metadata。
2. `DRAFT/ACTIVE/PAUSED/RETIRED`、`REVIEW_REQUIRED/TRUSTED`、`0/3` 说明、批准确认、暂停/退役、snapshot/replay diff、ARIA/tooltip 全部进入 typed `en`/`zh-CN` catalogs。
3. 不直接显示后端英文 message、raw code 或中英拼接状态。
4. English/中文 locale switch、SSR/refresh/hydration 单语稳定；长英文确认文案不挤压 action controls。
5. Approval 权限不可仅依赖隐藏 UI；API 403 映射为本地化提示。

## 非目标

- 不把后续 matching import 提交为 evidence。
- 不执行 3 次 trust promotion 或 trusted auto-parse。
- 不因 learning replay 失败影响已拆完、库存、工资或 loading scan。

## 验收标准

1. 所有现有“标记已拆完”入口均幂等生成同口径 snapshot/replay job，不重复、不降级状态。
2. Replay failure 可见、可重试且不回滚 warehouse operation。
3. 未完成、无 provenance、diff mismatch、stale replay 或权限不足均不能批准。
4. 合法批准后精确得到 `ACTIVE + REVIEW_REQUIRED + 0/3`，不是 TRUSTED。
5. Active mapping immutable；new version streak 为 0；pause/retire 立即排除新 matching。
6. ADMIN/OFFICE/其他角色和 delegated permission 符合 RBAC contract。
7. Profile governance 双语、主题、viewport/zoom 无混语和布局回归。

## 必须增加或执行的测试

- API unit：所有 completion entry points、idempotent snapshot/job、replay eligibility、stale approval、active conflict、version immutability、pause/retire。
- API E2E：失败 import -> manual case -> completed -> replay passed -> OFFICE approve 403 -> ADMIN approve -> active review-required；replay failure 不影响 completion/inventory。
- Web unit/E2E：profile list/detail、approval confirm、permission controls、pause/retire、localized stable errors。
- 现有 unloading completion/inventory sync/wage/loading lifecycle 全量相关 regression。
- Docker-only API/Web/Worker focused checks、lint/typecheck/build、healthcheck 和 `git diff --check`。

## 完成输出

- 列出 completion hook/outbox、snapshot contract、approval eligibility 和 lifecycle transitions。
- 给出 completion 不被 learning failure 阻塞、审批权限与 `0/3` 证据。
- 列出 i18n/视觉验证，更新索引、报告、`HANDOFF.md`。
- 下一建议任务只能是 PARSER-PROFILE-06。
