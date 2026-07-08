执行 P4-PRINT-03：Local Print Agent Decision + Prototype。

优先级：
- Deferred。只有当 pilot 证明 PDF/manual printing 不稳定或效率不足时执行。

必须读取：
- AGENTS.md
- docs/adr/0002-printing-strategy.md
- docs/runbooks/warehouse-operator-manual.md
- docs/runbooks/pilot-run-checklist.md
- .codex/skills/docker-local-deploy/SKILL.md
- .codex/skills/pallet-label-generator/SKILL.md
- .codex/skills/qa-regression/SKILL.md
- apps/api/src/labels/
- apps/api/src/generated-files/
- apps/web/src/components/containers/
- apps/worker-python/src/worker_python/labels/

背景：
- P4 当前采用 PDF manual printing，已经有 150mm x 100mm PDF 和 reprint audit。
- 自动打印代理/Tauri 未实现，ADR 明确要求先用 pilot 记录打印问题，再决定是否升级。
- 本任务只在实际打印失败率、缩放错误、效率问题达到需要自动化时执行。

前置业务输入：
1. 现场打印机型号。
2. 标签纸尺寸和供应商。
3. 驱动版本和默认缩放设置。
4. PDF viewer/browser。
5. 打印失败样本和频率。
6. 是否需要 ZPL/TSPL 或仍继续 PDF。

任务范围：
1. 根据 pilot 数据确认是否需要 local print agent。
2. 如果需要，设计最小 local print agent：健康检查、打印机配置、提交 audited generated label file、打印结果回传。
3. 不允许绕过 generated file / reprint audit。
4. 不在浏览器里做 hidden auto-print。
5. 不引入 Tauri，除非重新写 ADR 证明它解决的不止打印。
6. 原 PDF download/manual print 路径必须保留作为 fallback。

业务要求：
1. Label 物理尺寸仍为 150mm x 100mm。
2. QR 物理尺寸目标仍为 25mm x 25mm。
3. 每次 reprint 仍必须审计。
4. Print agent 不能直接访问数据库修改库存或 pallet status。
5. Agent 与 API 的认证、LAN trust、CORS/localhost 策略必须清晰。

验收标准：
1. 新增或更新 ADR，记录是否做 print agent 以及原因。
2. 如果做 prototype，必须有 healthcheck 和 dry-run print mode。
3. Web/API 只向 agent 提交已审计的 generated file 或 reprint token。
4. 打印失败必须给用户可理解错误，不静默丢失。
5. Docs 包含安装、配置、启动、停止、日志、故障排查。
6. 真实打印测试记录外形尺寸、QR 尺寸和扫码结果。

建议测试命令：
- pnpm --filter api lint
- pnpm --filter api typecheck
- pnpm --filter api test
- pnpm --filter web lint
- pnpm --filter web typecheck
- pnpm --filter web test
- cd apps/worker-python && uv run pytest
- git diff --check

手工验收：
1. 使用真实 printer 和 label stock。
2. 打印 calibration PDF。
3. 打印真实 pallet label。
4. 测量 150mm x 100mm 和 QR 25mm x 25mm。
5. 扫描 QR 并确认 payload 可用于装车扫码。
6. 验证 reprint audit 中记录了操作人和原因。

完成输出：
1. 列出 pilot 打印数据和结论。
2. 明确是继续 PDF/manual print，还是进入 print agent。
3. 如实现 prototype，列出文件、启动方式、测试结果。
4. 明确结论：
   - `print agent not needed after pilot`
   - 或 `local print agent prototype complete`
   - 或列出 printer/platform blocker。
