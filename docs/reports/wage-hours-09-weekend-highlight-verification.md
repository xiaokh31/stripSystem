# WAGE-HOURS-09 A 列周末底色回归验证

日期：2026-08-01 MDT；2026-08-02 更新验收结论
结论：`DONE`

## 结论

仓库实现和当前环境 Definition of Done 已完成。工资工作簿现在按每行实际
`work_date` 选择 A 列语义样式：仅 `SAT`、`SUN` 使用获批模板的周末底色，`MON` 至
`FRI` 和短月份空槽使用普通底色。获批模板二进制未修改，仍使用版本
`bestar-wage-template-v1` 和 SHA-256
`f9e11d6f2c6f45b0453f8346df2ff8347f2e6f5c8b7505a642367f1dade4206c`。

用户于 2026-08-02 明确确认 WAGE-HOURS-09 专项验收通过，本 Task 更新为 `DONE`。
自动化与 LibreOffice 证据仍按其实际范围记录，不冒充 Microsoft Excel 过程细节；用户
未提供额外设备、文件名或截图信息，本报告不补写未提供的外部证据。

## 根因诊断与红灯

诊断按可证伪假设执行：

1. `LegacyXlsTemplateEditor.write()` 始终继承目标物理格 XF：确认。旧生成器没有语义
   style override，A 列写值后继续沿用模板物理行样式。
2. 获批模板保留历史 2026 年 5 月的周末物理位置：确认。普通 A 格使用 XF 83，浅蓝
   周末 A 格使用 XF 87；将 6/7 月日期写进同一物理行会移动文字而不会移动底色。
3. wrap/dimension 派生 XF 覆盖 fill：证伪。短 weekday 不触发 wrap，旧输出 XF 数仍为
   107；错误来自静态目标 XF，而不是自动换行组合。
4. 旧视觉审计只比较同一物理行：确认。旧 gate 可得到 positional style differences=0，
   却没有按 B 列实际日期验证 A 列 weekday/fill 语义。

修复前，新的语义回归在脱敏 2026-06/07 输出上连续两次确定性失败并返回非零状态；
合计观察到 `weekdayFill=19`、`weekendFill=16`、`blankSlot=1`。对旧留存输出运行新版
machine audit 的结果为：

- 6 月：`styleMismatchCount=36`、`weekdayStyleMismatchCount=18`、
  `weekendStyleMismatchCount=16`、`blankSlotMismatchCount=2`，退出码 1。
- 7 月：`styleMismatchCount=36`、`weekdayStyleMismatchCount=20`、
  `weekendStyleMismatchCount=16`、`blankSlotMismatchCount=0`，退出码 1。

因此红灯同时证明至少有工作日误用周末底色、周末未使用周末底色，并且不依赖某一个
固定月初或模板物理行。

## 最小 BIFF 修复

- `LegacyXlsTemplateEditor.write()` 新增受控 `style_xf_index` override，并在越界时返回
  `WAGE_TEMPLATE_STYLE_OVERRIDE_INVALID`。
- 模板 manifest 明确记录 weekday XF 83 与 weekend XF 87；preflight 验证角色存在、
  范围合法，并证明两者只有 fill 不同，歧义或漂移时 fail closed。
- 员工 Sheet 写入 A 列文字时在同一次调用中按 `date.weekday()` 选择角色；空槽同时清除
  A/B 值并恢复普通样式。没有固定行号、月份、员工名或出现频率推断。
- 发布前 saved-file validator 重新打开 staging BIFF，逐 Sheet 验证 B 日期有序且属于目标
  期间、A weekday 文字正确、有效格 exact XF 角色正确、空槽为空且非周末样式。样式错误
  返回稳定安全 code 并清理 staging/output，不写 manifest 或可下载记录。
- 只复用模板现有两个 XF，生成后仍为 107 XF；没有按日期或员工线性追加 style。
- 本修复不改 schema、migration、Web/API 用户可见文案，也不回写历史 generated files。

## 新输出 machine-readable 证据

Docker LibreOffice gate 对 16 个脱敏标准员工 Sheet 的新输出得到：

| 月份 | 有效日期格 | 周末格 | 工作日格 | 空槽 | 样式/文字/空槽 mismatch |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026-06 | 480 | 128 | 352 | 16 | 0 |
| 2026-07 | 496 | 128 | 368 | 0 | 0 |
| 合计 | 976 | 256 | 720 | 16 | 0 |

真实受控 7 月 `/work-hours` upload -> Parse -> Generate -> list -> protected download
工作簿审计覆盖 15 个完整员工 Sheet、465 个日期格、120 个周末格、345 个工作日格；
weekday text、weekday style、weekend style、blank slot、B-F style、special sheet mismatch
全部为 0。浏览器 `browserErrors=[]`，因此 console error、pageerror、非预期 failed request、
hydration 和 missing translation 均为 0。没有新增用户可见文案；typed catalog parity 与
unmanaged-string 门禁继续通过。

## 视觉与不可变性

模板、6 月和 7 月工作簿各渲染 50 页。已以 180 DPI 原始 PNG 逐图检查：

- 6 月：第 1、15、47 页，分别覆盖第一个、中间和最后一个标准员工 Sheet。
- 7 月：第 1、15、47 页，分别覆盖第一个、中间和最后一个标准员工 Sheet。

六页均显示 A 列只有 `SAT` / `SUN` 使用浅蓝周末底色，`THU` / `FRI` 保持白色；
B-F 的黄色人工/异常提示等既有样式仍存在。machine audit 另行覆盖全部 Sheet、全部日期、
B-F 和受保护特殊 Sheet；Worker BIFF 结构测试覆盖 merge、ROW/COLINFO、page break 与
SETUP/print metadata，避免只凭抽样截图下结论。

测试前后 SHA 保持不变：获批模板为上述固定 SHA；历史工资参考为
`6f2fb31f54e7cca39e696c11e8891f0a6e36041c28b98f1d287f703f9ecf375a`；
受控真实考勤源为
`63927d94a027f77b41ce4345e38fb9f7b9df8b8d44b989e710fe7f50f4172597`。
报告、日志与证据未记录员工姓名、Sheet 名或打卡数据。

## 自动化结果

- Worker focused：17/17 pytest；Ruff 通过；wage 模块 mypy 8 files / 0 issues。
- Worker full：247/247 pytest；Ruff 通过。
- API：lint/typecheck 通过；51 suites / 409 unit；21 suites / 131 E2E。
- Web：lint/typecheck 通过；285/285 unit tests。
- 专用 full-stack runner：clean tracked template supply、故意失败 cleanup 探针、真实
  nginx/PostgreSQL/BullMQ/Chromium upload/Parse/Generate/list/download、同步诊断、BIFF
  语义审计、源 SHA、隐私、storage/runtime/DB 精确清理及 LibreOffice gate 全通过。
- 审计脚本 Python compile、shell syntax、`scripts/healthcheck.sh` 和 `git diff --check`
  通过。
- 本 Task 无数据库 schema 变更，不需要 migration。

## 外部验收结果

本 Task 原定外部复核清单为：

1. 检查第一个、中间、最后一个员工 Sheet，确认 A 列仅 `SAT`、`SUN` 使用周末底色，
   `THU`、`FRI` 与其他工作日一致。
2. 检查 2 月或 30 天月份，确认末尾空槽没有文字、日期、值或周末底色残留。
3. 检查日期、工时、其他颜色、行高、列宽、Print Preview 和下载文件名没有回归。

用户于 2026-08-02 明确确认 WAGE-HOURS-09 已验收通过，因此本 Task 标记 `DONE`。
WAGE-HOURS-08 也已由用户单独确认验收完成。两项均不得重跑；下一开发 Task 为
`PUBLIC-DEPLOY-04Public Domain and LAN IP Login Coexistence Regression.md`。本次状态
更新未启动其他 Task。
