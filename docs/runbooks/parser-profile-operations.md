# Parser Profile Operations / 解析模板操作手册

This runbook separates user-facing bilingual names from stable permission and
diagnostic codes. Operators should follow the localized UI; stable codes are
for access control, support and audit correlation only.

## UI and permission map / 界面与权限对应

| English UI | 中文界面 | Stable permission |
| --- | --- | --- |
| Build parser template | 建立解析模板 | `parser_profiles.train` |
| Parser profiles | 解析模板 | `parser_profiles.read` |
| Parser review | 解析复核 | `parser_profiles.review` |
| Approve / Pause / Resume / Retire | 批准 / 暂停 / 恢复 / 退役 | `parser_profiles.approve` |

An OFFICE user normally receives read, train and review access. Approval and
lifecycle governance require ADMIN or an explicitly delegated approver. A 403
is an authorization result, not a retryable parser failure.

办公室账号通常可查看、建立和复核模板；批准与生命周期治理只允许 ADMIN 或明确授权的审批人。403 表示权限不足，
不是可以反复重试的解析错误。

## Office workflow / 办公室流程

1. Open a failed or unsupported import and choose **Build parser template / 建立解析模板**.
2. Confirm the sheet and header rows, then map container, destination, cartons
   and volume. Keep customer cell text unchanged; the preview marks it as
   original source data.
3. Inspect warnings/errors and the bounded source preview. Correct the manual
   unloading result, generate the normal report, and mark unloading complete
   only when the persisted business result is correct.
4. Run completion replay. Resolve every material diff before submitting the
   immutable candidate for approval.
5. After approval, later matching imports enter **Parser review / 解析复核**.
   Accept only when destination, cartons, volume, container and pallet outcome
   match the approved result. Use correction/rejection when they do not.
6. The UI shows `1/3`, `2/3`, `3/3`. Repeating the same SHA does not advance the
   streak. A material parser correction resets it.

## Approver workflow / 审批与治理

1. Open **Parser profiles / 解析模板** and inspect the immutable completion
   evidence, replay result, mapping, warnings and audit timeline.
2. Approval creates `ACTIVE + REVIEW_REQUIRED + 0/3`; it never makes the first
   workbook trusted.
3. Use **Pause / 暂停** during investigation. A paused profile cannot auto-parse.
   Use **Resume / 恢复** only after the reason is resolved.
4. Use **Retire / 退役** for a permanently obsolete layout. Retire is not undo;
   fork a new immutable version when the layout changes.
5. A trusted result with a later material correction is automatically demoted
   to `REVIEW_REQUIRED` and reset to `0/3`. Historical evidence remains intact.

## Drift, collision and failure recovery / 漂移、冲突与故障恢复

- Required-header drift, an out-of-tolerance moved column, formula-cache
  blocker or multiple matching profiles must fall back to review; do not force
  a winner or edit the original workbook.
- If a built-in parser remains authoritative, confirm the source panel says
  **Built-in parser / 内置解析器** and continue the existing manual path.
- If Worker/API execution fails, refresh the import/job status. Manual reports,
  unloading completion, inventory and loading history must remain persisted;
  never recreate them merely to clear a parser error.
- Stale approval/review conflicts require refresh and re-review. Do not submit
  repeated decisions to manufacture evidence.
- Do not delete an import referenced by a learning case, review or evidence.
  Only a closed unused draft may be released under the approved deletion rule.

Support may inspect stable diagnostics such as `REVIEW_REQUIRED`, `TRUSTED`,
selection reason codes and audit event codes. These codes must stay inside the
technical diagnostics area and must not replace the localized primary message.

## Golden-pair intake / Golden Pair 收件清单

For each same-layout customer pair, record without exposing private customer
content:

- display label, original filename, full SHA-256, format and deidentification
  status;
- canonical mapping/completion snapshot and final unloading report;
- expected destination, cartons, volume, container and pallet outcome;
- merged headers, summary rows, formula/cache behavior and known variation;
- deidentified reviewer role and signoff date.

Keep original bytes in the approved sample/storage workflow. Four distinct
sources are required: one initial approval and three later no-material-correction
reviews. Generated or structurally derived workbooks may test technical edges
but cannot replace customer acceptance.

每套同版式客户样本必须保留原文件、完整哈希、批准后的映射/完成快照、最终报告、业务预期、版式差异说明和脱敏审批
角色/日期。至少需要四个不同 SHA：一份首版批准，加三份连续无实质修正复核。自动生成或派生文件只能用于技术测试，
不能冒充客户验收。

## Escalation checklist / 升级检查

Before escalating, capture the import ID, localized primary message, stable
diagnostic code, profile/version, lifecycle revision, job ID and timestamp.
Do not copy workbook rows, private identities, credentials or storage paths into
chat, tickets or handoff documents.

升级前记录 import ID、本地化主提示、稳定诊断码、模板/版本、生命周期 revision、job ID 与时间。不得把工作簿业务行、
私人身份、凭据或 storage 路径复制到聊天、工单或交接文件。
