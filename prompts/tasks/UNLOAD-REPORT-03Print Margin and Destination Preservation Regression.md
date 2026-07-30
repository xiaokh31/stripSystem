# 执行 UNLOAD-REPORT-03：Print Margin and Destination Preservation Regression

## 优先级与执行状态

- 优先级：P0，生成报告的业务数据缺失和打印版式回归会直接影响现场拆柜。
- Task-Status: SUPERSEDED_BY_UNLOAD_REPORT_04_AND_05
- 前置任务：`UNLOAD-REPORT-02` 的代码和自动化证据可复用，但其外部验收结论已被
  2026-07-28 现场打印结果推翻。
- 本 Task supersede `UNLOAD-REPORT-02` 的未关闭终态。不得重新执行 02，也不得仅补
  一次外部签字后把 02 改成 `DONE`。
- 只执行本 Task。达到终态后更新本文件、Task Index、完成度报告、验证报告和
  `HANDOFF.md`，不得在同一 Session 自动选择 POD 或其他 Task。

## 2026-07-29 产品澄清（优先于本 Task 下方旧布局文字）

- “所有单元格都可用”不表示从第一个目的仓开始就连续填入第 `4..19` 行。
- 每页 `1–8` 个目的仓必须只使用深色/灰色主行
  `4/6/8/10/12/14/16/18`，白色追加行保持空白。
- 每页达到 `9–16` 个目的仓时，才切换扩展布局并按纸面顺序使用
  `4/5/6/.../19`，不能出现 `1,9,2,10`。
- 17+ 仍按每页最多 16 条分页，每页按自身条目数选择主行或扩展布局。
- 本 Task 下方把 16 行视为所有数量下唯一连续 row map 的段落已经失效。权威修复
  任务是
  `prompts/tasks/UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md`。

## 对应用户现场反馈

完成 `UNLOAD-REPORT-02` 后：

1. 报告打印出来后，左侧原本应有的白色页边距消失，版面贴近纸张左边缘，不美观。
2. 生成报告后目的仓缺失。
3. 正常拆柜报告不应因为内容高度估算提前分页。模板现有的全部业务单元格都可以
   使用，必须先用完当前工作表的合法目的仓槽位，再处理真正的容量溢出。

## 产品结论

这不是单纯的“调大左边距”和“再写一次目的仓”。修复必须同时建立两个可验证的
输出契约：

1. **打印几何契约**：每个 populated worksheet 的实际打印结果必须保留模板左侧
   留白，不能只证明 OOXML 中存在 `pageMargins.left`。
2. **目的仓守恒契约**：进入报表 writer 的每一条 report-eligible pallet plan，
   必须在最终 API 下载的工作簿中按顺序出现且只出现一次，并与同一行托数、箱数
   一致。`writtenDestinationCount` 必须来自实际写入后校验，不能直接回填输入数量。
3. **容量优先单页契约**：模板当前由 `DESTINATION_ROWS` 定义 16 个合法目的仓
   槽位，包括灰色主行和白色追加行。`0–16` 条正常 report plans 必须只生成一个
   populated worksheet，并打印为一张 A4 landscape；不得因为估算总行高而提前
   留空槽位、复制 worksheet 或增加打印页。只有第 17 条及以后才按 16 条一组进入
   下一 worksheet。

修复必须保留 02 已完成的自适应行高和完整
`Palletizing Standards`、A4 landscape、generated-file/audit/download 和失败安全
清理，但必须替换 02 的“按估算打印高度提前分页”策略。不得用删除目的仓、缩小到
不可读、改变模板业务内容、裁掉左侧内容或禁用合法业务单元格来换取单页。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `prompts/tasks/UNLOAD-REPORT-01Palletizing Standards Rich Text Print Clipping Regression.md`
- `prompts/tasks/UNLOAD-REPORT-02Adaptive Cell Height and Printed Notes Regression.md`
- `docs/reports/unload-report-02-adaptive-layout-verification.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/unloading-report-generator/SKILL.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/nestjs-prisma-api/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- `apps/worker-python/src/worker_python/reports/excel_report_writer.py`
- `apps/worker-python/src/worker_python/reports/cell_map.py`
- `apps/worker-python/src/worker_python/reports/row_layout.py`
- `apps/worker-python/tests/unit/test_excel_report_writer.py`
- `apps/worker-python/tests/integration/test_batch_cli.py`
- report API、job、generated-file、download、Web error mapping 和 E2E tests
- `apps/web/e2e/report-package-inspector.py`
- `scripts/verify-unload-report-02.sh`
- `scripts/render-unload-report-02-visual.sh`
- `samples/templates/卸柜报告-En.xlsx`
- `samples/reports/EGSU9302760卸柜报告-En.xlsx`
- `samples/unloading-plans/CAAU8011090 UNLOADING PLAN.xlsx`
- 最新现场失败的原始导入文件、生成 `.xlsx`、Print Preview 或打印/PDF 证据；若含
  客户数据，只在受控本地环境诊断并脱敏记录，不得提交原件或写入 `HANDOFF.md`

## 修改前必须完成的只读诊断

先输出脱敏诊断证据，再修改代码：

1. 用当前生产镜像从同一原始文件走完 upload -> parse -> pallet calculate ->
   generate -> list -> download，记录每一层的目的仓数量和有序摘要：
   - parser destination summaries；
   - persisted container destinations；
   - pallet result plans；
   - page planner assignments；
   - workbook `N/O/P` canonical report rows；
   - API 下载 bytes 中的相同 rows。
2. 明确目的仓在哪一层首次丢失。原始明细的合法同目的仓聚合不等于丢失，必须按
   现有业务聚合规则说明 expected report plans；不得用 raw row count 代替报表行数。
3. 对重复目的仓名使用 source ordinal/occurrence index 追踪，不能用 `set` 或
   仅以 `destinationCode` 判重。
4. 比较模板、02 最终工件、当前现场失败工件的：
   - print area；
   - page margins；
   - page setup、fit/scale mode；
   - horizontal centering；
   - manual page breaks；
   - populated/empty worksheets；
   - PDF page box、内容 bounding box 和左侧实际留白。
5. 当前模板左边距约为 `0.503472in`，但不得因为 XML 中仍有该值就判定通过。
   现有 02 自动化只检查文本存在和整页目视，没有程序化比较模板与生成页的左侧
   physical whitespace，也没有从保存后的 workbook 反算真实 written count。
6. 单独确认 Microsoft Excel 是否因同时存在 `scale`、`fitToWidth/fitToHeight`、
   `fitToPage` 或 printer-specific setting 而重新解释打印缩放。必须根据证据建立
   单一、明确的有效 sizing contract，不能继续保留互相矛盾但“某个 renderer
   看起来正常”的设置。
7. 记录当前 page planner 对 `1/8/9/16/17` 条正常长度 plans 的 page assignments。
   如果 `plan_count <= len(DESTINATION_ROWS)` 却产生多于一个 populated worksheet，
   或存在未用合法槽位，必须记录为 02 引入的容量回归。

如果现场失败原件暂时无法提供，不得停止所有可自动化工作：使用现有真实结构 fixture
和专门构造的边界 fixture 复现并完成实现，最终以准确的 Microsoft Excel 外部门禁
结束；不得伪称已复现用户那一份具体文件。

## 任务范围

### 1. 目的仓端到端守恒

1. 定义 report-eligible canonical plan contract。writer 的直接输入仍以
   `pallet_result.plans` 为准；full-stack 测试必须另证明 parser/persisted
   destinations 按既有聚合规则完整形成这些 plans。
2. 为每条 plan 建立仅用于校验的有序 identity，至少包含：
   - logical ordinal；
   - destination 原始业务值或明确的 missing placeholder；
   - `finalPallets`；
   - `totalCartons`。
3. 分页 planner 必须以模板业务槽位容量为唯一正常分页边界：
   - `DESTINATION_ROWS` 当前 16 个槽位全部可用，容量必须从 cell map 派生，不能在
     planner 另写一个可能漂移的魔法数字；
   - `0–16` 条 plans 只允许一个 populated worksheet；
   - `17–32` 条 plans 才使用两个 populated worksheets，依此类推；
   - 除最后一页外，每个 worksheet 必须使用全部 16 个合法槽位；
   - 少于 16 条时，剩余槽位保持空白、可编辑、可打印，不得写假目的仓、占位数量
     或复制已有数据；“全部可用”指完整容量可用，不是必须填满；
   - 不得根据 `_required_sheet_height`、估算行高、长目的仓或 Standards 高度提前
     留空槽位并分页；
   - 灰色主行和白色追加行均属于合法业务槽位，不能只使用 8 个灰色行；
   - 表头、total 和 `Palletizing Standards` 区域不是目的仓槽位，不得为扩大容量
     覆盖或改作业务行。
4. 分页 planner 的输出还必须满足：
   - page assignments 展平后与输入 plans 长度相同；
   - 顺序和逐项内容相同；
   - 没有重复、跳过或额外 plan；
   - 不能用目的仓名称集合做比较。
5. workbook 的 canonical 输出以每个 populated worksheet 的 `N` 目的仓、
   `O` 托数、`P` 箱数为准；同一行 `C` pallet label mirror 必须与 `N` 相同。
   对每条 expected plan 必须逐项比较，不只检查最后一个目的仓或总托数。
6. 保存后重新打开最终 `.xlsx`，从实际 package/workbook 反向提取 written rows：
   - 展平后必须与 expected plans 完全一致；
   - populated worksheets 不能有额外非空业务行；
   - 目的仓相同但 ordinal 不同的记录仍分别保留；
   - 每页 total 和第一页 global total 继续符合既有契约。
7. `ExcelReportResult.writtenDestinationCount` 必须等于保存后实际验证数量；
   `totalDestinationCount` 等于 expected plan 数量。当前直接把两者都写成
   `len(plans)` 的伪校验必须移除。
8. 任一 planning/write/save/reopen 校验不一致时 fail closed：
   - 返回稳定错误码 `REPORT_DESTINATION_CONSERVATION_FAILED` 或等价 typed code；
   - details 只含 stage、expected/actual count、sheet/row/ordinal 等安全结构化字段；
   - 删除本次不完整临时文件；
   - 不写 SUCCESS manifest/generated-file，不允许下载伪成功报告；
   - 不覆盖同柜号上一份已成功生成的报告。
9. manifest/generated-file evidence 至少记录 expected count、written count 和有序
   校验 digest；不得把完整客户目的仓清单复制到日志、Task 或 handoff。
10. missing destination 继续使用现有 warning/manual-review 语义，不能静默写空白。
   placeholder 不能被统计逻辑当作“已正确解析目的仓”来掩盖上游缺失。

### 2. 左侧打印留白和统一页设置

1. 以只读模板的实际打印结果为 baseline。所有 populated worksheets 必须继承同一
   approved page margins、print area、paper size、orientation、centering 和 sizing
   contract，不能只有 `Sheet1` 正确。
2. 生成页在同一 renderer、同一 DPI 下的最左侧可见业务边框/content edge，不得比
   模板 baseline 向纸张左边缘偏移超过 `2mm`；任何页面都不能贴边或裁边。
3. 程序化门禁必须同时检查：
   - OOXML/package print contract；
   - 导出 PDF 的 A4 landscape page box；
   - rasterized page 的非白内容 bounding box；
   - 左侧 whitespace 与模板 baseline 的毫米/像素差；
   - 每个 populated worksheet，而不只第一页。
4. 若选择 fit-to-page，必须清除会让 Microsoft Excel 采用另一套缩放逻辑的 stale
   `scale`/printer metadata；若选择固定 scale，则必须清除冲突的 fit 属性。最终只
   保留一套经 Microsoft Excel 和 Docker renderer 都证明有效的 sizing contract。
5. 不得通过以下方式伪造留白：
   - 插入空白图片、白色矩形或额外业务列；
   - 把左侧边框改成白色；
   - 隐藏、截断或向右覆盖目的仓/托数/箱数；
   - 改打印机 borderless setting；
   - 要求办公室人员每次手动调 margins、scale、AutoFit 或 print area。
6. 02 的 content-aware row height 和完整 Standards 必须保留，但正常内容不能再按
   估算高度提前分页。`0–16` 条必须使用同一 worksheet 的完整 16 槽容量，未使用
   槽位保持空白，并由统一 A4 one-page print contract 完成排版；第 17 条才创建
   下一 worksheet。
7. 原模板必须只读，修复前后 SHA-256 完全一致。历史生成文件不批量改写；新生成或
   用户明确重新生成的文件使用新 contract。
8. 对极端异常长文本，如果在不裁切、不隐藏、不降低到最低可读阈值以下的条件下
   无法形成单页，必须返回 stable `REPORT_LAYOUT_REVIEW_REQUIRED` 或等价 typed
   review/error，保留原始数据并要求业务复核；不得静默提前分页、截断内容或占用
   表头/total/Standards。正常生产样本不得进入该异常分支。
9. 模板中未由 writer 自动写值、但留给办公室/仓库人工填写的现有业务单元格必须
   保持可编辑、可打印、边框和尺寸完整；不能通过 merge、hide、protect 或覆盖它们
   来实现自动排版。

### 3. API、生成状态和历史文件安全

1. Worker/API/job 失败必须传播 stable code 和结构化 details；不能吞异常或把失败
   job/generated file 标成 `SUCCESS`/`READY`。
2. 同柜号重新生成采用临时文件 + 原子替换或等价安全策略。只有完整校验通过后才能
   替换当前成功文件；失败后旧成功文件、SHA、下载和审计记录保持不变。
3. original upload、parsed result、manual correction、pallet snapshot、
   generated-file actor/SHA/MIME/size/storage containment 和下载权限不得回归。
4. 不修改托盘计算、目的仓聚合、柜子状态、库存、标签或拆柜工资规则。若诊断证明
   丢失发生在上游既有逻辑，只修复与“报表 expected plans 形成”直接相关的缺陷，
   并补回归；不要借本 Task 重写 parser 或 pallet policy。
5. 本 Task 默认不需要 schema migration。若确有必要，必须先说明为什么现有
   manifest/generated-file 结构无法满足审计，再提供可回滚 migration 和空库/现有库
   验证。

## Strict i18n 硬门禁

1. Worker/API 只返回 stable code、enum、`labelKey` 和安全 raw details，不返回给
   普通 UI 直接显示的英文故障句子。
2. 若 Web 会显示新的生成失败、目的仓守恒失败或重新生成提示，所有 visible copy、
   button、error、empty state、tooltip、aria/title 和 screen-reader text 必须同时
   加入 typed `en` / `zh-CN` catalog。
3. Web 必须显式把 `REPORT_DESTINATION_CONSERVATION_FAILED` 和
   `REPORT_LAYOUT_REVIEW_REQUIRED`（或最终采用的等价 stable codes）映射到当前
   locale；unknown code 使用本地化 fallback，不能显示 raw code、stack、storage
   path 或 Worker English message。
4. English 页面只显示英文 UI，中文页面只显示中文 UI；刷新、hydration、切换语言
   时不得双语同时显示或先闪另一种语言。
5. destination、container number、原模板英文业务内容属于业务数据/模板内容，
   不得翻译、拼接中文或用 i18n fallback 改写。
6. 即使本 Task 最终没有新增 Web 文案，也必须通过现有 catalog parity、
   unmanaged-string、dynamic code mapping 和 no-flash gate。

## 必须新增的自动化

### Worker/package

1. 覆盖 `0/1/8/9/16/17/32/33` 条目的 workbook，以及 02 的长英文、CJK、
   multiline、长 token 和末行长内容 fixture。
2. 新增两个或更多相同 `destinationCode`、但托数/箱数或 ordinal 不同的 fixture，
   证明不能用集合去重且全部按逻辑顺序保留。
3. 明确断言 `1/8/9/16` 条正常内容均为一个 populated worksheet/一张打印页，
   `17` 条为 `16+1`、`32` 条为 `16+16`、`33` 条为 `16+16+1`；非最后一页不得
   留有合法空槽位。
4. 增加回归测试证明 9 条和 16 条业务真实长度内容不会触发
   `_required_sheet_height` 式提前分页；若保留高度计算，它只能用于单页排版/
   异常 review 判定，不能决定正常 page assignments。
5. 对每个 fixture 从 saved workbook 提取 `N/O/P` rows，逐项等于 expected plans，
   并断言同一行 `C == N`、written/total counts 和 totals 正确。
6. 增加故意破坏 page assignment、跳过中间 plan、写错 `N`、写错 `O/P` 或保存后
   mutation 的负向测试；validator 必须 fail closed，且旧成功文件不被覆盖。
7. 极端异常长文本走稳定 layout review/error，不产生半成品、提前分页或不可读
   success；对应 code/details/i18n mapping 有测试。
8. 每个 populated worksheet 的 margins、print area、page setup、rich text、
   merges、row heights、Standards、header 和 totals 均与 contract 一致。
9. 检查所有既有人工填写业务单元格仍未 hidden/merged/protected/覆盖，样式、边框、
   可打印区域和编辑能力保持。
10. 模板 SHA 不变，生成 package 可由 openpyxl 和 LibreOffice 打开且无 repair
   warning。

### PDF/PNG 视觉与几何

1. 新建 `UNLOAD-REPORT-03` 专用、唯一 run directory 的 Docker runner；不得把旧
   `20260726T074500Z-final` 证据改名冒充新结果。
2. 同时渲染只读模板、真实结构 Worker 工件、API 下载工件、9/16/17/32/33 条和
   重复目的仓工件。
3. 每个 populated worksheet 恰好对应一张 A4 landscape 页；不得产生打印空白页。
   `0–16` 条正常内容的 workbook 只允许一张业务打印页。
4. 用固定 DPI 计算每页非白 content bounding box，输出 machine-readable
   `templateLeftWhitespaceMm`、`generatedLeftWhitespaceMm`、delta 和 pass/fail。
   每一页均满足模板 baseline `-2mm` 容差。
5. 目的仓不能只用全文 `grep`：结合 workbook cell mapping 和 PDF bbox/指定
   `DEST` 区域 crop，证明每条目的仓在 `N` 列打印区域可见，托数/箱数同页可见。
6. 生成全页、左边缘、`DEST/PLT/CTN` 和 Standards crops。Agent 必须使用图片工具
   按原分辨率逐张查看，记录无贴边、裁切、重叠、目的仓缺失和混页。

### API/full-stack

1. 从真实结构 fixture 经 nginx 完成 upload -> parse -> persisted destination ->
   pallet calculate -> generate -> list -> download。
2. 在生成前保存脱敏 expected plan digest；从 API 下载 bytes 重新提取 workbook
   rows，并证明 expected/written count、ordered digest 和业务值一致。
3. 同柜号先生成一份成功文件，再故意触发守恒失败；旧成功下载必须仍可用，失败
   attempt 有正确 job/audit 且无不完整 storage artifact。
4. 核对 generated-file status、MIME、SHA、size、storage containment、actor、
   original upload SHA 和权限。
5. 成功、故意失败和进程中断都使用唯一 fixture prefix、双层 cleanup 和 residual
   audit；不得删除或覆盖非 fixture 业务文件。

### Web/i18n

1. 新 stable code 的 typed mapping、unknown fallback、catalog parity 和 unmanaged
   string tests。
2. 若失败状态会进入 UI，执行 en/zh-CN direct load、refresh、locale switch 和
   retry/regenerate workflow；不得显示 raw code 或双语。
3. 现有报告生成/下载成功流程继续可用，不能因 fail-closed validator 变成永久
   loading 或重复提交。

## Docker-only 验证

所有 Worker、Node、Prisma、LibreOffice、PDF、Playwright、test 和 build 命令必须
在 Docker/Compose 中运行。不得在宿主安装或修复 pnpm、Jest、Python venv 或
LibreOffice。

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest tests/unit/test_excel_report_writer.py
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api lint
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api typecheck
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test --runInBand
docker compose -f infra/docker/compose.local.yml exec -T api pnpm --filter api test:e2e --runInBand
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web lint
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web typecheck
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web test
docker compose -f infra/docker/compose.local.yml exec -T web pnpm --filter web build
scripts/healthcheck.sh
git diff --check
```

必须另执行本 Task 新增的 Docker report package/full-stack/visual runner。命令名按实际
实现记录在 Task 结果中；不得只重跑 02 runner。

## Microsoft Excel 和实际打印验收

仓库自动化完成后，在办公室 Windows/Microsoft Excel：

1. 使用本 Task 最新 API 下载文件打开，不执行 AutoFit，不手动修改 margins、
   scale、print area 或 printer borderless setting。
2. 普通视图逐 sheet 对照生成前 expected list，核对每个目的仓、PLT、CTN 和 total。
3. 使用一份 `<=16` 条正常业务数据确认 workbook 只有一个 populated worksheet，
   Print Preview 只有一张 A4 landscape，全部合法业务槽位可使用且没有提前分页。
4. Print Preview 逐页确认左侧白边与模板一致、所有边框都在纸内、每个目的仓和完整
   Standards 可见。
5. 使用 Microsoft Print to PDF，再对 PDF 做目的仓逐项和左侧 whitespace
   machine-readable 检查。
6. 使用办公室实际打印配置打印至少一份，模板与生成报告并排确认左侧白边，并由
   办公室人员确认视觉结果。
7. 记录 Excel 版本、纸张、是否使用默认 printer profile、脱敏工件路径和结论；
   不记录账号、客户原始数据或打印机凭据。

当前 Agent 没有 Microsoft Excel 或目标打印机时，必须先完成所有可自动化实现和
Docker 门禁，再准确结束为 `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`；不得把
外部环境不足当成停止编码/测试的理由，也不得标记 `DONE`。

## 验收标准

1. 目的仓从 report-eligible expected plans 到最终 API 下载 workbook 逐项守恒，
   包括重复名称、16 槽容量和 17+ 条目；没有缺失、重复、错行或托/箱数串行。
2. `0–16` 条正常 report plans 固定为一个 populated worksheet/一张 A4 landscape；
   全部 16 个合法目的仓槽位可用，不因估算高度提前分页。17+ 严格按
   `16+remainder` 容量分页。
3. `writtenDestinationCount` 来自保存后实际验证，不再直接等于输入数量；任何不一致
   fail closed，旧成功文件不被覆盖。
4. 每个 populated worksheet 的实际打印左侧留白不低于模板 baseline `-2mm`，
   Microsoft Print Preview、Print to PDF 和实际打印均不贴边、不裁边。
5. 自适应行高、完整 Standards、A4 landscape、一 sheet 一页、模板 SHA、
   generated-file/audit/download、original upload 和失败清理全部不回归。
6. 所有既有业务单元格仍可编辑、可打印且样式/边框完整；极端异常长文本进入稳定
   review/error，不提前分页、截断或伪成功。
7. Worker/API/Web/full-stack/package/PDF/PNG、strict i18n、healthcheck、
   migration status 和 `git diff --check` 全部通过。
8. 新验证报告列出 expected/written counts、ordered digest、每页 whitespace
   geometry、工件路径、逐图结论、外部验收状态和已知限制。
9. Microsoft Excel 与实际打印业务验收通过后才可 `DONE`；否则只能使用准确的
   external verification pending 终态。

## 明确非目标

- 不重新设计拆柜报告模板、字段或品牌样式。
- 不修改托盘计算公式、目的仓业务聚合规则、库存、扫码、柜子状态或拆柜工资。
- 不把表头、total、Standards 或其他非目的仓单元格改造成额外自动目的仓槽位。
- 不批量重写历史报告。
- 不把 printer driver 或办公室人工调版作为永久解决方案。
- 不借本 Task 开始 POD、parser learning 或 Dashboard 开发。

## 当前环境完成证据（2026-07-28 MDT）

- 目的仓保存后逐项守恒、16 槽纸面顺序、容量分页、`C == N`、totals、
  expected/written count 和 ordered digest 已建立 fail-closed contract。
- print contract 统一为 `A1:P25` 的 fit-to-page；固定 200 DPI 的 20 张 generated
  pages 左侧 whitespace 均为 22.225mm，与模板 delta 0mm。
- 0/1/8/9/16 条均为一 sheet/一张 A4；17/32/33 分别为 16+1、16+16、
  16+16+1。长英文、CJK、multiline、长 token、末行长内容和重复目的仓均通过
  package/PDF/PNG 与原分辨率目视门禁。
- nginx full-stack 已分别证明 layout-review 和 conservation failure 不覆盖旧成功
  下载，失败 attempt 可审计且无不完整 storage artifact；故意退出、成功、layout、
  conservation 的精确 cleanup 与 residual audit 通过。
- Worker 207、API 383 unit / 129 E2E、Web 284 unit、lint/typecheck/build、
  healthcheck、migration status 和 diff check 均通过；未新增 migration。
- 最终工件：
  `test-results/unload-report-03/20260729T070000Z-final`。
- 完整报告：
  `docs/reports/unload-report-03-print-margin-destination-preservation-verification.md`。
- 当前只剩 Windows/Microsoft Excel Print Preview、Microsoft Print to PDF 和
  办公室实际打印并排签字，故状态为
  `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`；这些外部门禁通过后才可 `DONE`。

## 2026-07-29 后续回归与终态变更

- 用户确认：同一柜号重新生成拆柜报告后，文件区域会追加一份新报告，而不是替换
  当前报告；文件区域因此可能同时出现多个报告版本。
- 当前实现和测试确实把 report regeneration 定义为每次新建 UUID storage path 和
  immutable `GeneratedFile`，而普通文件列表又返回全部记录。该行为不符合最新业务
  口径。
- 本 Task 的报告内容、目的仓守恒、分页和打印几何证据继续有效，但
  `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING` 不再是可直接关闭的终态。
- 后续实现统一由
  `prompts/tasks/UNLOAD-REPORT-04Current Report and Label Replacement Regression.md`
  和 `prompts/tasks/UNLOAD-REPORT-05Adaptive Primary and White Cell Layout.md`
  承接。04 已完成唯一 current 文件；05 已于 2026-07-30 完成主行/白色行自适应
  布局及当前环境全部自动化，状态为
  `CODE_COMPLETE_EXTERNAL_VERIFICATION_PENDING`。Windows/Microsoft Excel、
  Print to PDF 与办公室实际打印仍须使用 05 新 current 工件完成；在此外部门禁
  通过前，不得把 03 标记为 `DONE`。
