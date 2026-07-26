# 执行 POD-00：Real Template Contract and Worker Proof

## 优先级与状态

- 优先级：P1，新 POD 大功能的 Phase 0 前置。
- Task-Status: OPEN / BUSINESS FIXTURE REQUIRED BEFORE EXECUTION
- 前置任务：无代码前置，但必须先满足“真实输入门槛”。
- 后续任务：POD-01；POD-00 未达到 DONE 前不得开始 POD-01。
- 本 Task 只固化真实模板、字段映射和打印生成 contract，不做数据库、API 或 Web。

## 真实输入门槛

业务必须先提供：

1. 一份真实或明确脱敏的空白 POD 模板；
2. 一份与该模板对应、业务确认正确的已填写/打印成品；
3. 字段清单、必填规则和示例值；
4. 纸张、方向、页数、缩放和打印要求；
5. 模板格式、宏和外部链接情况说明。

没有这些输入时，不得用自造模板冒充业务 fixture，不得猜 cell coordinate、字段名、
打印区域或声称支持任意 Excel/Word/PDF。此时应保持本 Task 未执行，而不是启动
Business Agent 后长时间探索。

## 必须读取与使用

- `AGENTS.md`、`HANDOFF.md`
- `prompts/agents/business-logic-agent.md`
- `docs/product/06-pod-template-and-document-management.md`
- `.codex/skills/bestar-handoff/SKILL.md`
- `.codex/skills/bestar-domain/SKILL.md`
- `.codex/skills/unloading-report-generator/SKILL.md`
- `.codex/skills/docker-local-deploy/SKILL.md`
- `.codex/skills/qa-regression/SKILL.md`
- 如果 fixture 是 Excel：适用的 spreadsheet/openpyxl 规范
- 现有 Worker CLI、generated report manifest、Docker office render/visual 模式
- 业务提供的 POD 原模板和 approved completed example

## 任务范围

### 1. 安全 fixture 清单

1. 记录原模板和成品的文件名（脱敏）、SHA-256、格式、大小、sheet/page 数和
   business owner，不记录客户/个人明文。
2. 只有明确批准脱敏的 fixture 可以加入 Git；真实敏感文件留在 gitignored
   `samples/pod/`，测试通过环境变量/fixture gate 引用。
3. 测试必须明确区分 synthetic boundary fixture 和 real/sanitized business fixture。
4. 原模板只读，所有试验写入临时 output。

### 2. 模板结构和安全检测

1. 检查 magic bytes、extension、加密、宏、外部链接、嵌入对象、公式、隐藏页、
   merged ranges、图片、named ranges、print area、page setup 和保护状态。
2. 对 zip/package 解析设置大小、压缩比、sheet/page/row/cell 上限；不得无界加载。
3. 基于真实 fixture 明确首版唯一支持 profile，例如受控 `.xlsx`，并列出明确不支持
   的格式/特性。
4. 不为了兼容样本而执行宏、外部链接、脚本或网络请求。

### 3. 字段映射 contract

生成版本化、可验证的 mapping/schema：

- stable field key；
- user-supplied business label；
- type、required、length/range；
- approved sheet/range/named target；
- formatting/wrap/date/number rule；
- printable visibility；
- unknown/missing/duplicate target issue codes。

Browser 后续只能提交 field key/value，不能提交任意 cell、formula、path 或表达式。
字段 target 必须属于经过 inspection allowlist 的模板区域。

### 4. Worker proof

1. 新增最小 Worker proof：复制原模板，按 mapping 写入 fixture values，生成
   source-format output 和 print-ready PDF。
2. 不修改原模板；生成前后模板 SHA 必须一致。
3. 保留未触及 values/formulas/styles/merges/images/print settings。
4. 长 ASCII/CJK/multiline 值在普通视图和 PDF 中完整。
5. 输出 manifest 包含 profile version、template SHA、mapping version、output SHA、
   page count、warnings/errors；不含绝对 storage path 或敏感值。
6. 失败返回 stable code + structured details，不写伪 SUCCESS 文件。

## Strict i18n 硬门禁

1. 本 Task 无 Web UI，但 issue/result contract 只能使用 stable code、field key 和
   raw structural metadata。
2. 不把英文 exception 当成未来用户文案，不在一个 message 中拼接中英双语。
3. 为 POD-01/02 列出所有 stable codes 及对应的拟议 `labelKey`，但实际 UI 文案由
   typed `en`/`zh-CN` catalog 管理。
4. 模板原文和字段 label 是用户业务数据，不自动翻译。

## 非目标

- 不创建 Prisma schema、API route、菜单或页面。
- 不做任意模板自动学习/OCR。
- 不支持多个未提供的文件格式。
- 不做电子签名、邮件、批量制单或静默打印。
- 不修改现有拆柜报告/标签/工资生成器。

## 测试与验证

全部在 Docker 中执行：

1. inspection/profile unit：正确 fixture、错误 extension/magic、encrypted、
   macro/external link、oversized/zip-bomb boundary、missing/duplicate target。
2. generation unit/package：原模板 SHA 不变；mapped values 正确；untouched package
   等价；长值完整；重复运行 deterministic。
3. Docker office render：模板、approved completed example、generated output 生成
   PDF/PNG，比较 page geometry 和关键区域。
4. Agent 使用图片工具逐张原分辨率检查，不以 text extraction 代替视觉。
5. Worker full suite、Ruff/typecheck、Compose build、`git diff --check`。

## Docker-only 验证命令

```bash
docker compose -f infra/docker/compose.local.yml up -d --build
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run ruff check .
docker compose -f infra/docker/compose.local.yml exec -T worker-python uv run pytest
scripts/healthcheck.sh
git diff --check
```

另执行本 Task 新增的 POD inspection/generation/office-render visual runner。禁止在
宿主运行 Python、`uv`、LibreOffice 或安装临时依赖。

## 验收标准

1. 一个真实/明确脱敏模板 profile 被业务输入证据支持。
2. 支持/拒绝的文件格式与特性明确，不声称 arbitrary template support。
3. versioned field mapping 可由机器验证，禁止任意 cell/path/formula。
4. Worker 从复制模板生成 source output 和 print-ready PDF，原模板 SHA 不变。
5. approved example 与 generated output 的关键字段、layout、page/print 结果通过
   package + visual 比较。
6. 所有 issue 使用 stable code，i18n ownership 已定义。
7. Docker Worker checks 和 `git diff --check` 通过。
8. 更新 Task/Index/完成度/HANDOFF，明确首版 profile、fixture 位置和 POD-01 可执行。
