# 执行 PARSER-PROFILE-02：Deterministic Workbook Fingerprint and Mapping Engine

## 优先级与前置任务

- 优先级：P0 parser profile 核心 Worker 合同。
- 前置任务：`PARSER-PROFILE-01` 必须 `DONE`，migration 与数据 contract 已稳定。
- 后续任务：`PARSER-PROFILE-03Learning Case Preview Replay and Candidate APIs.md`。
- 本 Task 不自动进入后续任务。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`、`CONTEXT.md`
- `docs/product/04-adaptive-parser-profiles.md`
- `docs/adr/0004-approved-parser-profiles.md`
- `.codex/skills/unloading-excel-parser/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- Worker detector、`unloading_plan_cn.py`、`bestar_receiving.py`、batch/CLI/contracts/tests
- `samples/unloading-plans/` 中现有真实 fixture；不得修改原样本

## 目标

实现无外部 AI 依赖、无任意代码执行的 workbook inspection、结构指纹和 declarative mapping engine。它必须把 profile definition + 原始 workbook 转为现有 canonical parse contract，并保留每个字段的 source provenance 与未知列。

## Workbook Inspection Contract

1. 支持当前项目可读的 OOXML workbook；不在本任务扩展 legacy `.xls`。
2. 输出 sheet identity/visibility、bounded dimensions、merged ranges、前若干非空区域、公式是否有 cached value、候选 header areas 和 candidate data ranges。
3. 默认扫描必须有行列/单元格上限，防止异常 workbook 造成无界内存或响应。
4. Inspection JSON 供 API/UI 使用，但不得执行 macro、外链、公式或网络请求。
5. 原始值按现有 JSON normalization 处理；日期/decimal 类型稳定可序列化。

## Structural Fingerprint

1. 指纹只使用 workbook 类型、sheet/header anchors、合并关系、required relative columns、data start/stop markers 和算法版本。
2. 不使用 cargo value、柜号、客户单号或 filename 作为唯一结构证据。
3. 同一布局不同数据量/柜号应得到相同或在声明 tolerance 内的 match evidence。
4. required anchor 缺失/移动、冲突 sheet 或 type 不兼容必须产生 stable drift/mismatch code。
5. 输出 deterministic fingerprint hash、human-reviewable match reasons 和 algorithm version；不能只有不可解释分数。
6. 多 profile 候选排序必须稳定，但 Worker 不得自行批准或选择一个模糊 winner。

## Declarative Mapping Definition

定义严格 JSON schema/typed model，只允许产品文档中的 allowlist：

- sheet/header/data range selector；
- direct cell/column mapping；
- trim/case/blank normalization；
- decimal/integer parse 和明确 separator；
- coalesce、constant、lookup dictionary、concatenate；
- bounded regex extract；
- multiply/divide/unit conversion；
- row include/exclude/blank/summary/stop predicates；
- canonical row normalization 后的 destination grouping。

拒绝未知 operation、递归/无界表达式、任意 Python/JS、filesystem path、network target 或 workbook mutation。Definition validation 必须返回 stable issue code/path。

## Canonical Output 与 Provenance

1. 复用现有 parsed result 语义，不建立第二套 destination/carton/volume model。
2. 每个 mapped field 保存 source sheet、source row、source column/cell、transform chain 和原始值引用。
3. 每个 detail row 的全部未知 source columns 保存在 `raw_json`；不得因 profile mapping 丢列。
4. 缺柜号、目的仓、箱数、体积和 zero-volume-with-cartons 继续返回既有 stable warning/error 语义。
5. `parserVersion`/metadata 必须能定位 profile version、mapping schema version、fingerprint version 和 replay input hash。
6. Mapping engine 不计算或批准 trust，不更新数据库，不生成 profile lifecycle。

## Candidate Suggestion

- 可基于 normalized header aliases、数据类型和 final aggregate reconciliation 产生候选字段建议。
- suggestion 必须携带 reason/evidence，标记为 unapproved。
- 多个可能列时全部返回或降低 certainty，不得静默选择。
- 成品报告 aggregate 只能用于对账，不能唯一证明 source mapping。

## 与现有 Parser 的兼容

1. Built-in detector/parser code path 继续通过现有真实 fixtures，输出不得无理由变化。
2. Profile engine 是独立深模块；不要把 profile JSON 分支散落进现有每个 parser。
3. 当前 built-in aliases 可以在测试中转写成 profile definition 验证等价输出，但 production built-in parser 不在本任务删除。
4. Pallet calculator/report/label 继续消费相同 normalized data。

## 严格 i18n 硬门禁

1. Worker 只返回 stable issue/match/operation code、field path、raw value 和结构化参数，不返回供 UI 直接展示的中英文句子。
2. 新 code 必须有集中 registry/contract，供 Web 后续完整映射 `en`/`zh-CN`。
3. 不得把 header 原文误当 UI label 翻译；它是 customer source data，应在受控 preview 原样显示。
4. Test 必须扫描 Worker contract，禁止把本地化文案嵌入 profile definition、fingerprint 或 audit data。

## 性能与安全预算

- 真实常规 workbook inspection/preview 不得全量 materialize 无关 sheet。
- 记录 bounded row/column/cell limits 和超限 stable error。
- Regex 必须受长度/operation 限制，避免 catastrophic patterns；不接受调用方代码。
- 解析失败显式返回，不能 silent fallback 为成功空 rows。

## 验收标准

1. 同一真实布局的多个 workbook 可稳定匹配，明显不同布局不误匹配。
2. Profile definition 可从真实 fixture 输出 canonical rows/destination summaries，并与 built-in parser 的关键字段等价。
3. Provenance 能从 destination/cartons/volume 回查具体 sheet/row/cell 和 transform。
4. 未知列完整保留，summary/empty rows 按声明规则处理。
5. 非法/危险 definition、缺 cached formula、超限 workbook 和 profile collision 返回稳定结构化错误。
6. 现有所有 parser/calculator/report fixture 回归通过。

## 必须增加或执行的测试

- Worker unit：inspection limits、merged/multi-row header、fingerprint stability/drift、mapping schema、每种 allowlisted transform、row filters、provenance、unknown columns、invalid operations。
- Worker integration：至少使用现有真实 unloading-plan 与 Bestar receiving fixtures，证明 profile path 与 built-in canonical output 对账。
- Negative fixtures 只能补边界，不得代替真实 fixture 验收。
- Docker worker `uv run pytest` focused + full worker suite；不得宿主运行 uv/pytest。
- Worker lint/format contract（按项目现有命令）和 `git diff --check`。

## 完成输出

- 列出 inspection/fingerprint/mapping JSON schema 与 versioning。
- 给出真实 fixture hash/路径、built-in equivalence、drift 和安全拒绝测试证据。
- 更新任务索引、完成度报告和 `HANDOFF.md`；下一建议任务只能是 PARSER-PROFILE-03。
