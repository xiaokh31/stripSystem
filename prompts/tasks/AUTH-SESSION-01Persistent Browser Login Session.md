执行 AUTH-SESSION-01：Persistent Browser Login Session。

优先级：
- High。办公室系统是本地部署的日常操作系统，当前 8 小时登录有效期会导致人事经理、仓管经理、办公室人员频繁重新登录。新需求是只要用户不清除浏览器 cookie，就尽量长期保持登录状态。

必须读取：
- AGENTS.md
- prompts/agents/business-logic-agent.md
- prompts/agents/product-planning-agent.md
- .codex/skills/auth-rbac/SKILL.md
- .codex/skills/nestjs-prisma-api/SKILL.md
- .codex/skills/nextjs-pwa-ui/SKILL.md
- docs/architecture/09-account-role-permission-management.md
- docs/runbooks/account-role-permission-management.md
- apps/api/src/config/app.config.ts
- apps/api/src/auth/
- apps/api/src/permissions/
- apps/web/src/lib/auth-token.ts
- apps/web/src/lib/api-client.ts
- apps/web/src/middleware.ts
- apps/web/src/components/auth/
- apps/web/src/lib/i18n/

前置任务：
- 无。

业务背景：
- 当前 API 默认 `JWT_EXPIRES_IN_SECONDS=28800`，Web 登录后用 API 返回的 `expiresIn` 写入 `bestar_auth_token` cookie 的 `Max-Age`。
- 因为 API JWT 和浏览器 cookie 有效期绑定，若只改前端 cookie 而不改 JWT，用户仍会在 token 过期后被 API 拒绝。
- 浏览器对持久 cookie 可能存在上限。实现时应采用“本系统默认尽量长”的配置口径，并在代码/文档中说明浏览器可能实际裁剪。

目标：
1. 默认把办公室 Web 登录会话改成长周期持久登录。
2. 只要用户不主动 logout、不清除浏览器 cookie、账号未被禁用，且 token 未达到系统配置有效期，就不应频繁重新登录。
3. 保留环境变量覆盖能力，便于现场按安全要求缩短或延长。
4. 不引入会破坏当前 Docker full-stack、nginx 代理、API auth guard、Web middleware 的行为变化。

建议方案：
1. 将默认浏览器登录有效期配置为一个实际可落地的长周期，例如 400 天：
   - `400 * 24 * 60 * 60 = 34560000` 秒。
   - 继续允许 `JWT_EXPIRES_IN_SECONDS` 覆盖。
   - 如新增更语义化配置，例如 `AUTH_BROWSER_SESSION_MAX_AGE_SECONDS`，必须清楚定义它和 JWT expiry 的关系，避免 cookie 比 JWT 长导致假登录。
2. API 登录响应继续返回 `expiresIn`，Web cookie `Max-Age` 使用同一个有效期或明确裁剪后的有效期。
3. `logout` 仍必须清除 cookie。
4. 已禁用用户、删除角色、权限变化后不得因为长 token 绕过后端权限校验：
   - API 每次鉴权仍必须从数据库读取当前用户和权限。
   - 禁用用户下一次请求必须失败。
   - 权限变化下一次请求必须按最新权限判断。
5. 如果实现 refresh token/session table，必须另行保证审计和撤销；本任务不强制引入 refresh token，优先保持改动小。

I18n hard gate：
1. 任何新增或修改的登录页、过期提示、权限错误、logout、session 状态文案必须进入 `apps/web/src/lib/i18n/locales/en.ts` 和 `zh.ts`。
2. API 只返回稳定 error code，例如 `AUTH_TOKEN_EXPIRED`、`AUTH_USER_DISABLED`、`AUTH_SESSION_INVALID`，不得返回面向 UI 的中英文长句作为前端显示源。
3. Web 用当前 locale 显示登录状态、错误提示、按钮 tooltip/aria/title/placeholder。
4. 语言切换后登录页、已过期提示、权限不足页不得出现中英混排或 raw code 作为主提示。

不做：
1. 不改变账号、角色、权限模型。
2. 不为了长登录跳过 API token 校验。
3. 不把 token 放入 localStorage。
4. 不改变移动端 secure token storage，除非共享代码必须同步类型。

验收标准：
1. 默认配置下，登录响应 `expiresIn` 不再是 28800 秒，而是长周期配置值。
2. Web `bestar_auth_token` cookie 写入持久 `Max-Age`，关闭并重新打开浏览器仍能访问已授权页面。
3. 用户点击 logout 后 cookie 被清除，刷新页面回到登录页。
4. 手工或测试把用户 `isActive=false` 后，旧 cookie 下一次请求不能继续访问受保护 API。
5. 用户权限变化后，旧 cookie 下一次请求按最新权限裁剪页面/API。
6. 过期 token 仍能被识别并引导重新登录。
7. 新增/修改文案全部纳入 i18n catalog，中英文切换单语显示。
8. 更新相关 runbook 或配置说明，说明长登录默认值、环境变量、浏览器 cookie 上限和安全取舍。

建议测试命令：
- pnpm --filter api lint
- pnpm --filter api typecheck
- pnpm --filter api test -- auth
- pnpm --filter api test:e2e -- auth
- pnpm --filter web lint
- pnpm --filter web typecheck
- pnpm --filter web test -- auth
- pnpm --filter web test -- i18n
- git diff --check

手工验收：
1. 使用 Docker full-stack 打开 `http://127.0.0.1/`。
2. 登录办公室账号，检查 cookie `bestar_auth_token` 的 `Max-Age` 为长周期。
3. 关闭浏览器窗口并重新打开，确认仍已登录。
4. 点击 logout 后刷新，确认不能访问 dashboard。
5. 重新登录后禁用该用户，刷新受保护页面，确认不能继续访问。
6. 切换 English / 中文，确认登录、logout、session 相关提示单语显示。

完成输出：
1. changed files。
2. 配置项和默认有效期说明。
3. 测试命令和结果。
4. 手工验收结果。
5. 已知限制，例如浏览器可能裁剪超长 cookie。
6. 明确结论：`persistent browser login session implemented`。
