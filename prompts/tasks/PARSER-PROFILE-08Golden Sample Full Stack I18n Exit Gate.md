# 执行 PARSER-PROFILE-08：Golden Sample Full Stack I18n Exit Gate

## 优先级与前置任务

- 优先级：P0 parser profile 最终业务退出门禁。
- 前置任务：PARSER-PROFILE-01 至 07 必须 `DONE`。
- 数据前置：一个客户稳定布局要达到 TRUSTED，需要至少 4 份不同 SHA 的真实/明确脱敏 source + approved outcome pair：1 份首版学习/批准，3 份后续连续 evidence。
- 数据不足时先完成所有可自动化的仓库验证，终态只能诚实列出 missing real-pair/business signoff，不得伪造 TRUSTED。
- 本 Task 完成后不自动启动其他 Task。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `docs/product/04-adaptive-parser-profiles.md`
- `docs/adr/0004-approved-parser-profiles.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/unloading-report-generator/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `.codex/skills/frontend-design/SKILL.md`
- parser/import/report/pallet/inventory/loading/i18n E2E 与 runbooks
- 用户提供的 source/finished report/mapping evidence；原文件不得修改

## 目标

使用真实 golden pairs 完整证明“失败导入 -> 手工 mapping/report -> 已拆完 snapshot -> replay -> 明确批准 -> 连续 3 个 distinct-SHA 无实质修正复核 -> TRUSTED -> 下一相似清单自动解析”，并关闭 RBAC、审计、i18n、视觉、性能、回退和既有业务回归。

## Golden Pair Intake

每份 pair 记录：

- customer/layout display label；
- original filename、SHA-256、格式与是否脱敏；
- 对应 canonical mapping/snapshot；
- final unloading report；
- expected destination/cartons/volume/container number；
- 预期特殊规则、summary rows、merged headers、formula/cache、known variation；
- business reviewer 和签字日期（可在仓库报告中用角色/脱敏标识，不写敏感个人信息）。

Original workbook 继续进入项目规定的真实样本/storage 管理，不修改模板或业务 bytes。不要把 generated synthetic workbook 作为 customer acceptance；synthetic 只允许补技术边界。

## 必测主链

1. Pair A 先走 unsupported/failure，创建 learning case/manual report/mapping。
2. 标记已拆完，snapshot/replay passed；OFFICE 无 approve 权限，authorized approver 明确批准，得到 REVIEW_REQUIRED 0/3。
3. Pair B/C/D 分别匹配同 version 并无 material correction accept，稳定展示 1/3、2/3、3/3 后 TRUSTED。
4. 第五份相似真实文件如可提供，验证 trusted auto-parse；若没有，用项目现有另一份同布局真实 fixture 验证 automation，并把新客户第五份列为业务 signoff。
5. Auto result 生成拆柜报告并与 approved expected destination/cartons/pallet outcome 对账；模板 bytes 保持不变。
6. 进入 container detail/库存/已拆完/装车建议等只读验证，确认下游继续使用持久 backend data。

## 必测负向与安全链

- one pair 不得 TRUSTED；同 SHA 重复三次不得增加 streak；material correction 重置 streak。
- trusted output material correction 会 demote 为 REVIEW_REQUIRED，下一 import 不自动 commit。
- required header drift、moved column outside tolerance、profile collision、paused/retired、stale queued version 均回退。
- missing destination/cartons/volume、zero volume with cartons、formula cache missing、inspection limit 明确 warning/error。
- import delete 在 case/evidence 引用时阻止且不删原文件；closed unused draft 按批准规则释放。
- no permission、cross-role route、stale draft/approval、duplicate accept、concurrent third evidence 有稳定结果。
- Worker/API failure 不回滚 manual report、unloading completion、inventory 或 loading history。

## 严格 i18n 最终门禁

1. 扫描整个新增 Worker/API/Web surface，所有 user-visible copy、状态、profile/match/diff/error、placeholder、tooltip、ARIA 和 dynamic message 都有 typed `en`/`zh-CN` ownership。
2. API/Worker response 只含 stable code/enum/labelKey/raw data；Web 不显示后端自由文本为主提示。
3. English -> 中文 -> refresh -> English 覆盖 failed import、wizard、preview/replay、profile list/detail、approval、review 1/3..3/3、trusted、drift/collision/demotion。
4. 禁止可见双语、raw enum/code、source-string fallback、首帧英文闪现、hydration mismatch。
5. Source workbook 的客户原文保持原样并在 UI 中明确属于“原始数据”，不能被翻译系统误改。

## 视觉、可访问性与性能门禁

- Docker Chromium desktop/mobile 覆盖 390/768/1366/1920、light/dark、200% zoom；mapping/source preview/diff 不重叠、无页面级横向 overflow。
- Keyboard/screen reader 完成 sheet/field mapping、preview、submit、approval 和 review accept；focus/error semantics 完整。
- 对最终高信号截图逐张人工查看，不用大量截图数量替代检查；报告记录截图清单和结论。
- 真实 workbook inspection/match/preview/parse duration、memory/row limit、DB query count 有证据；built-in import 无明显性能回归。

## 回归范围

- 全部 Worker parser/calculator/report/label tests。
- API imports/containers/corrections/generated files/delete/queue/RBAC/inventory/loading/wage relevant unit/E2E。
- Web imports/containers/profile/i18n/theme/no-flash/permissions relevant unit/E2E。
- Duplicate scan、pallet inventory source-of-truth、manual pallet override、unloading/loading state split 保持。
- Existing 真实 fixtures 的 built-in parser output 不因 profile engine 无意改变。

## 完成文档

1. 新增 parser profile verification report，记录 sample hash（脱敏）、mapping/profile versions、审批、evidence streak、trusted/fallback、测试命令、截图和残余限制。
2. 更新 `docs/reports/project-completion-status.html` 与 Task index 的 01-08 真实状态。
3. 增加操作 runbook：办公室如何建立/复核模板，管理员如何批准/pause/retire，遇到 drift 如何回退；全部双语 UI 名称与 stable code 分离。
4. 不把真实客户敏感 workbook 内容贴进 HTML 报告或 handoff。

## 验收标准

1. 用真实证据完成首版明确批准和连续 3 个 distinct-SHA no-material-correction trust gate；任何样本不足都不能标 Done。
2. Trusted auto-parse、报告输出和 downstream persisted data 与 approved expected outcome 一致。
3. Negative/race/RBAC/audit/delete/drift/demotion 全部通过且无 silent success。
4. i18n/SSR/hydration/theme/viewport/zoom/accessibility 完整关闭，无双语或 raw-code 主显示。
5. Docker full-stack health、migration、API/Web/Worker tests/builds 和业务数据精确清理通过。
6. 所有 original files/profile versions/evidence/audits 保留，测试夹具不污染真实业务记录。

## 必须执行的测试

- `docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest`
- Docker API lint、typecheck、unit、E2E、migration status。
- Docker Web lint、typecheck、unit、production build。
- Docker Playwright focused parser-profile journey + locale/theme/no-flash/RBAC/visual matrix。
- `scripts/healthcheck.sh`、storage/database cleanup assertions、`git diff --check`。
- 真实业务 reviewer 对 sample mapping/report 的人工签字；Microsoft Excel 检查仅在该客户 report 需要 Excel-specific visual confirmation 时列为外部项。

## 完成输出

- 给出 4+ distinct source hashes、initial approval、三次连续 evidence、TRUSTED 和后续 auto-parse 证据。
- 给出 material reset/demotion、collision/drift、RBAC、i18n/视觉/性能和 cleanup 证据。
- 更新任务索引、完成度报告、verification runbook/report 与 `HANDOFF.md`。
- 只有全部验收完成才返回 `DONE`；真实样本或业务签字缺失时使用精确的 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`，不得伪造。
