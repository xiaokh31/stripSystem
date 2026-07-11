执行 WEB-DASHBOARD-04：Dashboard QA I18n Regression。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/tasks/WEB-DASHBOARD-00Back Office Visual Direction.md
- prompts/tasks/WEB-DASHBOARD-01Operations Dashboard Data API.md
- prompts/tasks/WEB-DASHBOARD-02Shell Visual System Redesign.md
- prompts/tasks/WEB-DASHBOARD-03Operations Dashboard UI.md
- .codex/skills/frontend-design/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- .codex/skills/qa-regression/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- apps/api/test/
- apps/api/src/dashboard/ 或实际 dashboard module 路径
- apps/web/tests/
- apps/web/e2e/
- apps/web/src/lib/i18n/

前置任务：
- WEB-DASHBOARD-00
- WEB-DASHBOARD-01
- WEB-DASHBOARD-02
- WEB-DASHBOARD-03

目标：
对 dashboard redesign 做最终回归，确认视觉改造没有破坏现有业务页面、权限、i18n 和真实数据口径。

必须验证：
1. API：
   - dashboard response 真实来自 DB/service。
   - empty DB 返回稳定空结构。
   - 权限裁剪不泄露业务数据。
   - inventory remaining pallets 不由前端计算。
   - lifecycle status counts 包含 `UNLOADED`、`LOADING_IN_PROGRESS`、`LOADED`，并保留各自语义。
2. Web：
   - `/` dashboard 首屏不再是简单 health page。
   - Dock Lane Strip、Work Queue、Inventory Pressure、Active Load Jobs、Exception Queue 可见。
   - metric links 指向真实业务页面。
   - no permission section 显示明确不可见状态或完全不渲染业务数据。
3. Shell：
   - desktop nav rail 可用。
   - mobile nav 可用且不遮挡正文。
   - 当前 route active state 可见。
   - 登录/登出、语言切换不回归。
4. i18n：
   - English / 中文切换后 dashboard 和 shell 文案都切换。
   - 不出现 `已拆完 (UNLOADED)`、`Delivered to destination / 已送库` 等可见双语混排。
   - raw enum 只能在 title、audit/debug 或明确技术字段中出现。
   - API 返回的 `labelKey` 不直接显示给用户。
   - Dashboard/Shell 新增 JSX、props、aria、placeholder、title、empty/error/loading/success text 全部受 i18n 管理。
   - 中文 locale 下不得出现 dashboard UI 英文 fallback；英文 locale 下不得出现中文 UI 文案。
   - 动态 count/month/range/status 句子使用 catalog template，不用翻译片段拼接。
   - container status、pallet status、load job status 使用各自 locale-aware helper，不能混用。
5. Accessibility / responsive：
   - keyboard focus 可见。
   - dashboard links/buttons 可键盘访问。
   - 1366、1920、mobile 宽度无明显文本重叠。
   - reduced-motion 下没有必要动画。
6. Existing workflow smoke：
   - `/imports`
   - `/containers`
   - `/load-jobs`
   - `/reports/inventory`
   - `/work-hours`
   - `/unloading-wage`
   - `/unloading-summary`
   - `/mobile/load-jobs`

建议新增测试：
1. API unit:
   - `apps/api/src/dashboard/dashboard.service.spec.ts`
2. API e2e:
   - `apps/api/test/dashboard.e2e-spec.ts`
3. Web unit:
   - `apps/web/tests/dashboard-flow.test.ts`
   - 覆盖 dashboard helper、status labels、permission section mapping。
4. Web i18n:
   - 更新 `apps/web/tests/i18n.test.ts`，确保新增 dashboard 文案纳入 catalog。
   - 扫描 `apps/web/src/app/page.tsx`、`apps/web/src/components/dashboard/`、
     `apps/web/src/components/layout/` 中新增 visible strings。
   - 断言 dashboard labelKey 全部有 en/zh 对应翻译。
   - 断言没有新增中文硬编码 JSX 文案。
   - 断言没有新增英文长句绕过 catalog。
5. Playwright:
   - `apps/web/e2e/dashboard.spec.ts`
   - ADMIN / OFFICE / WAREHOUSE / HR_MANAGER / WAREHOUSE_MANAGER role smoke。
   - locale switch smoke 覆盖 `/`。
   - 检查 `/` 在中文下不显示英文 dashboard section labels。
   - 检查 `/` 在英文下不显示中文 dashboard section labels。
   - 检查不可见双语状态模式：
     - `已拆完 (UNLOADED)`
     - `已送库 (LOADED)`
     - `Delivered to destination / 已送库`
     - `Unloaded / 已拆完`

测试命令：
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test -- dashboard
pnpm --filter api test:e2e -- dashboard
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test -- dashboard i18n
pnpm --filter web build
docker compose -f infra/docker/compose.local.yml ps
scripts/healthcheck.sh

建议 full-stack smoke：
```bash
E2E_ADMIN_EMAIL=admin@bestarcca.com E2E_ADMIN_PASSWORD='Bestar-Admin-Local-2026!' pnpm --filter web exec playwright test e2e/dashboard.spec.ts e2e/locale-switch.spec.ts
```

验收标准：
1. API + Web + E2E 测试通过。
2. Docker full-stack healthcheck 通过。
3. Dashboard 在 ADMIN 下展示完整运营总览。
4. Dashboard 在非 ADMIN 角色下按权限裁剪。
5. i18n 门禁通过：
   - `pnpm --filter web test -- i18n` 0 unmanaged UI strings。
   - Dashboard/Shell 新增 labelKey 全部有 en/zh translation。
   - 中英文切换无双语混排。
   - 中文 locale 无英文 dashboard UI fallback。
   - 英文 locale 无中文 dashboard UI fallback。
6. Existing workflow smoke 无阻塞回归。
7. 业务开发 agent 输出截图或手工验证说明，至少覆盖 desktop 和 mobile 的 English / 中文。

完成输出：
1. changed files
2. tests run
3. role-by-role dashboard visibility matrix
4. screenshots/manual verification notes
5. known limitations
6. 结论：
   - `dashboard redesign complete`
   - 或列出 blocker / remaining task
