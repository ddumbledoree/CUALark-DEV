# CUA-Lark Development Notes

## Phase 0: 桌面端可行性 Spike

### 目标

先验证本机能否稳定控制飞书桌面端，不先写大框架。

### 验收标准

- 至少 5 个单步动作成功。
- 明确 UI-TARS / NutJS 桌面执行链路是否可用。
- 明确是否需要自定义 `FeishuDesktopOperator`，以及问题清单。

### 安全边界

- 只使用飞书测试账号、测试群、测试日历、测试文档空间。
- 不操作真实工作群、真实私人联系人或敏感文档。
- 不记录 API key、cookie、token 或含敏感信息截图。
- 发送消息仅限 `CUA测试群`，内容使用无敏感测试文本。
- 所有项目文件、Spike 脚本、截图和报告原则上落盘到本工作路径 `E:\demo\CUA-Lark`；尽量不要写入 C 盘。
- 每个 Phase 验收后，将开发证据和必要截图记录收录进本文档；已有证据不重复记录。

### 初始环境探测

| 项目 | 结果 | 证据 |
|---|---|---|
| Node.js | 已安装 | `Get-Command node` 显示 `D:\softwares\nodejs\node.exe`，版本 `24.13.1.0` |
| npm/npx | 已安装但 PowerShell `.ps1` 被执行策略拦截 | `npm config get registry` 触发 PowerShell ExecutionPolicy 错误；后续应使用 `npm.cmd` / `npx.cmd` |
| 飞书桌面端 | 已运行 | `Get-Process` 发现多个 `Feishu.exe` 进程，路径含 `E:\software\lark\Feishu\app\Feishu.exe` |
| UI-TARS CLI 包 | 可解析但直接运行失败 | `npm.cmd view @ui-tars/cli` 显示版本 `1.2.3`、bin 为 `ui-tars`；`npx.cmd -y @ui-tars/cli --help` 失败 |
| UI-TARS SDK 包 | 可解析 | `npm.cmd view @ui-tars/sdk` 显示版本 `1.2.3` |
| NutJS 截图链路 | 成功 | `node tools\phase0-nutjs-smoke.cjs --package-root ... screenshot` 返回 `scaleFactor=1.25`、逻辑分辨率 `2048x1152`、耗时 `587ms`、未保存截图 |
| Codex YOLO 配置 | 已调整 | `.codex/config.toml` 中 `approval_policy = "never"`，保留 `sandbox_mode = "workspace-write"`；当前会话中桌面截图/控制仍需要提权，预计新会话更可靠 |

### 待执行单步动作

| 动作 | 状态 | 备注 |
|---|---|---|
| 截图 | 成功 | NutJS 可截图，`scaleFactor=1.25`，默认不落盘 |
| 点击任务栏飞书图标 | 成功 | 坐标约 `(696.32,1128.96)`，成功恢复飞书窗口 |
| 点击消息入口 | 成功 | 坐标约 `(61.44,127.872)`，飞书保持在消息页 |
| 搜索 `CUA测试群` | 成功 | 带任务栏聚焦的连续动作可进入飞书搜索/会话状态，当前已定位到 `CUA测试群` |
| 输入 `Hello World` | 成功 | 带任务栏聚焦的连续动作将 `Hello World` 输入到 `CUA测试群` 草稿框，未发送；随后已清理草稿 |
| 发送消息 | 未验证 | 需用户确认当前账号和群为测试环境 |
| 滚动消息列表 | 动作执行成功，视觉效果不明显 | `scroll down` 命令完成，但会话内容区当前几乎为空，截图变化不明显 |
| 快捷键 | 不确定 | `click-hotkey` 执行了 `ctrl+k`，但截图未观察到明确 UI 变化，不能计为稳定成功 |

### 问题清单

- `npm.ps1` 被 PowerShell 执行策略拦截；改用 `npm.cmd` / `npx.cmd`。
- `@ui-tars/cli@1.2.3` 直接通过 `npx` 运行时报错：`Cannot find module 'uuid'`，栈位于 `@ui-tars/sdk/dist/GUIAgent.js`；依赖声明中 `@ui-tars/sdk@1.2.3` 未列出 `uuid`，需要验证是否可通过显式安装 `uuid` 绕过。
- 真实飞书 GUI 操作前，需要确认当前登录账号和目标群是测试资源。
- 当前 Windows 缩放因子为 `1.25`；后续点击坐标必须记录是否出现 DPI 偏移。
- 飞书窗口可通过任务栏图标点击恢复，但 `Get-Process MainWindowHandle` 和当前 Win32 枚举方式拿不到可见窗口句柄；后续不能依赖该方式定位飞书。
- 单步拆成多条 Codex shell 命令会造成焦点被 Codex 抢回；真实 GUI 动作序列必须在一个连续进程里完成。
- 当前飞书界面可见的是比赛/项目相关群与知识问答结果，不是安全白名单里的 `CUA测试群`；发送消息和选择联系人暂停。
- 权限审批本身会把焦点切回 Codex，导致审批后的截图/点击默认作用在 Codex，而非飞书。这是当前 Phase 0 操作失败的根因之一；后续 GUI 动作必须采用“审批后倒计时，用户切回飞书，脚本在同一进程连续执行”的模式。
- 更稳的修正：每条飞书动作序列第一步先点击任务栏飞书图标，再执行飞书内动作，避免依赖人工切回窗口。
- `tools/phase0-nutjs-smoke.cjs --save` 已改为同时保存动作前/动作后截图，避免把动作前截图误当动作后证据。
- 非提权执行 NutJS 截图失败：`Failed to capture screen`。当前会话仍需提升权限运行桌面控制；YOLO 配置可能要新会话才完全生效。

### 当前有效证据

| 证据 | 文件 / 输出 |
|---|---|
| 安全五步连续动作执行日志 | 命令输出显示 click 消息入口、click 搜索、type `CUA测试群`、scroll down、click 关闭搜索均执行完成 |
| 英文输入成功 | `artifacts/phase0/screenshot-after-2026-05-06T06-18-18-205Z.png` 显示 `Hello World` 位于 `CUA测试群` 输入框，未发送 |
| 草稿清理成功 | `artifacts/phase0/screenshot-after-2026-05-06T06-19-07-592Z.png` 显示输入框恢复为 `发送给 CUA测试群` 占位文本 |

## Phase 1: 最小工程骨架

### 目标

创建 CUA-Lark 自有 TypeScript 工程骨架，不直接改 UI-TARS Desktop，不引入大型前端或复杂系统。

### 已完成

| 项目 | 结果 | 证据 |
|---|---|---|
| TypeScript 工程 | 完成 | 新增 `package.json`、`package-lock.json`、`tsconfig.json`、`.gitignore` |
| 环境变量样例 | 完成 | 新增 `.env.example`，只包含 `VLM_BASE_URL`、`VLM_API_KEY`、`VLM_MODEL`、`CUA_OPERATOR`、`CUA_TRACE_DIR`，不含真实密钥 |
| 最小 CLI | 完成 | `src/cli/run-task.ts` 支持 `npm run run-task -- <task-spec.json>` |
| TaskSpec 类型与加载 | 完成 | `src/core/task-spec.ts`、`src/core/load-task.ts` |
| Operator 抽象与 mock | 完成 | `src/operators/operator.ts`、`src/operators/mock-operator.ts`、`src/operators/create-operator.ts` |
| Trace 写入 | 完成 | `src/core/run-task.ts` 写出 JSONL trace 到 `traces/` |
| 第一条任务 | 完成 | `tasks/im-send-text-001.json` 为真实 IM 任务契约；`tasks/im-send-text-001.mock.json` 用于 Phase 1 mock 验证 |

### 依赖与安装记录

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm.cmd install` | 失败 | npm 试图写 `D:\softwares\nodejs\node_cache`，报 `EPERM` |
| `npm.cmd install --cache .npm-cache` | 失败 | 原生桌面依赖安装脚本触发 `spawn EPERM` |
| `npm.cmd install --cache .npm-cache --ignore-scripts` | 成功 | 依赖缓存落在工作区 `.npm-cache`；Phase 1 mock 骨架可用 |
| `npm.cmd install --package-lock-only --ignore-scripts --cache .npm-cache` | 成功 | 移除未使用测试依赖后更新 lockfile |

### 验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec smoke test passed` |
| `npm.cmd run run-task -- tasks/im-send-text-001.mock.json` | 通过 | 输出 `status: passed`、`operator: mock`、trace 路径 `traces\im-send-text-001-1778050236020.jsonl` |

### 限制与问题

- 当前 Phase 1 只验证工程骨架、TaskSpec、mock operator 和 trace 管线，不执行真实飞书桌面动作。
- `@ui-tars/operator-nut-js` 已列入依赖，但本轮使用 `--ignore-scripts` 安装；原生桌面依赖脚本未运行，不能据此宣称 NutJS 包安装完全可用。
- `tsx` 与 `vitest` 都会触发子进程/worker，在当前环境报 `spawn EPERM`；已改为 `tsc` 编译后用 `node` 运行。
- 当前目录不是 git 仓库；Phase 验收后要推 GitHub，需要先初始化 git 或确认远端仓库目录。

## 后续 Thread 最小继续开发 Prompt

> 维护规则：每个新 thread 开始时先读 `AGENTS.md`、`PROJECT_ROADBOOK.md`、`DEV_NOTES.md`，再执行当前 Phase；每个 Phase 验收后更新本栏和对应证据记录。

你正在继续开发 `E:\demo\CUA-Lark`，项目是 CUA-Lark：面向飞书/Lark 桌面端的 Computer-Use Agent GUI 测试框架。请遵守 `AGENTS.md` 工作规则：先读代码和文档，最小改动，验证后汇报，证据写入 `DEV_NOTES.md`，文件尽量落在工作区内，避免 C 盘。

当前已完成：

- Phase 0 桌面可行性 Spike：NutJS 截图、点击、搜索、中文输入、英文草稿输入均验证可用；关键约束是 Windows 缩放 `scaleFactor=1.25`、每条飞书动作序列先点击任务栏飞书图标聚焦、动作必须同一进程连续执行、动作前/后截图要作为证据。
- Phase 1 最小工程骨架：TypeScript 工程、TaskSpec、mock operator、run-task CLI、JSONL trace、`im-send-text-001` 任务契约已经完成；验证命令 `npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run run-task -- tasks/im-send-text-001.mock.json` 均通过。

当前限制：

- 真实 desktop operator 尚未接入工程骨架；`@ui-tars/operator-nut-js` 依赖使用 `--ignore-scripts` 安装，原生依赖脚本未验证通过。
- 当前环境中 `tsx` / `vitest` / 部分原生安装脚本会触发 `spawn EPERM`，所以运行路径采用 `tsc` 编译后 `node dist/...`。
- 真实发送消息仍未执行；只能在确认测试账号、`CUA测试群`、安全白名单后进行。

下一步建议从 Phase 2/Operator 层开始：实现最小 `FeishuDesktopOperator` 或 desktop operator adapter，把 Phase 0 的任务栏聚焦、截图、动作执行、动作后截图证据纳入工程内，同时保持 Agent Core 与具体桌面实现解耦。不要先做大型前端、复杂 skills、subagents 或 hooks。
