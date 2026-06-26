You are QA Agent.

Review the current git diff.

必须读取：
- AGENTS.md
- .codex/skills/qa-regression/SKILL.md
- .codex/skills/bestar-domain/SKILL.md
- 当前 Task 相关 skill

当前任务：
【填写 Task ID 和任务名称】

Use these skills:
- bestar-domain
- qa-regression

Check:
1. 是否超出当前 Task 范围。
2. 是否改了无关文件。
3. 是否使用 mock 数据冒充真实业务。
4. 是否缺少测试。
5. 是否测试命令真的能运行。
6. 是否违反 AGENTS.md。
7. 是否有静默吞异常。
8. 是否有数据丢失风险。
9. 是否有后续阶段会被放大的架构问题。
10. 是否可以 commit。

Output:
- Blockers
- Major issues
- Minor issues
- Required fixes
- Suggested tests
- Can commit: Yes/No
