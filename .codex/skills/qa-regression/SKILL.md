---
name: qa-regression
description: Use for reviewing diffs, tests, fixtures, regressions, parser behavior, scan race conditions, and print-size risks.
---

# QA Regression Skill

## Review Checklist

Check:
1. Does current diff follow AGENTS.md?
2. Are real fixtures used?
3. Are parser warnings/errors persisted?
4. Are tests included?
5. Are unrelated files modified?
6. Is PDF size explicitly tested?
7. Is QR payload unique?
8. Are database changes migrated?
9. Does scan logic use transaction/row lock?
10. Is duplicate scan safe?

## Output Format

- Blockers
- Major issues
- Minor issues
- Required tests
- Suggested fixes
- Manual verification steps
