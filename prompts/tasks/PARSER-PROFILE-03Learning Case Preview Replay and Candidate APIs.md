# 执行 PARSER-PROFILE-03：Learning Case Preview Replay and Candidate APIs

## 优先级与前置任务

- 优先级：P0 API/Worker learning vertical slice。
- 前置任务：PARSER-PROFILE-01、02 必须 `DONE`。
- 后续任务：`PARSER-PROFILE-04Office Mapping Wizard and Failed Import Flow.md`。
- 本 Task 不实现批准或 trusted auto-parse。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `docs/product/04-adaptive-parser-profiles.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/auth-rbac/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- PARSER-PROFILE-01 schema/API 与 02 Worker contracts
- imports worker invocation、queue/jobs、generated file、storage containment、correction audit 现有实现

## 目标

提供完整的 learning case inspect、draft mapping、preview、replay、diff 和 submit API，使 Web 可以在不读取内部 storage path、不执行任意 mapping code 的情况下完成候选 profile 教学。

## Learning Case 状态机

至少支持稳定语义：

- `OPEN`：case 已创建，未完成 inspection/mapping；
- `MAPPING`：有可恢复 draft；
- `READY_FOR_REPLAY`：definition 完整且 manual container 已关联；
- `REPLAY_FAILED`：最近 replay 有差异/错误；
- `AWAITING_COMPLETION`：mapping 可用但尚无 unloading completion snapshot；
- `AWAITING_APPROVAL`：后续 Task 生成 completion snapshot 并 replay passed 后使用；
- `CLOSED`：显式放弃且不参与 matching。

本任务不得把 inspect/preview success 当成 approval。

## API Contract

按现有 NestJS 路由风格实现稳定 endpoints，至少覆盖：

1. Learning case detail/list，支持当前用户权限与状态筛选。
2. `inspect`：读取保存的原始文件并返回 bounded workbook structure/candidate mappings。
3. `save draft mapping`：验证 mapping schema/version，乐观并发或 revision guard 防止覆盖他人编辑。
4. `preview`：执行 draft mapping，返回 canonical sample rows、destination summaries、provenance、warnings/errors。
5. `replay`：对 preserved original 执行完整 mapping，并与当前 manual container parser-relevant snapshot 做 structured diff。
6. `submit candidate`：只有 definition 完整、required fields 可追溯且无 blocker errors 时进入等待 completion/approval 的状态。
7. 结果 artifact/download（若现有 generated-file contract 适用），不暴露 storage 绝对路径。

具体 URL 可调整，但 DTO、permission、idempotency 和 stable code 必须文档化。

## Preview / Replay 规则

1. Preview 不能持久化或覆盖正式 container/destinations/pallets。
2. Replay pin 原始 import SHA、draft revision、mapping schema version 和 Worker version。
3. Diff 至少覆盖 container number、detail-row inclusion、destination set、per-destination cartons、canonical 3-decimal volume 和 parser-affecting reference/package evidence。
4. Pallet manual override、dock、worker/wage、loading status 不计入 parser diff。
5. manual outcome 缺少必需 volume 时明确返回 `PROFILE_EVIDENCE_VOLUME_UNVERIFIED`，不能把空值当相等。
6. Replay artifact/diff 必须可重复取得；新 replay 不静默覆盖历史 audit。
7. Worker/queue failure 更新 case state/error code，但不损坏 manual operational data。

## Candidate Profile Version

- Case 可拥有一个当前 draft version；submit 后 definition snapshot immutable。
- 再编辑必须创建新 revision/version，而不是覆盖已 submit/replayed definition。
- Profile display name/customer label 是管理 metadata，不能参与唯一 matching。
- 任意 candidate 仍为 `DRAFT`，本任务不得设置 `ACTIVE/TRUSTED`。

## 并发、存储与删除

- 同一 case 同时 inspect/preview/replay 使用 idempotency/revision 或 job guard，旧结果不能覆盖新 draft。
- 队列重试不能创建重复 profile versions/generated artifacts/evidence。
- 读取路径必须经过 storage root containment；不能接受调用方文件路径。
- Case/replay 运行中 import delete 返回稳定 blocker。
- 失败 artifact 要记录状态/错误，不能伪造成功空 JSON。

## 权限

- read 需要 `parser_profiles.read`。
- inspect/save/preview/replay/submit 需要 `parser_profiles.train`。
- OFFICE 可训练；WAREHOUSE/HR_MANAGER 默认 403；ADMIN 全部允许。
- 本任务没有 approve endpoint，不能通过 train 权限激活 profile。

## 严格 i18n 硬门禁

1. API/Worker 仅返回 stable code/enum/labelKey/raw header/data/structured params。
2. 所有 case state、inspection limit、mapping validation、preview warning、replay diff 和 queue failure code 都要加入 Web typed catalog contract。
3. 后端自由文本 message 只能用于日志/诊断，Web 主 UI 不得直接展示。
4. Header/customer values 保持 source data，不自动翻译；其周围 label/tooltips/ARIA 必须由 locale catalog 管理。
5. 新 contract tests 必须证明没有中文+英文拼接和 raw code 主显示要求。

## 非目标

- 不实现 mapping wizard 页面。
- 不监听 unloading completion。
- 不批准、pause、retire 或提升 trust。
- 不在 normal import path 自动选择 profile。

## 验收标准

1. 真实失败 import 可 inspect、保存/reload draft、preview、replay并生成可解释 diff。
2. Preview 无正式业务 mutation；replay failure 不改变 manual container/report/inventory/status。
3. revision/idempotency 防止 stale response 和 retry 覆盖最新 mapping。
4. 所有权限、storage containment、delete blocker、错误状态有 unit/E2E 证据。
5. API 不返回 internal path/localized UI sentence，profile remains DRAFT。

## 必须增加或执行的测试

- API unit：状态机、revision conflict、schema validation、preview no-mutation、diff/material field、artifact、queue retry/idempotency、storage containment。
- API E2E：真实 import bytes -> case -> inspect -> draft -> preview -> replay；RBAC；并发 stale revision；worker failure。
- Worker/API contract test：mapping/fingerprint/parser version/provenance shape parity。
- 现有 imports/corrections/generated files/delete/queue regression。
- Docker-only API lint/typecheck/unit/E2E 和必要 Worker focused tests；`git diff --check`。

## 完成输出

- 列出 endpoints、case state machine、job/idempotency 和 artifact contract。
- 给出真实 workbook preview/replay/diff 与 manual data 不受影响证据。
- 列出 stable i18n codes；更新索引、报告和 `HANDOFF.md`。
- 下一建议任务只能是 PARSER-PROFILE-04。
