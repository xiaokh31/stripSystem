执行 UNLOAD-PALLET-06：Destination Correction Save Regression。

优先级：
- High。当前办公室人员人工修改 destination 后可能无法保存，阻塞托盘数修正流程。

必须读取：
- AGENTS.md
- docs/product/03-pallet-calculation-rules.md
- prompts/tasks/UNLOAD-PALLET-05Default Carton Package Type + Hide Package Selector.md
- .codex/skills/bestar-domain/SKILL.md
- apps/web/src/components/containers/container-detail-flow.ts
- apps/web/src/components/containers/container-destination-corrections.tsx
- apps/web/tests/container-detail-flow.test.ts
- apps/api/src/corrections/
- apps/api/test/corrections.e2e-spec.ts

问题描述：
- 部分清单导入后，人工修改 destination 后点击保存，前端提示：
  `Change destination, actual cartons, actual CBM, actual pallets, or note before saving.`
- 用户添加了 note 仍然无法保存。
- 该提示来自前端变更检测认为没有 `destinationCode` / `destinationType` / `packageType` / `cartons` / `volume` / `manualPallets` / `note` 变化，但实际页面已有用户编辑。

排查方向：
1. 前端 draft 初始化和实际 API response 的值格式可能不一致，例如：
   - `totalVolumeCbm` 字符串格式不同：`5.25` vs `5.250`；
   - `note` 的 `null` / 空字符串 / 空白字符处理；
   - `manualPallets` 的 `null` / `""` / `0` 处理；
   - 旧 `packageType` 控件移除后 changed fields 列表和错误文案未同步。
2. textarea/input 的 `onChange` 是否正确写入目标 destination draft。
3. 保存时是否拿到了最新 draft，是否被 `router.refresh()` 或 destinations 重新渲染覆盖。
4. API 是否接受 `note` 独立更新，并写入 correction audit；如果产品决定只有 actual note 可以单独保存，则前端和 API 必须一致。

业务规则：
1. 办公室人员只修改 `actual note` 时也应可以保存，并生成 audit 记录。
2. 办公室人员只修改 destination、actual cartons、actual CBM、actual pallets 任一字段时必须可以保存。
3. `audit note` / `correctionNote` 只是保存说明，不应单独作为业务字段变更；如果没有任何业务字段变化但只填 audit note，可以继续提示需要先修改业务字段。
4. 保存失败时提示必须准确，不得要求用户修改已经修改过的字段。
5. 不得绕过后端审计；所有实际字段变化仍需要 correction/audit。

任务范围：
1. 修复 `buildDestinationCorrectionRequest` 的变更检测和错误文案。
2. 确认 `note` 变化会进入 `payload.note`，并且 API 能独立保存 note。
3. 移除 package selector 后，同步调整 changed fields、supplemental label prompt、错误提示文案。
4. 如果 API 当前不接受 note-only update，补 API DTO/service/test，使 note-only update 可审计保存。
5. 增加回归测试覆盖用户描述的失败场景。

验收标准：
1. 只修改 `actual note`，点击保存成功，刷新后 note 保留，audit 中有 note 变更记录。
2. 只修改 `actual CBM`，保存成功并重新计算托盘数。
3. 只修改 `actual cartons`，保存成功并重新计算托盘数。
4. 只修改 `actual pallets`，保存成功并使用 manual override。
5. 只填写 `audit note` 且没有业务字段变化时，提示“需要修改业务字段后再保存”，但文案不再误导用户。
6. 移除 package selector 后，保存逻辑不再依赖 packageType 变化。
7. 新增/修改 destination 的保存流程都通过。

建议测试：
- Web unit test：
  - note-only draft returns ok payload `{ note: "..." }`。
  - whitespace-only note is treated consistently。
  - correctionNote-only returns expected validation error。
  - after UNLOAD-PALLET-05, no packageType field is required for save。
- API test：
  - update destination note only writes correction feedback/audit and returns updated destination。
  - update volume/cartons recalculates pallets。
  - clear manual pallets still restores calculated pallets。
- 手工 smoke：
  - 导入一个真实或脱敏清单，打开 container detail，逐项修改 note / CBM / cartons / pallets 并保存。

建议测试命令：
- pnpm --filter web typecheck
- pnpm --filter web test
- pnpm --filter api typecheck
- pnpm --filter api test
- git diff --check

完成输出：
1. 说明无法保存的根因。
2. 列出修复的前端/API文件。
3. 列出新增回归测试。
4. 列出测试命令和结果。
5. 明确结论：`destination correction save regression fixed`。
