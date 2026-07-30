# UNLOAD-REPORT-05 Adaptive Primary and White Cell Layout 验证报告

## 结论

`UNLOAD-REPORT-05` 已完成仓库实现、当前环境自动化和办公室外部验收，状态为
`DONE`。

每页 1–8 个目的仓只使用深色主行 `4/6/.../18`；9–16 个目的仓才切换到深色主行
与白色追加行组成的 `4..19` 纸面连续布局；17 个以上按 16 分页，并由每页实际数量
独立选择模式。

## 当前环境证据

- 最终专用 runner：
  `test-results/unload-report-05/20260730T022108Z-42114`。
- 已覆盖 `0/1/2/8/9/10/16/17/24/25/32/33` 的页数、模式、physical rows、
  style、空闲行和保存后 `C/N/O/P` 守恒。
- 真实 nginx/API/BullMQ/Chromium `8 -> 9 -> 8` current slot 替换、布局失败和
  人为守恒失败保留旧 current 均通过。
- Worker 235、API 388 unit / 129 E2E、Web 284，以及 lint、typecheck、build、
  38 migrations、healthcheck 和 `git diff --check` 均通过。
- 36 张非模板生成页均为 A4 landscape，左侧 whitespace 相对模板
  `22.225mm` 的 delta 均为 `0.0mm`；24 张原尺寸 full-page /
  destination-table PNG 已检查，无错序、重叠、裁切、残留或 Standards 缺失。

## 办公室外部验收

2026-07-30，业务方确认使用 05 新 current 工件完成并通过：

- Windows/Microsoft Excel 的 8、9、16 目的仓报告检查；
- 深色主行、白色追加行、业务顺序和单 worksheet / 单张 A4 landscape 检查；
- 逐目的仓、PLT、CTN、total、Standards 和左侧白边检查；
- Print Preview、Print to PDF 和办公室实际纸张打印检查；
- 04 唯一 current 报告槽位及重生成替换行为检查。

外部验收未使用旧 03 `report-8` 作为通过证据。至此无剩余实现、外部验证或 blocker。
