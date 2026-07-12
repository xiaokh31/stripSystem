# 执行 AGENT-AUTONOMY-01：Business Agent Non-Interactive Execution

## 目标

让业务逻辑开发 Agent 在当前项目执行已指定 Task 时拥有宿主可提供的最高项目级权限，并对常规开发过程
采用非交互执行，不因每个命令、相关文件、测试、迁移或 Docker 操作反复等待人工确认。

## 2026-07-12 修正说明

原实现把 `approval_policy` 设为 `never`，但 permission profile 仍继承 `:workspace`。这只会禁止弹出批准，
不会授予 Docker socket、工作区外临时目录等能力，因而不满足“最高权限且无需人工确认”的目标。本次修正
要求统一 launcher 明确传入 `--sandbox danger-full-access --ask-for-approval never`，并要求旧会话退出后重启。

## 必须读取

- `AGENTS.md`
- `prompts/agents/business-logic-agent.md`
- `prompts/agents/general.md`
- 实际启动业务 Agent 的脚本、IDE/CLI profile、sandbox 和 approval 配置（若存在）
- 本机/CI 关于 workspace、network、Docker 和 credential 的权限说明

## 已完成的文档授权

`prompts/agents/business-logic-agent.md` 已声明：当前 Task 范围内的项目文件、依赖、migration、生成、测试、
Docker 和本地服务默认自主执行，不因可自行解决的结构差异暂停；仍须保留测试、审计、i18n 和数据安全。

## 执行范围

1. 找到业务 Agent 的真实启动入口；仓库没有 launcher/config 时，记录实际由哪个宿主产品控制，不虚构配置。
2. 将 business-agent profile 和统一 launcher 设置为 `danger-full-access`，并将常规 in-scope command
   approval 设置为 `never`；不得继续继承 `:workspace`。
3. 允许当前仓库读写、package install、Prisma generate/migrate、测试/构建、Docker Compose、localhost
   服务和 `/tmp` 测试产物；网络依赖权限按宿主能力配置。
4. 权限只由本项目 launcher 显式选择的 business-agent profile 启用，不修改默认 Agent 配置；必须明确记录
   `danger-full-access` 在操作系统层并非硬性 project-only sandbox，项目范围由固定 cwd、Agent 规则和
   `.codex/execpolicy.rules` 共同约束。
5. 运行无业务副作用 capability smoke：读文件、在临时目录写/删测试文件、lint help、Docker ps 或等价
   只读检查，确认常规过程不弹人工确认。
6. 更新运行说明，记录 profile 更新后必须安装新副本并新建会话，以及哪些动作仍受平台强制边界控制。

## 不可取消的边界

- 不允许 `git reset --hard`、覆盖用户未提交改动、删除真实 storage/database、重写 Git 历史。
- 不允许读取/输出密钥、凭据或 token，不允许外部发布、发送消息、创建费用或生产部署。
- 不允许关闭测试、RBAC、审计、i18n 或安全校验。
- 宿主平台强制审批无法通过仓库提示词绕过；若最高权限仍有强制 prompt，应准确记录限制。

## i18n 硬门禁

本任务通常不新增 UI。若新增 launcher/status UI、错误提示或 Agent 可见状态，用户可见文案必须进入对应
en/zh catalog；不得把内部 permission code 作为主 UI 文案。

## 验收标准

1. Business Agent 统一启动器明确固定 `danger-full-access`、`never` approval 和当前仓库 cwd，且拒绝调用方覆盖。
2. 只读/临时写入/测试/Docker capability smoke 无人工确认且无业务副作用。
3. 破坏性 Git、递归删除、发布、远程基础设施和高风险 Docker 动作仍由 execpolicy 拒绝。
4. stale profile 会被 launcher 拒绝，并提示安装更新；文档明确恢复旧会话不会加载新权限。
5. 文档如实说明 full access 与宿主强制边界，不宣称提示词能绕过企业管理策略。
6. `git diff --check` 通过。

## 测试命令

- 运行 launcher/profile config validation（按实际宿主）
- 运行无副作用 capability smoke
- `git diff --check`
