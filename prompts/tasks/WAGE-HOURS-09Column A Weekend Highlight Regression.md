# 执行 WAGE-HOURS-09：Column A Weekend Highlight Regression

## 优先级与执行状态

- 优先级：P1。工资工时表已可正确生成，但办公室外部验收确认所有标准员工 Sheet 的
  A 列把 `THU`、`FRI` 错当成周末着色，影响人工识别周末。
- Task-Status: CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING
- 前置状态：`WAGE-HOURS-08` 的模板供应、生成、下载、隐私和当前环境自动化证据继续
  作为有效基线，但其 Microsoft Excel 外部验收未通过；不得把 08 直接标记 `DONE`。
- 本 Task 是 08 的窄范围样式回归修复。一个 fresh supervisor Session 只执行本 Task，
  不得顺带开始 `PUBLIC-DEPLOY-04` 或重做 WAGE-HOURS-01 至 08。
- 完成仓库实现和当前环境门禁后更新本文件、Task Index、完成度报告、专项验证报告与
  `HANDOFF.md`。没有完成 Microsoft Excel 外部复核时，终态只能是
  `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。

## 用户报告与已确认现象

用户确认工资工时表的生成内容已经正确，但还有一个样式细节：

> A 列单元格中，当前 `THU` 和 `FRI` 的底色发生变化；应改成 `SAT` 和 `SUN`
> 使用该底色，以表示周末。

现有脱敏 2026 年 6 月和 7 月输出已可复核出同一问题：A 列浅蓝周末底色跟随模板的
物理行位置，落在 `THU` / `FRI`，而不是根据生成日期的实际星期落在 `SAT` / `SUN`。
现有“输出样式等于模板同一物理行样式”的审计会把该错误判为通过，因此也必须修复
测试判定口径，不能只改截图或人工检查说明。

## 业务规则

1. 对每个标准员工工资 Sheet，在目标结算期间内：
   - A 列值为 `SAT` 或 `SUN` 时，使用模板既有的周末底色；
   - A 列值为 `MON`、`TUE`、`WED`、`THU` 或 `FRI` 时，使用普通工作日底色；
   - `THU`、`FRI` 不得再保留周末底色。
2. 周末判定必须来自每一行写入的实际 `work_date`，等价于 Saturday/Sunday；不得依赖
   某个月第一天是星期几、模板行号、`dayNumber % 7`、源文件文字或前一个月的静态样式。
3. 本需求只调整标准员工 Sheet 的 A 列 weekday cell 底色。日期、工时、午休、上下班
   时间、TOTAL、公式、边框、字体、对齐、换行、数字格式、保护、行高、列宽、合并、
   打印设置及 B-F 列样式保持既有合同。
4. 周末底色必须复用当前获批模板的既有视觉样式，不自行发明新颜色。除底色这一语义
   差异外，A 列单元格应保留各 Sheet 自身的字体、边框、对齐、保护等属性。
5. 28/29/30/31 天月份均适用。短月份未使用的日期槽位必须清空 weekday/date/value，
   A 列使用普通空白槽样式，不得因模板原行残留周末底色。
6. 规则适用于第一个、中间和最后一个标准员工 Sheet；受保护 `ADJUSTMENTS` 或其他
   非标准 Sheet 必须逐字节/逐结构保持不变。
7. 已生成的历史工资文件属于不可变审计记录，不自动回写或覆盖。办公室重新生成后才
   获得修复后的新工资文件，既有 generated-file history/status/download 语义不变。
8. `SAT` / `SUN` 是获批工资文件版式中的英文星期缩写，不随 Web locale 翻译；本 Task
   不把 Web 界面改成双语，也不改变页面 locale 行为。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/02-work-hours-and-unloading-wage-settlement.md`
- `docs/runbooks/work-hours-settlement-regression.md`
- `prompts/tasks/WAGE-HOURS-08Parsed Attendance Wage Workbook Generation Regression.md`
- `docs/reports/wage-hours-08-generation-regression-verification.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.agents/skills/diagnosing-bugs/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `document-skills:xlsx`（legacy BIFF `.xls` 样式审计与视觉验证）
- `apps/worker-python/src/worker_python/wage/generator.py`
- `apps/worker-python/src/worker_python/wage/legacy_xls.py`
- `apps/worker-python/src/worker_python/wage/template.py`
- `apps/worker-python/templates/wage/bestar-wage-template-v1.xls`
- `apps/worker-python/templates/wage/bestar-wage-template-v1.json`
- `apps/worker-python/tests/unit/test_wage_generation_regression.py`
- `apps/worker-python/tests/unit/test_wage_generator_formatting.py`
- `scripts/audit-wage-hours-08-workbook.py`
- `scripts/run-wage-hours-08-e2e.sh`
- `scripts/render-wage-hours-08-visual.sh`
- `test-results/wage-hours-08/visual/` 的脱敏历史证据，只读用于建立红灯
- `samples/attendance_test/*.xls`：用户提供的 7 月现场真实样本，只能在受控 runner 中
  只读验证，不得把姓名、Sheet 名或打卡详情写入日志、截图、报告或 handoff

## 修改前必须建立的红灯

先建立一个数秒级、确定性、可由 Agent 无人值守运行的 BIFF 样式检查，再改实现：

1. 使用脱敏输入生成至少 2026-06 和 2026-07 两个月的 `.xls`。这两个月的月初星期
   不同，必须证明检查不是只对某一个固定行序列有效。
2. 对每个标准员工 Sheet，按 B 列实际日期反算正确星期，并同时读取 A 列文字及
   normalized XF/fill。红灯必须明确得到：
   - 至少一个 `THU` / `FRI` 使用了周末底色；
   - 至少一个 `SAT` / `SUN` 没有使用周末底色；
   - 检查命令以非零状态失败，而不是只输出 warning。
3. 把这个最小复现转成 regression test。不得以“输出与同一模板物理行 XF 相同”为
   成功条件；这正是旧门禁漏检本缺陷的原因。
4. 根因诊断按 `diagnosing-bugs` 执行，列出并逐一证伪 3-5 个假设。至少检查：
   - `LegacyXlsTemplateEditor.write()` 是否始终继承目标物理格的静态 XF；
   - 脱敏模板是否保留了历史 6 月 `THU` / `FRI` 行的填充位置；
   - wrap/dimension 派生 XF 是否会覆盖新的 weekday style；
   - 视觉审计是否只比较模板位置而未验证日期语义。

## 实现要求

### 1. 语义化 weekday style

1. 在工资生成边界建立明确的 `weekday` / `weekend` A 列样式角色。实现可以扩展
   `LegacyXlsTemplateEditor` 的受控 style override，或采用等价的窄范围 BIFF 方案，
   但调用方必须按 `work_date` 选择角色。
2. 样式角色必须来自获批模板合同，并在缺少、歧义、超出范围或不能证明安全时 fail
   closed，返回稳定错误；不得按出现频率、文件名、员工名、当前月份或任意固定行号
   猜测周末样式。
3. 复用有限数量的既有或确定性派生 XF。不得为每个日期/员工重复追加新 XF，避免
   legacy BIFF style table 膨胀或超过 stream capacity。
4. 如果与自动换行组合需要派生 XF，组合数必须有固定上限，并证明 fill、font、border、
   alignment、number format 和 protection 都符合预期；不能让 wrap 修复把周末底色覆盖。
5. `bestar-wage-template-v1.xls` 的二进制和 approved SHA 原则上保持不变。若红灯证明只有
   修订模板才能安全实现，必须先说明原因，并同步模板版本/SHA、manifest、API/Worker
   preflight、Docker image supply、clean tracked checkout 和部署文档；不得临时替换
   正在运行容器中的文件。

### 2. 写入、空槽与保存后验证

1. `_write_employee_sheet` 写入 A 列 weekday 文本时，在同一调用中选择正确语义样式，
   避免先写值、后靠不受控二次扫描修改整个 workbook。
2. `_write_empty_day` 必须同时清除旧 weekday 值和周末语义样式；30 天的第 31 槽、
   2 月的第 29-31 槽不得残留浅蓝底。
3. staging workbook 发布前的 saved-file validator 必须验证所有标准 Sheet 的：
   - B 列日期属于目标期间且有序；
   - A 列文字与实际星期一致；
   - 只有 `SAT` / `SUN` 使用周末底色；
   - `MON` 至 `FRI` 使用普通底色；
   - 空槽无周末底色。
4. 任意员工 Sheet 出现 style/date/weekday mismatch 时，生成必须失败并精确清理 staging；
   不得记录为 `GENERATED` 或提供下载。错误只返回 stable stage/code 和安全计数，不能
   泄露员工姓名、Sheet 名、路径或工资数据。

### 3. 保持现有流程不回归

1. 工时计算、打卡奇偶规则、午休、员工排序/映射、16-Sheet 容量、特殊 Sheet 保护、
   filename、manifest、SHA、generated-file history 和下载流程保持不变。
2. 不增加数据库字段或 migration；如果实现意外需要 schema 变更，先停止并证明需求，
   不能为一个 A 列底色修复扩大数据模型。
3. 不修改历史 `samples/wage/20260601-0630_wageRecords.xls`，不把它重新用作运行时模板。
4. 不改变 B-F 列中既有的黄色人工/异常提示等业务样式；本 Task 只移动 A 列的周末底色
   语义，不把整行统一着色。

## Strict i18n 硬门禁

1. 本 Task 正常情况下不新增 Web 文案。若新增错误、进度或复核提示，API/Worker 只返回
   stable code/enum/count，Web 必须通过 typed `en` / `zh-CN` catalog 映射。
2. English 页面只显示 English，中文页面只显示中文；不得显示 raw Worker English、
   Python exception、catalog key 或中英双语拼接。
3. 工资文件中的员工名、日期和 `MON` 至 `SUN` 属于模板业务数据，不经过 Web DOM
   翻译器；禁止为满足 i18n 把同一格写成 `SAT / 周六`。
4. 若 Web/API 文件状态完全未改，仍必须运行 catalog parity、unmanaged-string 和既有
   Work Hours no-flash 门禁，并在验证报告中明确“无新增用户可见文案”。

## 必须新增或更新的测试

### Worker / BIFF

1. 单元测试覆盖 `date.weekday()` 的全部七天：仅 Saturday/Sunday 返回 weekend style。
2. 生成 2026-06、2026-07、闰年 2 月和至少一个 28/30 天月份，逐个有效日期格验证
   A 值、B 日期和 fill 语义；未使用槽位为空且无周末底色。
3. 第一个、中间、最后一个标准员工 Sheet 均覆盖；最好逐个检查全部 16 个标准 Sheet。
4. 验证 A 列周末格除 fill 外的 normalized style 与该 Sheet 普通 A 格合同一致；B-F 列、
   TOTAL、公式、merge、ROW/COLINFO、print metadata 和 `ADJUSTMENTS` 不变。
5. 保存再打开后重复语义检查，证明不是只在内存对象中正确。验证 XF count 增量为固定
   上限，多员工、多月份不会线性膨胀。
6. 模板、历史参考和现场 7 月样本的 SHA 在测试前后不变。

### Full stack / visual

1. 将语义 weekday-style 审计接入现有 WAGE-HOURS-08 真实 nginx/BullMQ/Chromium
   upload -> Parse -> Generate -> list -> protected download runner；真实样本证据只记录
   period/count/hash/code，不记录员工或打卡内容。
2. 使用脱敏 6 月和 7 月输出做 Docker LibreOffice PDF/PNG。至少逐图检查包含连续
   `FRI -> SAT -> SUN -> MON` 的第一个、中间和最后一个标准员工 Sheet，证明只有
   A 列 `SAT` / `SUN` 为周末底色，其他列既有样式未漂移。
3. 视觉审计输出 machine-readable counts，例如 valid date cells、weekend cells、weekday
   cells、style mismatches 和 blank-slot mismatches；不得只写“style differences = 0”。
4. 运行既有 Work Hours Chromium/i18n smoke，确认 Generate、文件列表和下载未回归，
   console、pageerror、failed request、hydration 和 missing translation 均为 0。
5. runner 继续使用唯一前缀、trap/finally、故意失败 cleanup 探针和精确 DB/storage/runtime
   清理；不得删除真实样本、历史工资文件或非本 Task 数据。
6. 更新 `docs/runbooks/work-hours-settlement-regression.md`，加入按实际日期核对 A 列
   `SAT` / `SUN` 底色的 Microsoft Excel/LibreOffice 步骤，并明确禁止以模板物理行
   XF 相等作为周末规则的替代证据。

## Docker-only 验证

先跑 focused 红绿循环，再跑共享回归，所有命令均在 Docker 中执行：

```bash
docker compose -f infra/docker/compose.local.yml up -d --build worker-python api web nginx
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest \
  tests/unit/test_wage_generation_regression.py \
  tests/unit/test_wage_generator_formatting.py
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
scripts/run-wage-hours-08-e2e.sh verify
scripts/healthcheck.sh
git diff --check
```

如果变更严格局限于 Worker/BIFF，API/Web 全量门禁仍需确认共享接口未回归，但不得为了
本小修复新增重复的 E2E 基础设施。优先扩展现有 WAGE-HOURS-08 runner 的语义断言，并
在 `docs/reports/wage-hours-09-weekend-highlight-verification.md` 记录实际命令、计数和证据。

## Microsoft Excel 外部复核

当前环境完成全部自动化后，由办公室在 Windows Microsoft Excel 中通过真实
`/work-hours` 流程重新生成一份获批月份工资表，并检查：

1. 第一个、中间、最后一个员工 Sheet 的 A 列仅 `SAT`、`SUN` 使用周末底色；
2. `THU`、`FRI` 与其他工作日底色一致；
3. 2 月或 30 天月份的空槽没有残留周末底色；
4. 日期、工时、行高、列宽、其他单元格颜色、Print Preview 和下载文件名未回归。

只有该复核通过后，本 Task 才可 `DONE`。通过时同步记录 WAGE-HOURS-08 的旧外部门禁
已由 09 关闭；不得回头重跑 08 作为另一个业务 Task。

## 验收标准

1. 每个标准员工 Sheet 的 A 列只在 `SAT` / `SUN` 使用获批周末底色，`MON` 至 `FRI`
   使用普通底色，短月份空槽无周末底色。
2. 判定基于实际日期，跨 28/29/30/31 天、不同月初星期和全部员工 Sheet 均正确；不存在
   固定行号或 6 月模板位置依赖。
3. B-F 列、公式、TOTAL、特殊 Sheet、其他业务颜色、dimensions、print metadata、模板
   供应、工资计算和下载历史无回归，历史 generated files 不被改写。
4. 新 BIFF 语义审计能在旧错误输出上稳定失败，在新输出上通过；不再以“模板物理行
   样式相等”代替周末业务规则。
5. focused 与全量 Docker Worker/API/Web、真实 full-stack、LibreOffice 视觉、strict
   i18n、privacy、cleanup、healthcheck 和 diff check 全通过。
6. 专项验证报告、Task Index、完成度报告和 `HANDOFF.md` 与真实状态一致；无 Excel
   复核时准确停在 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。

## 非目标

- 不修改打卡解析、奇偶工时、午休、费率、税、加班或工资金额。
- 不重做工资模板品牌、配色体系或所有列/整行周末高亮。
- 不改变员工 Sheet 容量、员工匹配、文件覆盖/历史策略、考勤删除或审计规则。
- 不修改拆柜工资、拆柜报告、POD、库存、Dashboard、登录或公网部署。
- 不用 CSS、Web 预览或截图后处理掩盖 `.xls` 文件中的真实样式错误。

## 完成输出

- 列出根因、最小 BIFF 修复、changed files 和实际测试计数。
- 提供旧输出红灯与新输出绿灯的 machine-readable 摘要，以及已人工查看的脱敏页面。
- 明确模板二进制/SHA 是否变化；若未变化，写明继续使用原批准模板。
- 明确 Microsoft Excel 外部复核是否完成，不得把 LibreOffice 结果冒充 Excel 验收。
- 给出唯一下一步；不得在同一 Session 自动执行 `PUBLIC-DEPLOY-04`。

## 当前执行证据（2026-08-01 MDT）

- 已建立并保留跨 2026-06/07 的旧输出语义红灯：两月各 36 个 style mismatch，检查均以
  非零状态失败；旧 positional XF 相等不再作为成功条件。
- 已按实际 `work_date` 实现 weekday/weekend 样式角色、空槽恢复和保存后 fail-closed
  验证。模板二进制、历史工资参考和受控真实考勤源 SHA 均未改变；XF 数保持 107。
- Docker Worker 247 tests、API 409 unit / 131 E2E、Web 285 tests、lint/typecheck、真实
  Chromium full-stack、cleanup/privacy、LibreOffice 150 页和 machine audit 均通过。
  脱敏 6/7 月合计 976 个日期格、256 个周末格、720 个工作日格，全部 mismatch 为 0。
- 已逐图检查 6/7 月第 1、15、47 页，覆盖第一个、中间和最后一个标准员工 Sheet；
  仅 A 列 `SAT` / `SUN` 为浅蓝底，B-F 既有业务颜色保持。
- 无 schema/migration 变更，无新增 Web 用户可见文案；strict i18n/browser errors 为 0。
- 详细证据见 `docs/reports/wage-hours-09-weekend-highlight-verification.md`。
- 唯一剩余 gate：办公室 Windows Microsoft Excel 重新生成并检查首/中/末员工 Sheet、
  2 月或 30 天月份空槽、其他颜色/尺寸、Print Preview 和文件名。通过前本 Task 不得
  `DONE`，也不得启动 `PUBLIC-DEPLOY-04`。
