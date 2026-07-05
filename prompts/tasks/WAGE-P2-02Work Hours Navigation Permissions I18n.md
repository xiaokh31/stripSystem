执行 WAGE-P2-02：Work Hours Navigation, Permissions, and I18n。

必须读取：
- AGENTS.md
- prompts/tasks/WAGE-P2-01Work Hours Settlement Page.md
- docs/product/02-work-hours-and-unloading-wage-settlement.md
- docs/architecture/09-account-role-permission-management.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md

前置任务：
- WAGE-P2-01

任务范围：
1. 将 HR 工时结算入口接入现有 Office Web App 导航或报告入口。
2. 补齐 attendance 权限在前端的显示逻辑。
3. 补齐中英文 UI 文案。
4. 不改 API 业务逻辑，除非权限映射缺失。

说明：
- 如果代码已经存在，本任务改为复核并补齐缺口。

业务要求：
1. 有权限用户可以从 Office Web App 找到 Work Hours Settlement。
2. 无 attendance read/create/parse/generate 权限用户不能看到或不能执行对应动作。
3. 前端隐藏动作不能替代 API 权限；如果 API 缺权限映射，需要补 API 权限映射测试。
4. 页面英文和中文文案必须覆盖：
   - upload
   - parse
   - generate wage record
   - duplicate upload
   - parse failure
   - generated files
5. 下载链接必须使用浏览器可访问路径，不暴露容器内部 storage path。

验收标准：
1. Office 用户可从导航或 Reports 进入 `/work-hours`。
2. 权限 helper 覆盖 HR 工时结算权限。
3. 无权限状态不会显示可执行按钮，API 仍返回 403。
4. 中英文文案齐全。
5. 下载链接可在浏览器使用。
6. 测试通过。

测试命令：
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
pnpm --filter api test
