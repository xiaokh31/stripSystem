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

## 执行结果（2026-07-21 MDT）

- 状态：`DONE`。
- 根因扩展审计：除已知的 `write(..., value)` 默认 XF 覆盖外，`xlutils.copy` 还会把源模板的 137 个
  BIFF `FORMULA` 记录全部保存为缓存值。生成器现复制原 OLE 文件，并只补丁明确目标的 BIFF cell、`ROW`、
  `COLINFO` 与必要的 `BOUNDSHEET` offset；写入单元格沿用其模板 XF，长内容需要 wrap 且原 XF 未启用时只克隆
  该 XF 并开启 wrap。未触及 formula、defined name/print area、page setup、merge、page break、pane、hidden state、
  row/column metadata 和 Sheet 二进制内容继续保留。
- Sheet contract/matching：10 个真实模板 Sheet 中 9 个具备完整五列表头；其中 7 个以 exact normalized token
  一对一匹配并生成，2 个标准 Sheet 因没有可靠 employee exact-token match 原样保留，1 个
  `SHIFT&REMARKS`/delivery-statistics 特殊司机 Sheet 以
  `WAGE_TEMPLATE_SHEET_UNSUPPORTED_CONTRACT` warning 原样保留。短 token/sub-string 不再匹配；
  `WAGE_TEMPLATE_SHEET_EMPLOYEE_AMBIGUOUS`、`WAGE_TEMPLATE_EMPLOYEE_MULTIPLE_SHEETS` 和
  `WAGE_TEMPLATE_SHEET_NOT_MATCHED` 均阻止对应 Sheet 写入。
- 日期槽位只接受 weekday + date 组合，`Wei Deng` 表头后的 `补4月工时` adjustment row 值、样式、merge 和位置
  保持不变；2026-06-01 正确写入下一行。零打卡 `/`、legacy review marker、TOTAL、weekday/date/hours/lunch/time
  均覆盖 normalized style 回归。时间写入遇到模板 General 单元格时使用可读 `HH:mm` 文本，遇到时间 number
  format 时使用 Excel time fraction，避免显示小数或误扩列。
- 尺寸算法：ASCII/数字宽度为 1，CJK full/wide 为 2，按最长换行段加 2 字符 padding；列宽上限 32 字符，
  行高上限 1920 twips。计算从模板尺寸开始且只增不减，按最终列宽推导实际 wrap 行数；合成长 ASCII、CJK、
  multiline fixture 已证明扩展、有界和相同输入 SHA 稳定，普通真实输入所有 row/column dimensions 不变。
- 真实输出可由 `xlrd(formatting_info=True)` 重开，保持 10 个 Sheet 的数量/顺序和全 Sheet 结构 inventory；
  7 个 matched Sheet 的模板 data/TOTAL formulas 被预期生成值替换，3 个原样 Sheet 的 5 个 formula records
  继续保留，manifest 的 path/SHA/size/type/template SHA/history contract 与 HTML task report 保持正常。
- Docker 验证：新增格式结构测试 4 passed；任务定向测试 15 passed；Worker 最终全量 179 passed（191.07s）；
  changed-file Ruff、2 个 source file Mypy、`git diff --check` 均通过。
- 下一项只能是 `WAGE-HOURS-03Employee Monthly Attendance Review UI.md`；本 Session 未启动 UI/API/数据库工作。

## 完成后代码审查补充门禁（2026-07-21 MDT）

以下复审发现必须在本 Task 内修复并重跑既有门禁；本节关闭前，上述 `DONE` 结果不构成最终完成：

1. employee-to-sheet matching 必须真正支持 employee id 或 name。缺少 name 但存在可靠 id 的记录不得在 id 检查前被拒绝；
   name token 还必须有显式最短长度门槛，并用短 token fixture 证明不会误配。
2. 日期槽位不能把任意正数当日期。即使 weekday 列看似有效，数字备注/调整行也必须保留；只接受能证明属于当前生成月份的
   Excel date serial 或完整日期文本，并新增带 weekday + 正数备注的回归。
3. 真实模板 before/after inventory 必须显式包含 headers、target status 和 key styles，并逐 Sheet 断言；对未写 Sheet 还要比较
   未触及 values、formulas 和结构，而不只比较部分样式或 formula 数量。
4. 修复后重跑 Docker 定向测试、Worker 全量 pytest、Ruff、Mypy 与 `git diff --check`，再同步 Task/index/report/HANDOFF 的最终状态。

## 代码审查补充门禁关闭（2026-07-22 MDT）

- 状态：`DONE`。employee id 与 name 现在独立进行 exact normalized-token 匹配；缺少 name 但具备可靠 id 的记录可写入，
  name 的每个 token 均要求至少 3 字符，短 token、substring、ambiguous sheet 和 multiple sheets 继续保持不写并输出
  stable warning。
- 数字日期只在 BIFF cell type/number format 被 `xlrd` 识别为 Excel date 时才进入候选；文本只接受完整
  `YYYY.M.D` / `YYYY-M-D` / `YYYY/M/D`。优先使用生成期日期；真实 office 模板的 2026-05 占位网格仅因完整、
  有序覆盖 1-31 日而获准复用。带 weekday 的普通正数备注保持 values/styles 不变，`Wei Deng` 调整行继续原样保留。
- 真实 10 Sheet before/after inventory 现逐 Sheet 显式包含 headers、target status 和 key normalized styles；7 个 matched
  Sheet 逐 touched cell 比对，`Rui Zhou`、`司机WeiSheng Hong`、`JIANMING ZHANG` 逐 Sheet 比较 values、styles、
  formulas 和结构。结果仍为 7 matched、2 unmatched standard、1 unsupported special。
- Docker 最终验证：格式/attendance/CLI 定向 17 passed；Worker 全量 181 passed（210.96s）；changed-file Ruff passed；
  `generator.py` 与 `legacy_xls.py` Mypy passed；`git diff --check` passed。原样例和模板未修改，不涉及 migration/API/Web。
- 下一项仍只能是 `WAGE-HOURS-03Employee Monthly Attendance Review UI.md`；本 Session 未启动下一 Task。
