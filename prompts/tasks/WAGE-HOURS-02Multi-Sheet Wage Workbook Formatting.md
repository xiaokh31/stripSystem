# 执行 WAGE-HOURS-02：Multi-Sheet Wage Workbook Formatting

## 优先级与前置任务

- 优先级：P0 工时表生成质量回归。
- 前置任务：`WAGE-HOURS-01` 必须达到受监督终态。
- 本任务只处理 Worker `.xls` 生成器和结构验证；不要提前重做 Web 页面。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/02-work-hours-and-unloading-wage-settlement.md`
- `prompts/tasks/WAGE-P0-03Wage Record Generator + Task Report.md`
- `prompts/tasks/WAGE-HOURS-01Attendance Punch Parity Calculation Contract.md`
- `.codex/skills/qa-regression/SKILL.md`
- spreadsheet skill/instructions available to the Agent；注意本项目产物是 legacy `.xls`，不得误用只支持 `.xlsx` 的写法
- `apps/worker-python/src/worker_python/wage/generator.py`
- `apps/worker-python/tests/unit/test_wage_attendance.py`
- `apps/worker-python/tests/integration/test_wage_p0_cli.py`
- `samples/wage/20260601-0630_wageRecords.xls`
- `samples/wage/workAttendanceRecordForm_June.xls`

## 已确认根因与模板风险

1. `xlutils.copy` 能复制模板，但当前每次 `writable_sheet.write(row,col,value)` 未传入对应 template style，写入后使用默认 XF；第一个未匹配 Sheet 看起来正常，后续实际写入的 Sheet 配色/边框/number format 被覆盖。
2. style audit 已确认 matched Sheet 的 data cells 从模板 style 83-86 变成同一个默认 style，而 row height/column width 只是偶然沿用 sheet metadata。
3. 当前 fuzzy employee matching 可把 `deng wei` 同时匹配到 `司机WeiSheng Hong` 和 `Wei Deng`。
4. `司机WeiSheng Hong` 是 `SHIFT&REMARKS` / delivery-statistics 特殊表，不具备标准 `LUNCH HOURS`、`START TIME`、`END TIME` contract；generic writer 不能覆盖其 4-6 列。
5. `Wei Deng` 在标准表头后有 `补4月工时` 调整行，不能被当成当月第一天覆盖或造成日期整体错位。

## 实现要求

### Sheet 与员工匹配

1. 标准工时 Sheet 必须精确识别 `DATE`、`HOURS`、`LUNCH HOURS`、`START TIME`、`END TIME` 五列；只有完整 contract 才能交给 generic writer。
2. 特殊/非标准 Sheet 原样保留，并在 generation warnings 记录 stable code；不得为了消除 warning 擅自清空或重排。
3. employee-to-sheet 与 sheet-to-employee 都是一对一；使用 employee id/name normalization 时必须避免短 token/sub-string 误配。
4. ambiguous/multiple match 留下结构化 warning 并不写该 Sheet；不得将同一员工数据写进两个 Sheet。
5. 日期槽位识别必须跳过现有 adjustment/note row，例如 `补4月工时`，并保留其值、样式和位置。

### 模板格式保真

1. 模板只读复制，生成前后 source SHA-256 完全一致。
2. 所有写入路径都携带该 Sheet、该位置对应的 template style：weekday、date、hours、lunch、start/end、空值 `/`、review marker 和 TOTAL row 均不能退回默认 style。
3. 比较/保留 fill/pattern/color、font、border、alignment、wrap、number format 和 protection；测试比较 normalized properties，不依赖保存后可能重映射的 raw XF id。
4. 保留 merged cells、formulas、print area、page setup、page breaks、freeze panes、hidden rows/columns/sheets 和未触及单元格。
5. 不允许“把第一个 Sheet 的 style 复制到所有 Sheet”；每个 Sheet 使用自己的模板格式。

### 内容自适应尺寸

1. 每个目标 Sheet 从模板 row height/column width 开始，绝不缩小。
2. 对本次写入范围做 deterministic content measurement：ASCII/数字按单宽、CJK 按双宽，按最长换行段计算并加有限 padding。
3. 内容超出时扩大列宽；需要换行的文本启用 wrap，并按实际行数提高 row height。
4. 设定 print-safe 上限，超长内容应换行而不是让单列无限变宽；算法常量集中命名并有边界测试。
5. 相同输入重复生成得到相同尺寸；不要依赖桌面 Excel 打开后的隐式 AutoFit 才可读。

## I18n 100% 硬门禁

- 本任务原则上不新增 Web 文案。
- generation warning 使用 stable code + raw sheet/employee details；HTML task report 的可见说明如有新增，必须按既有报告策略管理，不得输出中英拼接句。
- Sheet 中模板固有英文属于用户提供的模板内容，不得借任务擅自翻译或重设计。
- API/Web i18n gate 不得削弱。

## 结构回归要求

1. 真实模板每个 Sheet 都建立 before/after inventory：name、dimensions、merges、headers、target status、row/column dimensions、key styles。
2. 对每个 eligible Sheet 的每个 touched cell 比较 normalized style；至少显式断言第二、第三、中间和最后 eligible Sheet。
3. 断言 `司机WeiSheng Hong` 的 values/styles/dimensions 未被 generic writer 修改。
4. 断言 `Wei Deng` 的 `补4月工时` 行原样保留，六月 1 日写入正确日期槽位。
5. 合成长 ASCII/CJK/multiline fixture 证明列宽/行高会扩展、不会缩小、不会越过上限且重复生成稳定。
6. wage output 可由 `xlrd` 重新打开，sheet count/order 保持，生成 manifest/SHA/size/history contract 不变。

## 非目标

- 不新建模板没有的员工 Sheet，不猜测未提供的员工映射。
- 不把 `.xls` 改成 `.xlsx`，不使用 openpyxl 保存 legacy workbook。
- 不修改 odd/even 规则，除非修复 `WAGE-HOURS-01` 明确发现的回归并重跑其 tests。
- 不修改 `/work-hours` UI、RBAC、拆柜工资或其他报告模板。

## Docker 验证

```bash
docker compose -f infra/docker/compose.local.yml up -d --build worker-python
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest tests/unit/test_wage_attendance.py tests/integration/test_wage_p0_cli.py
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
git diff --check
```

路径可按容器 workdir 调整。不得在宿主安装 Excel/Python 依赖。

## 验收标准

1. 所有 eligible generated sheets 的颜色、字体、边框、alignment 和 number formats 与各自模板对应单元格一致。
2. 任何 write helper 都不会默认为无格式 style；TOTAL、空值和 review 行同样受保护。
3. 非标准司机 Sheet 与 adjustment row 不被覆盖，一对一 matching 可证明。
4. 长内容触发行高/列宽扩展且保持打印安全；普通内容维持模板尺寸。
5. 原模板 SHA 不变，输出/manifest/task report 正常，Worker 全量 tests 与 diff check 通过。
6. `HANDOFF.md` 记录具体 matched/unmatched/special sheets、测试和下一项 `WAGE-HOURS-03`。

## 完成输出

- 写出根因、格式复制方法、尺寸算法、每个 Sheet 的处理结果及 warnings。
- 更新本 Task、Task Index、完成度报告和 `HANDOFF.md`。
