执行 INVENTORY-ADJUST-02：Manual Inventory Depletion UI。

优先级：
- High。API 完成后，办公室人员需要在柜子库存页面直接处理目的仓剩余库存，不应要求他们手动调用接口。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/tasks/INVENTORY-ADJUST-01Manual Inventory Depletion API.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- .codex/skills/auth-rbac/SKILL.md
- apps/web/src/lib/api-client.ts
- apps/web/src/lib/permissions.ts
- apps/web/src/lib/i18n/
- apps/web/src/lib/status-labels.ts
- apps/web/src/app/
- apps/web/src/components/containers/
- apps/web/src/components/reports/
- apps/web/tests/
- apps/web/e2e/

前置任务：
- INVENTORY-ADJUST-01

目标：
1. 在柜子详情/目的仓库存区域为有权限的办公室人员提供“人工消库存”入口。
2. 操作完成后页面立即显示新的库存统计、调整历史和审计信息。
3. UI 必须清楚表达：这是人工消库存，不是扫码装车，不会把托盘计入已装车。

建议交互位置：
1. 柜子详情页每个 destination / pallet summary 区域：
   - 显示 total、loaded、adjusted out、remaining。
   - 当 `remainingPallets > 0` 且用户有 `inventory.adjust` 权限时，显示人工消库存按钮。
2. 库存报表页可提供跳转或次级入口：
   - 优先从柜子详情执行，避免在报表中脱离柜子上下文误操作。
3. 调整历史：
   - 在目的仓详情区域显示最近人工调整记录。
   - 至少显示时间、操作人、数量、原因、备注。

建议表单：
1. Modal / sheet 标题：人工消库存。
2. 字段：
   - 当前剩余库存，只读。
   - 消库存数量，数字输入，范围 1 到 remaining。
   - 原因，下拉：
     - 已送库但未扫码
     - 漏扫
     - 数据清理
     - 其他
   - 备注，文本框；选择“其他”时必填。
3. 提交前确认：
   - 明确提示该操作会从剩余库存中移除托盘，但不会计入已装车。
4. 提交后：
   - 刷新 destination stats、inventory report cache、adjustment history。
   - 显示成功提示。
5. 错误处理：
   - 无剩余库存。
   - 数量超过剩余库存。
   - 权限不足。
   - 有正在装车的托盘导致后端拒绝。
   - 目的仓已变化，要求刷新后重试。

权限和状态：
1. 无 `inventory.adjust` 权限时不显示操作按钮。
2. 有 `inventory.read` 但无 `inventory.adjust` 时仍可看到 adjusted out 数量和历史摘要。
3. 新增 `ADJUSTED_OUT` 状态 label、badge 和筛选项时必须通过统一 status label helper。
4. UI 不得把 `ADJUSTED_OUT` 计入 `loaded`，也不得显示为“已装车/已送库”。

I18n hard gate：
1. 所有新增可见文案必须进入 locale catalog：
   - 按钮、标题、字段 label、帮助文案、确认文案、成功提示、错误提示、empty state。
   - reason option。
   - `ADJUSTED_OUT` 状态 label。
   - `MANUAL_INVENTORY_DEPLETION` event label。
   - aria-label、title、placeholder。
2. API error code 必须通过 i18n mapper 转成当前语言文案，不得直接显示 raw code。
3. 中文 locale 下不能出现英文 fallback；English locale 下不能出现中文业务文案。
4. 不允许显示双语状态，例如 `已人工消库存 (Adjusted out)`。

不做：
1. 不做 API/schema 变更。
2. 不允许前端自行计算最终库存真相；提交后使用 API 返回或重新拉取后端数据。
3. 不在 UI 中提供“撤销人工消库存”，如需要撤销另开审计任务。
4. 不把人工消库存按钮放在移动扫码主流程中。

验收标准：
1. 有权限用户在柜子详情中能看到并打开人工消库存表单。
2. 无权限用户看不到操作入口，直接访问提交函数/API client 也由后端拒绝。
3. 表单校验 count、reason、OTHER note。
4. 提交成功后 remaining 减少，adjusted out 增加，loaded 不变。
5. 调整历史显示操作人、时间、数量、原因和备注。
6. 后端返回的稳定 error code 能映射成当前语言错误提示。
7. 状态/统计/历史在中英文切换后单语显示。
8. 页面刷新后统计仍与后端一致。

建议测试命令：
- pnpm --filter web lint
- pnpm --filter web typecheck
- pnpm --filter web test -- inventory
- pnpm --filter web test -- i18n
- pnpm --filter web test:e2e -- inventory
- git diff --check

手工验收：
1. 使用 Docker full-stack 打开一个有剩余库存的柜子详情。
2. 用 OFFICE 或 ADMIN 账号执行人工消库存 1 托。
3. 确认目的仓统计和库存报表更新。
4. 切换 English / 中文，确认所有文案、状态、reason、错误、成功提示单语显示。
5. 用普通仓库扫码账号登录，确认看不到人工消库存入口。

完成输出：
1. changed files。
2. UI 入口和权限说明。
3. i18n key 增量说明。
4. 测试命令和结果。
5. 手工验收结果。
6. 明确结论：`manual inventory depletion UI implemented`。
