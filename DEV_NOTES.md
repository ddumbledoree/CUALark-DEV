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
| 飞书桌面端 | 已运行 | `Get-Process` 发现多个 `Feishu.exe` 进程，路径含 `<LOCAL_FEISHU_EXE_PATH>` |
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

## Phase 2: Operator 层最小接入

### 当前进展

| 项目 | 结果 | 证据 |
|---|---|---|
| Operator 动作类型扩展 | 完成 | `src/operators/operator.ts` 增加 `click`、`double_click`、`right_click`、`type`、`hotkey`、`scroll`、`wait`、`finished`，并返回 `ExecuteResult` |
| Mock operator 兼容 Phase 2 动作 | 完成 | `src/operators/mock-operator.ts` 接受完整动作集合，仍不触碰真实桌面 |
| Feishu desktop operator adapter | 完成最小版本 | `src/operators/feishu-desktop-operator.ts` 封装 `@ui-tars/operator-nut-js`，支持截图、动作转发、可选任务栏聚焦、动作后等待 |
| Operator 工厂接入 | 完成 | `src/operators/create-operator.ts` 支持 `CUA_OPERATOR=mock` 与 `CUA_OPERATOR=feishu-desktop` |
| Run 证据目录 | 完成 | `src/core/run-task.ts` 生成 `task.json`、`steps.jsonl`、`result.json`、`screenshots/*.png` |
| Observe-only TaskSpec | 完成 | `tasks/phase2-desktop-observe.json` 用于真实桌面 operator 截图与 trace 冒烟，不发送消息 |
| 环境变量示例 | 完成 | `.env.example` 增加 `CUA_SCREEN_WIDTH`、`CUA_SCREEN_HEIGHT`、`CUA_FEISHU_FOCUS_BOX`、`CUA_POST_ACTION_DELAY_MS` |

### 验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec smoke test passed` |
| `npm.cmd run run-task -- tasks/im-send-text-001.mock.json` | 通过 | 输出 `status: passed`、`operator: mock`、`tracePath: traces\im-send-text-001-1778054996627\steps.jsonl` |
| `npm.cmd run run-task -- tasks/phase2-desktop-observe.json` | 通过 | 使用 mock operator 验证 `actions` 字段与 observe-only trace 管线，输出 `status: blocked`、`tracePath: traces\phase2-desktop-observe-1778055076870\steps.jsonl` |

### 当前限制

- 本轮没有自动运行 `CUA_OPERATOR=feishu-desktop`，因为 observe-only 也会保存真实桌面截图；必须先确认当前飞书窗口和桌面内容为测试环境且不含敏感信息。
- `FeishuDesktopOperator` 目前只是最小 adapter，尚未接入 VLM action parsing，也没有自动 evaluator。
- `CUA_FEISHU_FOCUS_BOX` 需要按当前 Windows 任务栏位置配置为 UI-TARS 风格 `start_box`，后续真实运行时必须记录是否存在 DPI 偏移。
- 真实 IM 发送仍然暂停，必须先确认测试账号、`CUA测试群` 和安全白名单。

### 下一步

1. 在确认无敏感内容后运行 `$env:CUA_OPERATOR='feishu-desktop'; npm.cmd run run-task -- tasks/phase2-desktop-observe.json`，验证真实截图、scaleFactor、动作后截图和 trace。
2. 如果 observe-only 通过，新增只打开/搜索、不发送消息的 IM 安全动作序列，继续验证 click、type、hotkey、scroll。
3. 再接入 VLM provider 与 action parser，让 Agent Core 从固定 `actions` 过渡到 `screenshot -> VLM -> action -> execute -> observe`。
4. 真实发送消息和 Calendar 操作放在测试账号、测试群、测试日历确认之后执行。

## Phase 2: VLM API 最小接入

### 当前进展

| 项目 | 结果 | 证据 |
|---|---|---|
| VLM provider 抽象 | 完成 | `src/models/vlm-provider.ts` 定义 `VlmProvider`、`VlmRequest`、`VlmResponse` |
| OpenAI-compatible provider | 完成 | `src/models/openai-compatible-vlm-provider.ts` 通过 `VLM_BASE_URL/chat/completions` 调用模型，支持文本与 `image_url` 图片输入 |
| provider 工厂 | 完成 | `src/models/create-vlm-provider.ts` 从 `VLM_BASE_URL`、`VLM_API_KEY`、`VLM_MODEL` 读取配置，不在代码中保存密钥 |
| VLM action parser | 完成 | `src/models/parse-vlm-action.ts` 解析模型输出 JSON，只允许 `click`、`type`、`hotkey`、`scroll`、`wait`、`finished` 等安全动作集合 |
| smoke CLI | 完成 | `src/cli/vlm-smoke.ts` 先做文本连通性测试，再用内置无敏感 PNG 测试图片输入和 JSON 动作输出 |
| npm 脚本 | 完成 | `package.json` 增加 `npm.cmd run vlm-smoke`，`npm.cmd test` 增加 action parser 测试 |
| 环境变量示例 | 完成 | `.env.example` 增加 `VLM_PROVIDER_NAME=volcengine-ark`，真实 key 不写入仓库 |

### 验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec smoke test passed`、`parseVlmAction smoke test passed` |

### 火山方舟本地 smoke 命令模板

不要把真实 API Key 写入仓库文件。只在当前 PowerShell 会话临时设置：

```powershell
$env:VLM_BASE_URL="https://ark.cn-beijing.volces.com/api/v3"
$env:VLM_MODEL="<EP_ID>"
$env:VLM_API_KEY="<ARK_API_KEY>"
$env:VLM_PROVIDER_NAME="volcengine-ark"
npm.cmd run vlm-smoke
```

### 当前限制

- 本轮没有代替用户运行真实 VLM smoke，因为真实 API Key 不应出现在命令记录、文档、trace 或代码中。
- `vlm-smoke` 只验证文本、图片输入和动作 JSON 解析，不执行真实桌面动作。
- 火山共享 EP-ID 是否真正支持图片输入，需要以 `npm.cmd run vlm-smoke` 的实际返回为准。
- VLM 尚未接入 `run-task` 主循环；下一步应在 smoke 通过后实现 `screenshot -> VLM -> parse action -> execute -> observe`。

### 已修复问题

- 首次真实 `vlm-smoke` 图片阶段返回 HTTP 400：火山接口要求图片最小边长至少 14px，旧 smoke 使用 1x1 PNG。已将 `src/cli/vlm-smoke.ts` 改为运行时生成 32x32 PNG。
- 同次失败后 Windows/Node 出现 `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`，已将 `vlm-smoke` 的异常处理从 `process.exit(1)` 改为设置 `process.exitCode = 1`，避免硬退出打断资源清理。
- 修复后重新运行 `npm.cmd run typecheck` 与 `npm.cmd test`，均通过。

### 真实 VLM smoke 结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run vlm-smoke` | 通过 | `provider=volcengine-ark`、`model=<VLM_ENDPOINT_ID_REDACTED>`、文本返回 `OK`、图片动作返回 `{"type":"wait","waitMs":500}` 并解析为 `{ type: "wait", waitMs: 500 }` |

补充指标：

- 文本 smoke：`latencyMs=2142`，`promptTokens=58`，`completionTokens=25`，`totalTokens=83`。
- 图片/action smoke：`latencyMs=3084`，`promptTokens=1392`，`completionTokens=48`，`totalTokens=1440`。
- 结论：火山方舟 EP-ID 已通过 OpenAI-compatible 文本与图片输入最小验证，可进入 Agent Loop 的 VLM 决策接入。

## Phase 2: Agent Loop observe-only 闭环

### 当前进展

| 项目 | 结果 | 证据 |
|---|---|---|
| Agent Loop 核心 | 完成最小版本 | `src/core/agent-loop.ts` 实现 `screenshot -> VLM -> parse action -> execute -> observe -> trace` |
| Agent Loop CLI | 完成 | `src/cli/agent-loop.ts` 支持 `npm.cmd run agent-loop -- <task-spec.json>` |
| observe-only 任务 | 完成 | `tasks/phase2-vlm-loop-observe.json` 只允许观察与等待，不发送消息 |
| mock 截图修正 | 完成 | `src/operators/mock-operator.ts` 改为返回合法 32x32 PNG，便于通过真实 VLM 图片接口 |
| 安全动作限制 | 完成 | 默认 `CUA_AGENT_ALLOWED_ACTIONS=wait,finished`，模型输出点击/输入等动作会被阻断 |
| 环境变量示例 | 完成 | `.env.example` 增加 `CUA_AGENT_MAX_STEPS`、`CUA_AGENT_ALLOWED_ACTIONS` |

### 验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec smoke test passed`、`parseVlmAction smoke test passed` |

### 待用户本地运行的真实 VLM + mock operator 闭环

当前 Codex 工具进程看不到用户 PowerShell 里临时设置的 `VLM_*` 环境变量，因此没有代跑真实 agent-loop。请在已经设置好 `VLM_BASE_URL`、`VLM_MODEL`、`VLM_API_KEY`、`VLM_PROVIDER_NAME` 的同一个 PowerShell 会话里运行：

```powershell
$env:CUA_OPERATOR="mock"
$env:CUA_AGENT_MAX_STEPS="3"
$env:CUA_AGENT_ALLOWED_ACTIONS="wait,finished"
npm.cmd run agent-loop -- tasks/phase2-vlm-loop-observe.json
```

预期结果：

- `operator=mock`。
- trace 路径形如 `traces\phase2-vlm-loop-observe-agent-<timestamp>\steps.jsonl`。
- `steps.jsonl` 至少包含 `screenshot.captured`、`vlm.action`、`action.executed`。
- `vlm.action.parsedAction.type` 必须是 `wait` 或 `finished`。

### 真实 VLM + mock operator 闭环结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run agent-loop -- tasks/phase2-vlm-loop-observe.json` | 闭环通过，任务状态按设计为 `blocked` | `operator=mock`、`tracePath=traces\phase2-vlm-loop-observe-agent-1778057542350\steps.jsonl`，3 步均为 `VLM action=wait`、`execute status=skipped` |

解释：

- 该结果证明 `screenshot -> VLM -> parse action -> execute -> observe -> trace` 已经串通。
- `status=blocked` 是 observe-only 阶段的预期结果之一：模型连续输出 `wait`，达到 `CUA_AGENT_MAX_STEPS=3` 后停止，但没有输出 `finished`，因此不能标记为 `passed`。
- 该运行没有触碰真实桌面，operator 为 `mock`。

### 下一步

1. 在确认桌面无敏感信息后设置 `$env:CUA_OPERATOR="feishu-desktop"`，运行同一 observe-only 任务，验证真实截图闭环。
2. 如果真实桌面 observe-only 通过，再逐步放开 `click`、`type` 等动作，并优先做只搜索不发送的 IM 安全任务。
3. 后续可优化 observe-only 任务提示，让模型在确认无需继续等待时输出 `finished`，从而把纯观察任务标记为 `passed`。

### 真实 VLM + Feishu desktop observe-only 闭环结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run agent-loop -- tasks/phase2-vlm-loop-observe.json` with `CUA_OPERATOR=feishu-desktop` | 通过 | `status=passed`、`operator=feishu-desktop`、`tracePath=traces\phase2-vlm-loop-observe-agent-1778057722274\steps.jsonl` |

关键观测：

- NutJS 成功采集真实桌面截图，`screenshot: 2048x1152`，`scaleFactor=1.25`。
- Agent Loop 执行 3 步：Step 1 `wait` 成功，Step 2 `wait` 成功，Step 3 `finished`，execute status 为 `end`。
- 该任务只允许 `wait,finished`，因此没有执行点击、输入、发送消息等真实业务动作。

阶段结论：

- Phase 2 的 observe-only 真实闭环已经验收通过：`screenshot -> VLM -> parse action -> execute -> observe -> trace` 可在 Feishu desktop operator 上运行。
- 下一阶段应先做 IM 安全动作序列：只允许聚焦、搜索、关闭/返回，不发送消息；通过后再进入真实 IM 发送任务。

## Phase 2b: Controlled Action Loop

### 当前进展

| 项目 | 结果 | 证据 |
|---|---|---|
| Action safety guard | 完成 | `src/core/action-safety.ts` 拦截换行输入、发送/删除/邀请等敏感内容、Enter/Delete/Backspace 等危险热键 |
| Agent Loop 安全接入 | 完成 | `src/core/agent-loop.ts` 在执行前写入 `safety` 结果，`allowed=false` 时阻断动作 |
| IM 搜索观察任务 | 完成 | `tasks/phase2-im-search-observe.json` 只允许搜索/定位 `CUA测试群`，禁止发送消息和修改数据 |
| 安全测试 | 完成 | `tests/action-safety.test.ts` 覆盖安全搜索输入、换行输入、非白名单输入、危险热键 |

### 验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec smoke test passed`、`parseVlmAction smoke test passed`、`action safety smoke test passed` |

### 待用户本地运行的受控动作命令

先使用 mock operator 验证模型是否会遵守安全策略：

```powershell
$env:CUA_OPERATOR="mock"
$env:CUA_AGENT_MAX_STEPS="5"
$env:CUA_AGENT_ALLOWED_ACTIONS="wait,click,type,hotkey,finished"
npm.cmd run agent-loop -- tasks/phase2-im-search-observe.json
```

如果 mock 结果中的 `vlm.action.safety.allowed` 均为 `true`，且没有输出发送/删除类动作，再确认桌面无敏感内容后运行真实桌面版本：

```powershell
$env:CUA_OPERATOR="feishu-desktop"
$env:CUA_AGENT_MAX_STEPS="5"
$env:CUA_AGENT_ALLOWED_ACTIONS="wait,click,type,hotkey,finished"
npm.cmd run agent-loop -- tasks/phase2-im-search-observe.json
```

注意：该任务仍然禁止发送消息。若模型输出带换行的 `type`、Enter 热键、Delete/Backspace，Agent Loop 会阻断并返回 `blocked`。

### mock 受控动作运行结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run agent-loop -- tasks/phase2-im-search-observe.json` with `CUA_OPERATOR=mock` | 闭环通过，任务状态为 `blocked` | `operator=mock`、`tracePath=traces\phase2-im-search-observe-agent-1778058007240\steps.jsonl`，5 步均为 `VLM action=wait`、`execute status=skipped` |

解释：

- 该结果不是 safety guard 阻断，而是 mock 截图缺少真实可操作 UI，模型只能连续输出 `wait`，达到 `CUA_AGENT_MAX_STEPS=5` 后停止。
- mock operator 适合验证 VLM 调用、trace 和 safety guard，不适合验证 IM 搜索动作本身。
- 下一步应在确认桌面无敏感信息后运行 `feishu-desktop` 版本；安全护栏仍会阻断发送/删除/Enter 等风险动作。

### 真实桌面受控动作问题与修复

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run agent-loop -- tasks/phase2-im-search-observe.json` with `CUA_OPERATOR=feishu-desktop` | 闭环执行但未产生可见目标点击 | `tracePath=traces\phase2-im-search-observe-agent-1778058247887\steps.jsonl`，5 步均为 `click`，但 NutJS 日志显示 `Position: (null, null)` |

原因：

- VLM 输出了 `{"type":"click","x":27,"y":77}`、`{"type":"click","position":[30,76]}`、`{"type":"click","coord":[26,79]}` 等像素坐标格式。
- 旧版 `parseVlmAction` 只识别 `startBox/start_box`，导致解析后的 action 变成 `{ type: "click" }`，坐标丢失。
- NutJS 收到无坐标 click 后无法移动到目标位置，因此用户看不到明显鼠标/屏幕动作。

修复：

- `src/models/parse-vlm-action.ts` 支持解析 `x/y`、`position:[x,y]`、`coord:[x,y]`。
- `src/operators/operator.ts` 增加 `x`、`y` 字段。
- `src/operators/feishu-desktop-operator.ts` 将像素坐标转换为 UI-TARS `start_box` 归一化坐标再交给 NutJS。
- `src/core/action-safety.ts` 增加 pointing action 校验：`click/double_click/right_click` 必须包含 `startBox` 或 `x/y`，否则阻断。
- `src/core/agent-loop.ts` 的系统提示补充 click/type/hotkey JSON schema。
- 修复后 `npm.cmd run typecheck` 与 `npm.cmd test` 均通过。

### 真实桌面窗口聚焦问题与修复

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run agent-loop -- tasks/phase2-im-search-observe.json` with `CUA_OPERATOR=feishu-desktop` after coordinate fix | 未验收 | `tracePath=traces\phase2-im-search-observe-agent-1778058565347\steps.jsonl`，动作坐标已生效，如 `(25,78)`、`(27,77)`，但截图/动作落在 Codex 前台窗口，导致 Codex 搜索框被输入 `CUA测试群` |

原因：

- Phase 0 已明确真实 GUI 动作序列必须先点击任务栏飞书图标聚焦。
- 本次 `feishu-desktop` 运行没有设置 `CUA_FEISHU_FOCUS_BOX`，因此 `FeishuDesktopOperator` 未执行任务栏聚焦，初始截图来自 Codex 前台窗口。

第一轮修复：

- `src/operators/create-operator.ts` 已改为：当 `CUA_OPERATOR=feishu-desktop` 时，必须设置 `CUA_FEISHU_FOCUS_BOX`，否则直接拒绝运行。
- `.env.example` 说明 `CUA_FEISHU_FOCUS_BOX` 为真实桌面动作必填项。Phase 0 本机示例约为 `[0.34,0.98,0.34,0.98]`，如果任务栏布局变化需要重新确认。

重跑命令模板：

```powershell
$env:CUA_OPERATOR="feishu-desktop"
$env:CUA_FEISHU_FOCUS_BOX="[0.34,0.98,0.34,0.98]"
$env:CUA_AGENT_MAX_STEPS="5"
$env:CUA_AGENT_ALLOWED_ACTIONS="wait,click,type,hotkey,finished"
npm.cmd run agent-loop -- tasks/phase2-im-search-observe.json
```

第二轮问题：

- 用户使用 `[0.34,0.98,0.34,0.98]` 后，任务栏图标位置仍不稳定，初始截图仍落在 Codex。证据为 `traces\phase2-im-search-observe-agent-1778059325492\screenshots\001.png`，截图显示 Codex 而非飞书。
- 原因是硬编码任务栏坐标不够鲁棒；飞书非全屏时，背景 Codex 容易被 VLM 识别并误操作。

第二轮修复：

- `src/operators/feishu-desktop-operator.ts` 增加 Windows `WScript.Shell.AppActivate` 窗口标题激活，默认每次截图/执行前尝试激活 `飞书,Feishu,Lark`。
- `src/operators/create-operator.ts` 增加 `CUA_FEISHU_FOCUS_MODE` 和 `CUA_FEISHU_WINDOW_TITLES`；默认 `CUA_FEISHU_FOCUS_MODE=app-activate`。
- `CUA_FEISHU_FOCUS_BOX` 只作为 `CUA_FEISHU_FOCUS_MODE=taskbar` 的显式 fallback；默认 app activation 失败会直接报错，避免误点前台 Codex。
- `.env.example` 已更新上述配置。
- 修复后 `npm.cmd run typecheck` 与 `npm.cmd test` 均通过。

第三轮问题：

- 用户确认任务栏缩略图标题显示为 `飞书`，但 `WScript.Shell.AppActivate("飞书")` 仍失败。
- `Get-Process Feishu` 显示多个 Feishu 进程，但 `MainWindowHandle=0`，与 Phase 0 记录一致，说明 PowerShell 自带窗口句柄不可靠。

第三轮修复：

- `src/operators/feishu-desktop-operator.ts` 增加 Win32 `EnumWindows` + `GetWindowThreadProcessId` + `ShowWindow` + `SetForegroundWindow`，在标题激活失败后按 `Feishu,Lark` 进程枚举顶层窗口并置前。
- `src/operators/create-operator.ts` 增加 `CUA_FEISHU_PROCESS_NAMES`，默认 `Feishu,Lark`。
- `.env.example` 增加 `CUA_FEISHU_PROCESS_NAMES=Feishu,Lark`。
- 该策略仍不使用任务栏坐标；若标题和进程激活都失败，会报错而不是误点 Codex。
- 修复后 `npm.cmd run typecheck` 与 `npm.cmd test` 均通过。

第四轮结果：

- 用户运行后仍 blocked：`Agent loop blocked: Unable to activate Feishu window by titles: 飞书, Feishu, Lark or processes: Feishu, Lark`。
- 这是安全失败：没有继续截图/点击/输入，因此没有误操作 Codex。

诊断工具：

- 新增 `tools/win-focus-diagnostics.ps1`，用于枚举当前交互桌面顶层窗口，输出 `Hwnd`、`Pid`、`ProcessName`、`Title`、`ClassName`、`Visible`、窗口坐标和大小。
- 当前 Codex 工具进程运行该脚本没有枚举到窗口输出，可能受 sandbox/交互桌面会话限制；需用户在自己的 PowerShell 会话运行并回传 Feishu/Lark 相关输出。
- 首次用户运行诊断脚本时报错：`无法覆盖变量 PID，因为该变量为只读变量或常量`。原因是 PowerShell 变量名 `$pid` 与内置只读 `$PID` 大小写不敏感冲突；已改为 `$windowPid`。

第五轮诊断结果：

- 用户过滤诊断输出显示存在 `ProcessName=Feishu`、`Title=飞书`、`ClassName=Chrome_WidgetWin_1`，同时还有 `Lark_StatusTrayWindow` 和多个 `Chrome_WidgetWin_0`。
- 过滤命令把 JSON 对象拆散，不便于定位完整窗口记录；`tools/win-focus-diagnostics.ps1` 已改为一行一个 compact JSON，便于 `Select-String` 后保留完整窗口对象。

第五轮修复：

- `src/operators/feishu-desktop-operator.ts` 的进程激活逻辑改为按窗口评分选择目标：标题匹配 `飞书/Feishu/Lark` 加权最高，类名匹配 `Chrome_WidgetWin_1` 次之，可见窗口加权；避免拿到托盘窗口或无关 Electron 子窗口。
- 内嵌 PowerShell 激活脚本也修复 `$pid` 与内置 `$PID` 变量冲突，改用 `$windowPid`。
- `src/operators/create-operator.ts` 增加 `CUA_FEISHU_CLASS_NAMES`，默认 `Chrome_WidgetWin_1`。
- `.env.example` 增加 `CUA_FEISHU_CLASS_NAMES=Chrome_WidgetWin_1`。
- 修复后 `npm.cmd run typecheck` 与 `npm.cmd test` 均通过。

第六轮诊断结果：

- 用户 compact 诊断完整输出显示飞书主窗口候选为：`ProcessName=Feishu`、`Title=飞书`、`ClassName=Chrome_WidgetWin_1`、`Visible=true`，但 `Left=-25600`、`Top=-25600`、`Width=159`、`Height=27`。
- 这表示飞书窗口处于离屏/最小化缩略状态，不是可操作主窗口；直接 `SetForegroundWindow` 无法得到正常飞书 UI。

第六轮修复：

- `src/operators/feishu-desktop-operator.ts` 的进程激活逻辑增加窗口尺寸/离屏评分：正常大窗口优先，`Left/Top < -10000` 或尺寸过小的候选大幅扣分。
- 增加可选 `CUA_FEISHU_EXE`。如果只找到离屏/无正常候选窗口，可 `Start-Process` 唤起飞书，再重新枚举窗口。
- `src/operators/operator.ts` 与 `src/operators/create-operator.ts` 增加 `focusExecutablePath` / `CUA_FEISHU_EXE` 配置。
- `.env.example` 增加 `CUA_FEISHU_EXE=<LOCAL_FEISHU_EXE_PATH>` 示例。
- 修复后 `npm.cmd run typecheck` 与 `npm.cmd test` 均通过。

第七轮结果：

- 第一次带 `CUA_FEISHU_EXE` 运行仍然安全 blocked。
- 第二次运行成功唤起飞书并完成真实桌面截图与点击执行，`tracePath=traces\phase2-im-search-observe-agent-1778068155510\steps.jsonl`。
- 证据截图 `traces\phase2-im-search-observe-agent-1778068155510\screenshots\001.png` 显示飞书窗口已在前台，证明聚焦/唤起链路阶段性可用。
- 但模型连续 5 步点击聊天列表区域坐标约 `(157,231)`、`(166,232)`、`(165,232)` 等，没有完成搜索入口定位或输入，最终 `status=blocked`。

阶段判断：

- Phase 2b 真实桌面“唤起 + 截图 + VLM 点击 + 执行 + trace”已验证。
- “让 VLM 自主稳定找到飞书搜索入口”当前不稳定，继续纯 prompt 调参成本较高。
- 后续建议收束为半自动校准路线：先用固定安全动作序列或人工标定搜索框坐标验证 `click -> type`，再逐步回到 VLM 自主定位。

## Phase 2c: Calibrated Action Validation

### 当前进展

| 项目 | 结果 | 证据 |
|---|---|---|
| 固定安全动作 TaskSpec | 完成 | `tasks/phase2-im-search-calibrated.json` 点击校准搜索框坐标、输入 `CUA测试群`、等待、finished，不发送消息 |
| 固定动作 safety guard | 完成 | `src/core/run-task.ts` 接入 `checkActionSafety`，固定 actions 也会写 `action.safety` 并在风险动作时阻断 |
| 失败 trace | 完成 | `src/core/run-task.ts` 现在聚焦/截图失败时也写 `steps.jsonl` 与 `result.json` |

### 验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec smoke test passed`、`parseVlmAction smoke test passed`、`action safety smoke test passed` |
| Codex 工具进程执行 `npm.cmd run run-task -- tasks/phase2-im-search-calibrated.json` | blocked | `tracePath=traces\phase2-im-search-calibrated-1778068934099\steps.jsonl`，原因：`Unable to activate Feishu window...` |
| 用户交互 PowerShell 执行 `npm.cmd run run-task -- tasks/phase2-im-search-calibrated.json` | 通过 | `status=passed`、`operator=feishu-desktop`、`tracePath=traces\phase2-im-search-calibrated-1778069181110\steps.jsonl` |

边界说明：

- 用户交互 PowerShell 已证明飞书可被唤起并截图；但 Codex 工具进程运行窗口枚举/激活时无法稳定访问同一交互桌面，诊断脚本在 Codex 工具进程中也枚举不到窗口。
- 因此真实桌面动作验证需要在用户的交互 PowerShell 会话中运行，或后续改造为一个由用户启动的本地 runner/service。
- 这不是 mock 验证替代真实验证；当前已新增 calibrated 任务与失败 trace，下一步应由交互 PowerShell 执行 calibrated 任务并回传输出/trace。

真实 calibrated 验收证据：

- `traces\phase2-im-search-calibrated-1778069181110\screenshots\002.png` 显示飞书搜索弹窗中已输入 `CUA测试群`，搜索结果区域出现 `CUA测试群(2)` 与相关搜索结果。
- `steps.jsonl` 包含 `action.safety`，4 步均 `allowed=true`。
- 执行动作为：click `(345,267)`、type `CUA测试群`、wait、finished。
- 没有发送消息，任务状态为 `passed`。

## Phase 2d: Calibrated Search Result Selection

### 当前进展

| 项目 | 结果 | 证据 |
|---|---|---|
| 搜索并打开结果 TaskSpec | 完成 | `tasks/phase2-im-open-result-calibrated.json` 基于已通过搜索坐标，增加 `ctrl+a`、重新输入 `CUA测试群`、点击第一个搜索结果、等待、finished |
| 安全边界 | 保持 | 不使用 Enter/Return，不发送消息，不删除；固定 actions 继续经过 `action.safety` |

### 验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec smoke test passed`、`parseVlmAction smoke test passed`、`action safety smoke test passed` |

### 用户交互 PowerShell 验证命令

```powershell
$env:CUA_OPERATOR="feishu-desktop"
$env:CUA_FEISHU_FOCUS_MODE="app-activate"
$env:CUA_FEISHU_WINDOW_TITLES="飞书,Feishu,Lark"
$env:CUA_FEISHU_PROCESS_NAMES="Feishu,Lark"
$env:CUA_FEISHU_CLASS_NAMES="Chrome_WidgetWin_1"
$env:CUA_FEISHU_EXE="<LOCAL_FEISHU_EXE_PATH>"
$env:CUA_POST_ACTION_DELAY_MS="500"
npm.cmd run run-task -- tasks/phase2-im-open-result-calibrated.json
```

预期：

- `status=passed`。
- 搜索结果被点击，进入 `CUA测试群` 或相关测试群会话。
- 没有发送消息。
- trace 中每步均有 `action.safety.allowed=true`。

真实验证结果：

- 用户两次运行 `tasks/phase2-im-open-result-calibrated.json` 均返回 `status=passed`。
- 第二次从较干净初始界面运行成功进入测试群界面，`tracePath=traces\phase2-im-open-result-calibrated-1778069998889\steps.jsonl`。
- 最终截图 `traces\phase2-im-open-result-calibrated-1778069998889\screenshots\007.png` 显示进入 `CUA测试群` 会话页面，未发送消息。

## Phase 2e: Calibrated Actions + VLM Screenshot Evaluator

### 当前进展

| 项目 | 结果 | 证据 |
|---|---|---|
| VLM 截图 evaluator | 完成 | `src/evaluators/vlm-screenshot-evaluator.ts` 只判断最终截图是否达成结果，不输出动作 |
| run-task evaluator 接入 | 完成 | `src/core/run-task.ts` 在固定 actions 后调用 `vlm_screenshot` evaluator，并写入 `evaluator.vlm_screenshot` 事件 |
| CLI VLM 接入 | 完成 | `src/cli/run-task.ts` 在 TaskSpec evaluator 为 `vlm_screenshot` 时创建 VLM provider |
| VLM evaluator TaskSpec | 完成 | `tasks/phase2-im-open-result-vlm-eval.json` 使用已校准动作进入测试群，然后由 VLM 判断是否通过 |

### 验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec smoke test passed`、`parseVlmAction smoke test passed`、`action safety smoke test passed` |

### 用户交互 PowerShell 验证命令

该任务需要同时具备 VLM 环境变量和真实桌面控制环境：

```powershell
$env:CUA_OPERATOR="feishu-desktop"
$env:CUA_FEISHU_FOCUS_MODE="app-activate"
$env:CUA_FEISHU_WINDOW_TITLES="飞书,Feishu,Lark"
$env:CUA_FEISHU_PROCESS_NAMES="Feishu,Lark"
$env:CUA_FEISHU_CLASS_NAMES="Chrome_WidgetWin_1"
$env:CUA_FEISHU_EXE="<LOCAL_FEISHU_EXE_PATH>"
$env:CUA_POST_ACTION_DELAY_MS="500"
npm.cmd run run-task -- tasks/phase2-im-open-result-vlm-eval.json
```

预期：

- 固定 actions 进入 `CUA测试群`。
- trace 包含 `evaluator.vlm_screenshot`。
- VLM evaluator 输出 JSON，`status=passed` 时最终任务为 `passed`。

真实验证结果：

- 用户第一次运行因初始状态已在目标群导致聚焦/状态不符合预期而 blocked。
- 用户回到初始界面后第二次运行通过：`status=passed`、`tracePath=traces\phase2-im-open-result-vlm-eval-1778070654185\steps.jsonl`。
- `steps.jsonl` 包含 `evaluator.vlm_screenshot`，VLM 输出：`{"status":"passed","reason":"已进入CUA测试群会话页面，且没有发送新消息"}`。
- evaluator 指标：`latencyMs=5516`，`promptTokens=1511`，`completionTokens=102`，`totalTokens=1613`。
- 最终截图 `traces\phase2-im-open-result-vlm-eval-1778070654185\screenshots\007.png` 显示进入 `CUA测试群` 会话页面，输入框为空，未发送消息。

Phase 2 收口结论：

- 已完成真实桌面 calibrated 操作 + VLM 视觉验收 + trace 的闭环。
- 已验证 IM 子产品的安全搜索与进入会话能力。
- 当前尚未执行真实发送消息，也尚未覆盖 Calendar；下一阶段应进入 Phase 3 evaluator/report 或 Calendar calibrated 用例，而不是继续扩大自由点击范围。

用户交互 PowerShell 验证命令：

```powershell
$env:CUA_OPERATOR="feishu-desktop"
$env:CUA_FEISHU_FOCUS_MODE="app-activate"
$env:CUA_FEISHU_WINDOW_TITLES="飞书,Feishu,Lark"
$env:CUA_FEISHU_PROCESS_NAMES="Feishu,Lark"
$env:CUA_FEISHU_CLASS_NAMES="Chrome_WidgetWin_1"
$env:CUA_FEISHU_EXE="<LOCAL_FEISHU_EXE_PATH>"
$env:CUA_POST_ACTION_DELAY_MS="500"
npm.cmd run run-task -- tasks/phase2-im-search-calibrated.json
```

诊断命令：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\win-focus-diagnostics.ps1
```

如果输出太长，可过滤：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\win-focus-diagnostics.ps1 | Select-String -Pattern "Feishu|Lark|飞书|Chrome_WidgetWin|ApplicationFrame"
```

新的推荐命令：

```powershell
$env:CUA_OPERATOR="feishu-desktop"
$env:CUA_FEISHU_FOCUS_MODE="app-activate"
$env:CUA_FEISHU_WINDOW_TITLES="飞书,Feishu,Lark"
$env:CUA_FEISHU_PROCESS_NAMES="Feishu,Lark"
$env:CUA_AGENT_MAX_STEPS="5"
$env:CUA_AGENT_ALLOWED_ACTIONS="wait,click,type,hotkey,finished"
npm.cmd run agent-loop -- tasks/phase2-im-search-observe.json
```

如果 app activation 报错，再人工确认飞书窗口标题，追加到 `CUA_FEISHU_WINDOW_TITLES`；只有在窗口标题激活不可用时，才考虑 `CUA_FEISHU_FOCUS_MODE=taskbar` 并重新校准 `CUA_FEISHU_FOCUS_BOX`。

## 后续 Thread 最小继续开发 Prompt - Phase 2 收口版

> 维护规则：每个新 thread 开始时先读 `AGENTS.md`、`PROJECT_ROADBOOK.md`、`DEV_NOTES.md`，再执行当前 Phase；每个 Phase 验收后更新本栏和对应证据记录。

你正在继续开发 `E:\demo\CUA-Lark`。项目是 CUA-Lark：面向飞书/Lark 桌面端的 Computer-Use Agent GUI 测试框架。请遵守 `AGENTS.md` 工作规则：先读代码和文档，最小改动，修改后先做最小验证，证据写入 `DEV_NOTES.md`，项目文件和生成物尽量落在工作区内，不写真实 API key、cookie、token 或敏感截图。

当前 Phase 0/1/2 已收口：

- Phase 0 桌面可行性 Spike：NutJS 截图、点击、搜索、中文输入、英文草稿输入均验证可用。关键约束是 Windows 缩放 `scaleFactor=1.25`，真实桌面动作必须在同一进程连续执行，动作前/后截图必须保存为证据。任务栏坐标聚焦曾可用，但后续证明任务栏图标位置会漂移，不应作为默认聚焦策略。
- Phase 1 最小工程骨架：TypeScript 工程、TaskSpec、mock operator、`run-task` CLI、JSONL trace、`im-send-text-001` 任务契约已完成；`npm.cmd run typecheck`、`npm.cmd test`、`npm.cmd run run-task -- tasks/im-send-text-001.mock.json` 均通过。
- Phase 2 Operator/VLM/Agent Loop：`FeishuDesktopOperator`、OpenAI-compatible VLM provider、VLM action parser、observe-only agent loop、action safety guard、VLM screenshot evaluator 均已落地。
- Phase 2 真实 IM calibrated 验收通过：`tasks/phase2-im-search-calibrated.json` 能在飞书桌面端点击搜索框、输入 `CUA测试群`、等待并 finished，`status=passed`，证据为 `traces\phase2-im-search-calibrated-1778069181110\steps.jsonl` 和 `screenshots\002.png`。
- Phase 2 搜索结果选择通过：`tasks/phase2-im-open-result-calibrated.json` 能搜索并点击结果进入 `CUA测试群` 会话，不发送消息，证据为 `traces\phase2-im-open-result-calibrated-1778069998889\steps.jsonl` 和 `screenshots\007.png`。
- Phase 2 calibrated actions + VLM screenshot evaluator 通过：`tasks/phase2-im-open-result-vlm-eval.json` 先用固定安全动作进入 `CUA测试群`，再由 VLM 仅判断最终截图是否达成结果。通过证据为 `traces\phase2-im-open-result-vlm-eval-1778070654185\steps.jsonl`，其中 `evaluator.vlm_screenshot` 输出 `{"status":"passed","reason":"已进入CUA测试群会话页面，且没有发送新消息"}`；最终截图 `screenshots\007.png` 显示进入目标群且输入框为空。

当前有效能力：

- `src/operators/feishu-desktop-operator.ts`：封装 `@ui-tars/operator-nut-js`，支持截图、click/type/hotkey/scroll/wait/finished，支持通过窗口标题、进程名、类名、可选 exe 唤起飞书。
- `src/core/action-safety.ts`：阻断无坐标 click、换行输入、危险热键 Enter/Delete/Backspace、删除/邀请/发送等敏感内容；固定 actions 和 agent loop 都会经过安全检查。
- `src/core/run-task.ts`：执行固定 actions，保存 `task.json`、`steps.jsonl`、`result.json`、`screenshots/*.png`；失败也会写 `run.error` trace；支持 `vlm_screenshot` evaluator。
- `src/core/agent-loop.ts`：支持 `screenshot -> VLM -> parse action -> execute -> observe -> trace`，但自由点击不稳定；当前不建议继续扩大自由点击范围。
- `src/models/*`：OpenAI-compatible VLM provider，已通过火山方舟 EP-ID 文本和图片 smoke。真实 key 不在仓库，必须从环境变量读取。
- `src/evaluators/vlm-screenshot-evaluator.ts`：VLM 只看最终截图判断 passed/failed，不输出动作。
- `tools/win-focus-diagnostics.ps1`：窗口聚焦诊断脚本，输出一行一个 compact JSON；用于排查 Feishu/Lark 窗口标题、类名、坐标和可见状态。

重要限制和经验：

- Codex 工具进程对 Windows 交互桌面的窗口枚举/激活不稳定；真实 GUI 控制最终验证更可靠的方式是在用户交互 PowerShell 会话中运行。用户 PowerShell 能枚举和控制飞书窗口，而 Codex 工具进程可能无法激活飞书。
- 真实 VLM key 不要写入 `.env.example`、`DEV_NOTES.md`、trace 或代码。最轻量安全传递方式是设置 Windows 用户级环境变量并重启 Codex 会话/应用，让新工具进程继承 `VLM_BASE_URL`、`VLM_MODEL`、`VLM_PROVIDER_NAME`、`VLM_API_KEY`。
- 当前不要继续投入大量时间让 VLM 自由点击寻找飞书搜索入口。已证明 calibrated actions + VLM screenshot evaluator 更稳定，适合进入下一阶段。
- 已经可以声明 Phase 2 完成到“真实桌面 calibrated 操作 + VLM 视觉验收 + trace”的闭环；尚未执行真实发送消息，尚未覆盖 Calendar，尚未生成正式 report。

推荐下一步进入 Phase 3：Evaluator + Report。

优先任务：

1. 实现最小 Markdown report generator：读取某个 `traces/<run-id>/steps.jsonl` 和 `result.json`，生成 `report.md`，包含 task id、status、operator、duration、步骤数、动作列表、截图路径、VLM evaluator 结果、token/latency、失败原因。
2. 使用 `traces\phase2-im-open-result-vlm-eval-1778070654185` 作为第一条报告样例输入，生成报告并记录证据。
3. 保持安全边界：不要做真实发送消息；不要扩大自由点击；不要做大前端 Dashboard。
4. 下一条功能可选：Calendar calibrated 用例，作为第二个子产品覆盖；或先完善 IM report/evaluator 再扩 Calendar。

常用验证命令：

```powershell
npm.cmd run typecheck
npm.cmd test
```

真实桌面 calibrated + VLM evaluator 验证命令，需在用户交互 PowerShell 中运行，并确保 VLM 环境变量已设置：

```powershell
$env:CUA_OPERATOR="feishu-desktop"
$env:CUA_FEISHU_FOCUS_MODE="app-activate"
$env:CUA_FEISHU_WINDOW_TITLES="飞书,Feishu,Lark"
$env:CUA_FEISHU_PROCESS_NAMES="Feishu,Lark"
$env:CUA_FEISHU_CLASS_NAMES="Chrome_WidgetWin_1"
$env:CUA_FEISHU_EXE="<LOCAL_FEISHU_EXE_PATH>"
$env:CUA_POST_ACTION_DELAY_MS="500"
npm.cmd run run-task -- tasks/phase2-im-open-result-vlm-eval.json
```

Phase 2 正式收口结论：

- 可以从 Phase 2 转入 Phase 3。
- 当前可展示 demo 是 IM 子产品：搜索 `CUA测试群`、进入会话、不发送消息、VLM 判断截图通过、trace 可复盘。
- 后续不要宣称 fully autonomous；应表述为 calibrated desktop actions + VLM visual evaluator 的安全闭环。
## Phase 3: Evaluator + Markdown Report 最小接入

### 目标与路线

- 官方事实：路书 Phase 3 要从“能操作”升级到“能验证”，报告需要包含成功率、耗时、步骤数、失败原因等指标。
- 综合归纳：当前 Phase 2 已有 `vlm_screenshot` evaluator 和真实 IM trace，因此 Phase 3 最小可执行路线先实现 Markdown report generator，不扩大真实 GUI 动作范围。
- 不确定或推测：Feishu API evaluator 尚未接入，Calendar evaluator 尚未覆盖；当前报告样例先复用 VLM screenshot evaluator 结果。

### 当前进展

| 项目 | 结果 | 证据 |
|---|---|---|
| Markdown report generator | 完成 | `src/reports/markdown-report.ts` 读取 `steps.jsonl` 和 `result.json`，生成 `report.md` |
| report CLI | 完成 | `src/cli/generate-report.ts` 支持 `npm.cmd run report -- <run-dir|steps.jsonl> [report.md]` |
| npm 脚本 | 完成 | `package.json` 新增 `report`，`test` 增加 markdown report smoke test |
| 报告单测 | 完成 | `tests/markdown-report.test.ts` 使用临时 run 目录验证 Summary、动作、token usage 等内容 |
| Phase 2 样例报告 | 完成 | `traces\phase2-im-open-result-vlm-eval-1778070654185\report.md` |

### 验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec`、`parseVlmAction`、`action safety`、`markdown report` smoke tests 均通过 |
| `npm.cmd run report -- traces\phase2-im-open-result-vlm-eval-1778070654185` | 通过 | 输出 `reportPath=E:\demo\CUA-Lark\traces\phase2-im-open-result-vlm-eval-1778070654185\report.md` |

### 报告内容覆盖

- Summary：`status`、`success rate`、`operator`、`target product`、`duration`、`steps`、`failure reason`。
- Task：标题、自然语言指令、初始状态、期望结果、evaluator 类型。
- Actions：每步 action、执行状态、latency、对应截图路径。
- Evaluator：`vlm_screenshot` 的 passed、reason、latency、token usage。
- Screenshots：每个截图路径、分辨率、scaleFactor。
- Observations：`result.json` 中的执行观察记录。

### 当前限制

- 目前是单 run 报告，不是批量汇总报告；多任务成功率聚合后续再做。
- 当前 evaluator 仍以 VLM screenshot 半自动验证为主，Feishu API evaluator 尚未接入。
- 真实 GUI 控制仍建议在用户交互 PowerShell 中运行；本轮没有执行新的真实桌面动作，也没有发送真实消息。

### 下一步

1. 将 `run-task` 可选地在任务结束后自动生成 `report.md`，或保持显式 `npm.cmd run report` 命令。
2. 新增 Calendar calibrated observe / open 用例，形成第二个子产品的最小 trace。
3. 在 IM 和 Calendar 各至少一条任务上稳定产出 `trace + evaluator + report`。

## Phase 3: Report Summary 与失败样本补录

### 目标与依据

- 官方事实：路书要求 Phase 3 报告包含成功率、耗时、步骤数、失败原因；因此不能只记录最终验收成功样本。
- 综合归纳：Phase 2 真实开发中存在多次 `blocked`，这些失败是解释为什么从 VLM 自由点击收束到 calibrated actions 的关键依据。
- 不确定或推测：部分早期 blocked run 只保留 `run.result`，没有完整 `run.error`，只能按 actions 数、observations 和状态做保守分类。

### 当前进展

| 项目 | 结果 | 证据 |
|---|---|---|
| report-summary 模块 | 完成 | `src/reports/report-summary.ts` 扫描 run 目录，读取 `result.json` 与 `steps.jsonl` |
| report-summary CLI | 完成 | `src/cli/generate-report-summary.ts` 支持 `npm.cmd run report-summary -- <traces-dir|run-dir> [summary.md]` |
| 汇总测试 | 完成 | `tests/report-summary.test.ts` 覆盖 passed + environment focus blocked 的统计 |
| npm 脚本 | 完成 | `package.json` 新增 `report-summary`，`npm.cmd test` 纳入 summary smoke test |
| Phase 3 汇总报告 | 完成 | `reports\phase3-summary.md` |

### 汇总报告验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec`、`parseVlmAction`、`action safety`、`markdown report`、`report summary` smoke tests 均通过 |
| `npm.cmd run report-summary -- traces reports\phase3-summary.md` | 通过 | 输出 `reportSummaryPath=E:\demo\CUA-Lark\reports\phase3-summary.md`，共扫描 19 个 run |

### 当前 traces 汇总指标

| 指标 | 值 |
|---|---:|
| 总 run 数 | 19 |
| passed | 6 |
| failed | 0 |
| blocked | 13 |
| 成功率 | 31.6% |
| 平均步骤数 | 3.1 |
| 平均耗时 | 31.09s |

失败/阻断分类：

| 分类 | 数量 | 含义 |
|---|---:|---|
| `environment_focus` | 2 | 无法激活/唤起飞书窗口，属于环境与交互桌面问题 |
| `max_steps_no_progress` | 3 | mock 或 observe-only 连续 wait/skipped，达到步数上限 |
| `max_steps_or_unfinished` | 4 | 执行了真实或 VLM 动作，但没有到达 finished/passed |
| `blocked_without_actions` | 4 | run 在动作前停止，早期 trace 未记录更细原因 |

### Phase 2 代表性失败样本

| 样本 | 状态 | 分类 | 证据 | 结论 |
|---|---|---|---|---|
| `phase2-im-search-calibrated-1778068934099` | blocked | `environment_focus` | `traces\phase2-im-search-calibrated-1778068934099\steps.jsonl`，`run.error=Unable to activate Feishu window...` | Codex 工具进程无法稳定激活飞书窗口，真实 GUI 验证需优先在用户交互 PowerShell 中运行 |
| `phase2-im-open-result-vlm-eval-1778070602511` | blocked | `environment_focus` | `traces\phase2-im-open-result-vlm-eval-1778070602511\steps.jsonl`，同样为窗口激活失败 | 即使 calibrated + evaluator 任务本身可用，初始窗口环境不满足时也会被安全阻断 |
| `phase2-im-search-observe-agent-1778058007240` | blocked | `max_steps_no_progress` | `traces\phase2-im-search-observe-agent-1778058007240\steps.jsonl`，5 步均为 `wait`，mock operator 返回 skipped | mock operator 只能验证 VLM/trace/safety 管线，不能证明真实 IM 搜索动作成功 |
| `phase2-im-search-observe-agent-1778058565347` | blocked | `max_steps_or_unfinished` | `traces\phase2-im-search-observe-agent-1778058565347\steps.jsonl`，VLM 执行 click/type/click/type 但最终未 finished | VLM 自由点击寻找飞书搜索入口不稳定，支撑后续转向 calibrated actions |
| `phase2-im-search-observe-agent-1778068155510` | blocked | `max_steps_or_unfinished` | `traces\phase2-im-search-observe-agent-1778068155510\steps.jsonl`，已唤起飞书并执行 5 步点击，但未完成搜索入口定位 | 飞书窗口聚焦/截图链路可用，但自由定位任务不稳定 |

### 阶段结论

- 当前不能只用 `phase2-im-open-result-vlm-eval-1778070654185` 的 passed 报告代表整体能力。
- 以全部 19 个本地 run 统计，当前成功率为 31.6%；这更真实地反映 Phase 2 探索阶段的失败成本。
- 稳定路线仍是 calibrated desktop actions + VLM screenshot evaluator + trace/report，而不是继续扩大 VLM 自由点击范围。
- 下一步可在该 summary 基础上补 Calendar calibrated observe/open 用例，形成第二个子产品的 trace + evaluator + report。

## Phase 3: lark-cli API Evaluator 基座与 IM Message Check

### 路线调整

- 官方事实：后续 API evaluator 优先采用官方 `lark-cli -> 飞书 OAPI` 路径，贴合 AI Agent 使用官方 CLI 的推荐方式。
- 概念边界：API evaluator 只验证 GUI 操作后的业务结果，不用 API 替代 GUI 发送消息或创建日程。
- 综合归纳：第一版不硬编码未经 `lark-cli schema` 确认的具体 IM endpoint；TaskSpec 通过 `larkCliArgs` 提供只读查询命令，项目负责执行、轮询、解析 JSON/文本并匹配期望消息。
- 不确定或推测：飞书 OAPI 覆盖范围、具体 IM 消息查询 endpoint、bot/user 身份权限和 scope 需要本地授权后用 `lark-cli schema` / `auth scopes` 继续确认。

### 当前进展

| 项目 | 结果 | 证据 |
|---|---|---|
| 路书更新 | 完成 | `PROJECT_ROADBOOK.md` 新增“API evaluator 优先通过 lark-cli”路线调整 |
| lark-cli client | 完成 | `src/evaluators/lark-cli-client.ts` 封装 CLI 调用、JSON 解析、timeout、exit code/stderr |
| IM message evaluator | 完成 | `src/evaluators/im-message-evaluator.ts` 执行 `larkCliArgs --format json`，轮询并递归匹配 `expectedText` |
| run-task 接入 | 完成 | `src/core/run-task.ts` 支持 `feishu_im_message_check` 并写入 `evaluator.feishu_im_message_check` trace 事件 |
| TaskSpec 类型扩展 | 完成 | `src/core/task-spec.ts` 新增 `feishu_im_message_check` evaluator 类型 |
| lark-cli smoke CLI | 完成 | `src/cli/lark-cli-smoke.ts` 执行 `lark-cli auth status --format json` |
| 环境变量示例 | 完成 | `.env.example` 新增 `LARK_CLI_BIN`、`CUA_EVALUATOR_TIMEOUT_MS` |
| 示例任务 | 完成 | `tasks/im-message-api-eval.example.json` 展示 read-only IM API evaluator 配置方式 |
| 单测 | 完成 | `tests/im-message-evaluator.test.ts` 使用 fake lark-cli client 验证 passed/failed 判断 |

### 当前限制

- 已将官方 `@larksuite/cli@1.0.24` 安装到项目本地 devDependency；首次普通安装触发 npm/native script `spawn EPERM`，按项目既有环境策略改用 `--ignore-scripts`。
- 官方包 postinstall 需要下载 `lark-cli.exe`。内置脚本调用 `curl` 被 `spawnSync curl EPERM` 阻断；改用 Node HTTPS 从 npmmirror 下载 `lark-cli-1.0.24-windows-amd64.zip`，并用官方 `checksums.txt` 校验 SHA256。
- SHA256 校验通过：`66a8f64d89f884c97ed9673589aedd5994f98a8b2330e9fd4cd64fccec4db512`；已解压并复制到 `node_modules\@larksuite\cli\bin\lark-cli.exe`。
- `node_modules\@larksuite\cli\bin\lark-cli.exe --version` 返回 `lark-cli version 1.0.24`。
- `node_modules\@larksuite\cli\bin\lark-cli.exe auth status` 当前返回 `not configured`，提示需要运行 `lark-cli config init --new` 完成配置。
- `lark-cli config init --new` 已能输出二维码和授权 URL，但浏览器授权必须由账号持有人完成；当前自动 `Start-Process` 打开 URL 被策略阻断。
- Codex/Node 工具进程中 `child_process.spawn` 启动 `lark-cli.exe` 或 `powershell.exe` 均返回 `spawn EPERM`；PowerShell 直接运行 `lark-cli.exe` 正常。因此真实 lark-cli evaluator 运行更适合用户交互 PowerShell 或后续本地 runner。
- `tasks/im-message-api-eval.example.json` 是配置示例，不代表 endpoint 已经本地确认；真实命令需要先用 `lark-cli schema` 或官方文档确认。
- 当前 IM evaluator 第一版只做 read-only 查询输出中的文本匹配；后续要增强 messageId、chatId、createdAt、sinceRunStart 等结构化断言。
- 真实 IM GUI send + API verify 尚未完成；但测试群就是用于发送无敏感测试消息，后续应在白名单测试群、唯一 runId 文本、idempotency-key 和 forbidDelete 约束下执行。

### 验证结果

| 命令 | 结果 | 输出摘要 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | `tsc --noEmit` 成功 |
| `npm.cmd test` | 通过 | `loadTaskSpec`、`parseVlmAction`、`action safety`、`markdown report`、`report summary`、`IM message evaluator` smoke tests 均通过 |

## Phase 3 Gap Audit Follow-up: Calendar Evaluator 基座与交付清单补齐

### 认知框架

- 官方事实：`PROJECT_ROADBOOK.md` Section 6.1/14 要求复赛 v0.1 覆盖至少 IM + Calendar 两个子产品、至少 6 条 TaskSpec、至少 4 条有自动或半自动 evaluator，并能产出 trace/report。
- 社区经验：GUI Agent 在真实桌面端常需要先用安全校准动作稳定入口，再逐步扩大 VLM 自主决策范围；答辩时必须把 calibrated actions 与 fully autonomous 区分清楚。
- 综合归纳：当前最短补齐路线不是继续扩大基础设施，而是补 Calendar evaluator 入口、正式 TaskSpec 清单、README，并明确哪些是已验证、哪些只是待跑契约。
- 不确定或推测：Calendar GUI 创建日程坐标、真实 lark-cli 日历 endpoint 参数、测试租户权限仍未在本机真实验证。

### 本次补齐

| 项目 | 状态 | 证据 |
|---|---|---|
| Calendar evaluator 类型 | 完成 | `src/core/task-spec.ts` 新增 `feishu_calendar_event_check` |
| Calendar evaluator 实现 | 完成 | `src/evaluators/calendar-event-evaluator.ts` 通过 lark-cli 输出匹配标题、时间、参与人 |
| run-task 接入 | 完成 | `src/core/run-task.ts`、`src/cli/run-task.ts` 可分派 Calendar API evaluator |
| report 接入 | 完成 | `src/reports/markdown-report.ts`、`src/reports/report-summary.ts` 支持 Calendar evaluator 事件 |
| Calendar TaskSpec | 完成基座 | `tasks/calendar-open-001.json`、`tasks/calendar-create-event-001.json`、`tasks/calendar-api-eval.example.json` |
| 正式 IM TaskSpec 整理 | 完成基座 | `tasks/im-open-chat-001.json`、`tasks/im-send-text-001.json` |
| README | 完成最小交付版 | `README.md` 说明目标、架构、用法、任务清单、限制和 Demo 范围 |

### 限制

- 这次只补齐 Calendar evaluator 和 TaskSpec 入口，没有声称 Calendar 真实桌面 trace 已跑通。
- `calendar-create-event-001` 的 GUI actions 仍是待校准占位，真实创建日程前必须先确认测试日历和安全坐标。
- `lark-cli` 在项目 `node_modules/.bin` 中存在，但全局 `where.exe lark-cli` 仍不可用；真实 API evaluator 需要设置 `LARK_CLI_BIN` 或使用 npm script 验证授权。

### 验证记录

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | TypeScript 类型检查通过 |
| `npm.cmd test` | 通过 | 新增 Calendar event evaluator smoke test 纳入完整测试链 |
| `where.exe lark-cli` | 未找到 | 全局 PATH 不含 lark-cli |
| `Get-ChildItem node_modules\\.bin -Filter "lark-cli*"` | 找到 | 本地依赖包含 `lark-cli`、`lark-cli.cmd`、`lark-cli.ps1` |
| `node_modules\\.bin\\lark-cli.cmd auth status` | 通过 | 命令可用；输出显示 bot tenant identity 可用，未登录 user identity |
| `npm.cmd run lark-cli-smoke` with `LARK_CLI_BIN=.\\node_modules\\.bin\\lark-cli.cmd` | 失败 | 当前 Codex sandbox 中 Node child_process spawn 返回 `EPERM`，不是 lark-cli 命令本身缺失 |
| `npm.cmd run run-task -- tasks/im-send-text-001.mock.json` | 通过 | 生成 mock trace：`traces\\im-send-text-001-1778087041071\\steps.jsonl` |
| `npm.cmd run report -- traces\\im-send-text-001-1778087041071` | 通过 | 生成报告：`traces\\im-send-text-001-1778087041071\\report.md` |

## Phase 3 Calendar Minimal Cases: CAL-001 / CAL-002

### 本次目标

- 官方事实：路书要求至少覆盖 IM + Calendar 两个子产品，Calendar 至少需要可演示的最小用例。
- 综合归纳：当前先采用 calibrated actions 路线补齐 Calendar trace，不扩展复杂 Agent 架构。
- 不确定或推测：当前桌面会话阻止 PowerShell/.NET 和 NutJS 捕获真实屏幕，因此本次 trace 的截图为显式 placeholder，不能作为视觉验收证据。

### 代码与任务

| 项目 | 状态 | 证据 |
|---|---|---|
| CAL-001 TaskSpec | 完成 | `tasks/calendar-open-001.json` |
| CAL-002 TaskSpec | 完成 | `tasks/calendar-create-event-001.json` |
| Calendar calibrated runner | 完成 | `tools/run-calendar-calibrated.ps1` |
| 轻量 Windows operator 后端 | 完成 | `src/operators/feishu-desktop-operator.ts` 增加 PowerShell 截图/动作路径，但当前 Node child_process 在 sandbox 中仍会 `spawn EPERM` |

### Trace 与报告

| 用例 | Trace | Report | 状态说明 |
|---|---|---|---|
| CAL-001 open Calendar | `traces\\calendar-open-001-1778088363055\\steps.jsonl` | `traces\\calendar-open-001-1778088363055\\report.md` | calibrated action sequence completed; screenshot capture blocked, placeholder screenshot recorded |
| CAL-002 create Calendar event | `traces\\calendar-create-event-001-1778088379654\\steps.jsonl` | `traces\\calendar-create-event-001-1778088379654\\report.md` | calibrated action sequence completed; screenshot capture blocked, placeholder screenshot recorded |

### 验证记录

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | 轻量 operator 后端与 TaskSpec 类型通过 |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\\run-calendar-calibrated.ps1 -TaskId calendar-open-001` | 通过 | 生成 CAL-001 trace |
| `powershell.exe -NoProfile -ExecutionPolicy Bypass -File tools\\run-calendar-calibrated.ps1 -TaskId calendar-create-event-001` | 通过 | 生成 CAL-002 trace |
| `npm.cmd run report -- traces\\calendar-open-001-1778088363055` | 通过 | 生成 CAL-001 report |
| `npm.cmd run report -- traces\\calendar-create-event-001-1778088379654` | 通过 | 生成 CAL-002 report |
| `npm.cmd test` | 通过 | 全量 smoke tests 通过 |
| `npm.cmd run report-summary -- traces` | 通过 | 生成 `traces\\report-summary.md`，统计 24 个 run |

### 限制

- 本次不能声称 Calendar 视觉验收已通过；截图捕获在当前会话被阻止，trace 中的 PNG 明确写明 placeholder。
- CAL-002 的创建日程动作还需要在可截图/可人工观察的桌面会话中确认坐标是否落在正确的 Calendar 创建入口。
- 下一步应在真实可交互桌面会话重跑这两个 TaskSpec，替换 placeholder 截图，并把 CAL-002 接入 `feishu_calendar_event_check`。

### 更正记录

- 官方事实：`MYSELF.md` 中已有私有 VLM 环境变量配置；不得把真实 key 写入 `.env`、`DEV_NOTES.md`、trace 或提交内容。
- 实测事实：按 `MYSELF.md` 解析环境变量后，`npm.cmd run vlm-smoke` 通过，provider=`volcengine-ark`，model=`<VLM_ENDPOINT_ID_REDACTED>`，文本返回 `OK`，图片动作返回 `{"type":"wait","waitMs":500}`。
- 实测事实：使用历史真实 Feishu 截图 `traces\\phase2-im-open-result-vlm-eval-1778070654185\\screenshots\\007.png` 调用 `vlm_screenshot` evaluator 通过，返回 `passed`，latencyMs=8684，totalTokens=1693。
- 实测事实：当前 Codex 工具进程里 NutJS 截图返回 `Failed to capture screen`，PowerShell `CopyFromScreen` 返回 `The handle is invalid`，`ffmpeg gdigrab` 返回 `error 5 / Access denied`。
- 综合归纳：这说明当前失败是工具进程的桌面捕获权限/会话上下文问题，不是项目没有截图能力，也不是 VLM 未配置。
- 更正：placeholder Calendar traces 不能计入 Calendar 验收证据；后续必须在可真实截图的桌面会话中重跑 CAL-001/CAL-002。

## Phase 3 Calendar Real VLM Acceptance: CAL-001 / CAL-002

### 本次目标

- 官方事实：Calendar 至少需要真实截图 trace，并通过自动或半自动 evaluator 验收，才能算进入复赛交付证据。
- 社区经验：桌面 GUI 坐标校准必须以最终截图和 evaluator 结果为准，不能只看 NutJS 动作日志。
- 综合归纳：CAL-001 可用左侧导航“日历”入口坐标；CAL-002 使用周视图空白时间格双击创建，再输入短标题并点击保存，VLM 可稳定从网格事件块验证。
- 不确定或推测：当前 CAL-002 仍是当前窗口尺寸、周视图、日期范围下的 calibrated path；跨日期、跨布局或不同缩放下仍需重校准。

### 真实验证记录

| 命令 | 结果 | 说明 |
|---|---|---|
| `node tools\\phase0-nutjs-smoke.cjs screenshot --save` | 通过 | 真实 NutJS 截图成功，`screenshot=2048x1152`，`scaleFactor=1.25`，保存到 `artifacts\\phase0\\screenshot-before-2026-05-06T18-03-39-209Z.png` |
| `npm.cmd run vlm-smoke` with env loaded from private `MYSELF.md` | 通过 | provider=`volcengine-ark`，model=`<VLM_ENDPOINT_ID_REDACTED>`，文本返回 `OK`，图片动作返回 `{"type":"wait","waitMs":500}` |
| `npm.cmd run run-task -- tasks/calendar-open-001.json` | 通过 | `tracePath=traces\\calendar-open-001-1778090755068\\steps.jsonl` |
| `npm.cmd run run-task -- tasks/calendar-create-event-001.json` | 通过 | `tracePath=traces\\calendar-create-event-001-1778091415668\\steps.jsonl` |
| `npm.cmd run report -- traces\\calendar-open-001-1778090755068` | 通过 | 输出 `traces\\calendar-open-001-1778090755068\\report.md` |
| `npm.cmd run report -- traces\\calendar-create-event-001-1778091415668` | 通过 | 输出 `traces\\calendar-create-event-001-1778091415668\\report.md` |
| `npm.cmd test` | 通过 | 全量 smoke tests 通过 |
| `npm.cmd run report-summary -- traces` | 通过 | 输出 `traces\\report-summary.md`，统计 28 个 run |

### CAL-001 证据

- TaskSpec：`tasks/calendar-open-001.json`
- 动作：点击左侧导航 `日历`，坐标 `(292, 635)`，等待，finished。
- Trace：`traces\\calendar-open-001-1778090755068\\steps.jsonl`
- 最终截图：`traces\\calendar-open-001-1778090755068\\screenshots\\003.png`
- VLM evaluator：`passed=true`，reason 为截图显示飞书日历页面，处于日历视图，无事件创建、编辑或删除操作。

### CAL-002 证据

- TaskSpec：`tasks/calendar-create-event-001.json`
- 动作：点击左侧导航 `日历` -> 双击周视图空白时间格 `(1245, 594)` -> 输入标题 `CUA Smoke` -> 点击保存 `(1157, 875)` -> 等待 -> finished。
- Trace：`traces\\calendar-create-event-001-1778091415668\\steps.jsonl`
- 最终截图：`traces\\calendar-create-event-001-1778091415668\\screenshots\\009.png`
- VLM evaluator：`passed=true`，reason 为日历网格中已显示 `CUA Smoke` 相关的已保存事件，未修改现有真实事件。

### 结论

- CAL-001 已完成真实 Calendar 打开用例验收。
- CAL-002 已完成当前桌面布局下的 Calendar 创建日程 calibrated path，并通过真实截图 + VLM evaluator 验收。
- 这仍不是通用 Calendar 创建能力；它是一个可演示、可复盘、坐标校准后的最小业务用例。后续要提升可信度，应接入 `feishu_calendar_event_check` API evaluator 或增加点击事件详情页截图确认完整标题。

## Phase 3 IM Real Send: Natural-language TaskSpec + Group Send

### 本次目标

- 官方事实：项目说明要求能够理解自然语言测试指令并拆解为可执行操作；IM 端到端发送必须有真实 GUI 操作、trace 和 evaluator。
- 社区经验：真实发送消息需要比搜索/打开会话更严格的安全阀，必须把目标对象、允许消息文本和发送热键写入可审计契约。
- 综合归纳：优先补 `CUA测试群` 真实发送闭环；外部个人联系人 `CUA测试联系人A` 虽已生成 TaskSpec，但按安全规则需确认其为专用测试联系人后再执行。

### 代码与任务

| 项目 | 状态 | 证据 |
|---|---|---|
| IM 发送安全阀 | 完成 | `src/core/task-spec.ts` 新增 `allowedMessageTexts`、`allowSend`；`src/core/action-safety.ts` 仅在显式授权发送任务中允许 Enter/Return |
| 安全测试 | 完成 | `tests/action-safety.test.ts` 覆盖 search-only 阻断 Enter、send task 允许指定消息和 Enter |
| 群组自然语言 TaskSpec | 完成并执行 | `tasks/im-send-group-hello-world-001.json` |
| 外部联系人自然语言 TaskSpec | 完成未执行 | `tasks/im-send-contact-hello-world-001.json`，等待确认 `CUA测试联系人A` 是专用测试联系人 |

### 真实验证记录

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm.cmd run typecheck` | 通过 | TaskSpec 类型与安全规则通过 |
| `npm.cmd test` | 通过 | 全量 smoke tests 通过 |
| `npm.cmd run run-task -- tasks/im-send-group-hello-world-001.json` | 通过 | `tracePath=traces\\im-send-group-hello-world-001-1778092754048\\steps.jsonl` |
| `npm.cmd run report -- traces\\im-send-group-hello-world-001-1778092754048` | 通过 | 输出 `traces\\im-send-group-hello-world-001-1778092754048\\report.md` |
| `npm.cmd run report-summary -- traces` | 通过 | 输出 `traces\\report-summary.md`，统计 29 个 run |

### 群组发送证据

- TaskSpec：`tasks/im-send-group-hello-world-001.json`
- 自然语言指令：搜索群组 `CUA测试群`，进入该群后发送消息 `Hello world!`，并验证消息出现在目标群会话中。
- 动作：搜索群 -> 打开会话 -> 点击输入框 -> 输入 `Hello world!` -> `Enter` 发送 -> VLM 截图验收。
- Trace：`traces\\im-send-group-hello-world-001-1778092754048\\steps.jsonl`
- 最终截图：`traces\\im-send-group-hello-world-001-1778092754048\\screenshots\\011.png`
- VLM evaluator：`passed=true`，reason 为截图显示已进入 `CUA测试群` 会话，且存在内容为 `Hello world!` 的已发送消息。

### 限制

- 这证明了 IM 群组发送端到端闭环；还没有执行外部个人联系人发送。
- `CUA测试联系人A` 被标记为外部个人联系人，必须确认它是专用测试联系人/用户控制的测试对象后才能真实发送。
- 当前 evaluator 仍是 VLM screenshot；下一步可接 `feishu_im_message_check`，用 lark-cli 做 API 强验证。

## Phase 3 IM Real Send: External Test Contact

### 本次目标

- 官方事实：用户确认 `CUA测试联系人A` 是专用测试联系人，因此符合项目安全数据边界，可以执行真实发送。
- 综合归纳：联系人发送复用群组发送的自然语言 TaskSpec、安全白名单、真实截图 trace 和 VLM screenshot evaluator；目标对象从 `allowedChats` 切换为 `allowedUsers`。

### 真实验证记录

| 命令 | 结果 | 说明 |
|---|---|---|
| `npm.cmd run run-task -- tasks/im-send-contact-hello-world-001.json` | 通过 | `tracePath=traces\\im-send-contact-hello-world-001-1778093037452\\steps.jsonl` |
| `npm.cmd run report -- traces\\im-send-contact-hello-world-001-1778093037452` | 通过 | 输出 `traces\\im-send-contact-hello-world-001-1778093037452\\report.md` |
| `npm.cmd run report-summary -- traces` | 通过 | 输出 `traces\\report-summary.md`，统计 30 个 run |
| `npm.cmd test` | 通过 | 全量 smoke tests 通过 |

### 联系人发送证据

- TaskSpec：`tasks/im-send-contact-hello-world-001.json`
- 自然语言指令：搜索外部个人联系人 `CUA测试联系人A`，进入该会话后发送消息 `Hello world!`，并验证消息出现在目标个人会话中。
- 动作：搜索联系人 -> 打开会话 -> 点击输入框 -> 输入 `Hello world!` -> `Enter` 发送 -> VLM 截图验收。
- Trace：`traces\\im-send-contact-hello-world-001-1778093037452\\steps.jsonl`
- 最终截图：`traces\\im-send-contact-hello-world-001-1778093037452\\screenshots\\011.png`
- VLM evaluator：`passed=true`，reason 为已在外部联系人 `CUA测试联系人A` 的个人会话中成功发送并显示内容为 `Hello world!` 的消息。

### 结论

- IM 真实发送闭环已覆盖两类目标：群组 `CUA测试群` 与外部个人测试联系人 `CUA测试联系人A`。
- 两条任务均是自然语言测试用例驱动的 TaskSpec，并通过真实桌面截图 + VLM evaluator 验收。
- 下一步优先级建议：安装/验证 lark-cli，给这两条 IM 发送任务补 `feishu_im_message_check` API evaluator，形成 GUI 执行 + API 真值验证。
| `npm.cmd install @larksuite/cli --save-dev --cache .npm-cache` | 失败 | npm native script 触发 `spawn EPERM` |
| `npm.cmd install @larksuite/cli --save-dev --cache .npm-cache --ignore-scripts` | 通过 | 安装 `@larksuite/cli@1.0.24` 到本地 `node_modules` |
| Node HTTPS 下载官方二进制 | 通过 | 从 npmmirror 下载 Windows amd64 zip，SHA256 与官方 checksum 一致 |
| `node_modules\@larksuite\cli\bin\lark-cli.exe --version` | 通过 | 输出 `lark-cli version 1.0.24` |
| `node_modules\@larksuite\cli\bin\lark-cli.exe auth status` | 未授权 | 返回 JSON：`not configured`，需 `lark-cli config init --new` |
| `node_modules\@larksuite\cli\bin\lark-cli.exe im --help` | 通过 | 发现 `+chat-search`、`+chat-messages-list`、`+messages-send` 等 IM shortcut |
| `node_modules\@larksuite\cli\bin\lark-cli.exe im +chat-messages-list --help` | 通过 | 确认读消息命令支持 `--chat-id`、`--as user|bot`、`--start`、`--end`、`--sort`、`--format json` |
| `node_modules\@larksuite\cli\bin\lark-cli.exe im +messages-send --help` | 通过 | 确认发消息命令支持 `--chat-id`、`--text`、`--idempotency-key` |

### 下一步

1. 在浏览器完成 `lark-cli config init --new` 输出的飞书授权 URL；这是账号安全确认，必须由账号持有人完成。
2. 授权后运行 `node_modules\@larksuite\cli\bin\lark-cli.exe auth status` 与 `doctor`，确认 CLI 配置可用。
3. 用 `im +chat-search --query "CUA测试群" --as user` 找到测试群 `chat_id`。
4. 将 `tasks/im-message-api-eval.example.json` 的 `<TEST_CHAT_ID_OC_XXX>` 替换为真实测试群 ID，先用 `im +chat-messages-list` 做 read-only evaluator。
5. read-only API evaluator 通过后，执行 GUI 发送唯一 runId 消息，并用 `feishu_im_message_check` 自动验收。

### 授权后推荐命令模板

```powershell
$cli = "node_modules\@larksuite\cli\bin\lark-cli.exe"
& $cli auth status
& $cli doctor
& $cli im +chat-search --query "CUA测试群" --as user --format json
& $cli im +chat-messages-list --chat-id "<TEST_CHAT_ID_OC_XXX>" --as user --page-size 20 --sort desc --format json
```

发测试消息模板，仅限白名单测试群：

```powershell
$runId = "cua-lark-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$text = "CUA-Lark IM API evaluator smoke " + $runId
& $cli im +messages-send --chat-id "<TEST_CHAT_ID_OC_XXX>" --as user --text $text --idempotency-key $runId
& $cli im +chat-messages-list --chat-id "<TEST_CHAT_ID_OC_XXX>" --as user --page-size 20 --sort desc --format json
```

## Phase 4: VLM Semantic Locator — Hybrid GUI Agent

### 目标

从 Phase 2 的"预录制 RPA 脚本 + VLM 事后验收"升级到"VLM 实时视觉定位驱动 GUI 操作"。每步点击/输入坐标由 VLM 从实时截图中产出，定位失败时回退到 calibrated 坐标。核心新增：结构化语义目标、状态验证闭环、初始状态重置。

### 架构新增

| 文件 | 用途 |
|------|------|
| `src/models/vlm-locator.ts` | VLM 元素定位器：截图 + 结构化描述 → `{x, y, confidence, reason}`；含 `verifyStateChange`（状态验证）和 `calibrateCursor`（光标校准） |
| `src/core/planner.ts` | 规则映射 planner：`task.steps` 直接映射或按 instruction 关键词生成步骤；预留 VLM planner 接口 |
| `src/core/agent-loop-v2.ts` | Hybrid agent loop：`planner → locator → retry → fallback → execute → state verify → evaluator` |
| `src/cli/agent-loop-v2.ts` | CLI 入口 `npm run agent-v2 -- <task.json>`；从 env 读取 `CUA_LOCATOR_MAX_RETRIES`(默认2)、`CUA_LOCATOR_CONFIDENCE_THRESHOLD`(默认0.5) |
| `tasks/vlm-im-send-hello-001.json` | IM 自然语言用例：向CUA测试联系人A发送"你好世界" |
| `tasks/vlm-cal-create-event-001.json` | Calendar 自然语言用例：创建5月7日12点"提交复赛截止"日历事件 |
| `tests/vlm-locator.test.ts` | Locator 响应解析测试（found/not-found、围栏、confidence clamp、缺字段） |
| `tests/planner.test.ts` | Planner 步骤生成测试（steps 映射、关键词映射、fallback） |

### 修改文件

| 文件 | 改动 |
|------|------|
| `src/core/task-spec.ts` | 新增 `UiType`/`RegionHint` 类型、`TaskStep` 接口（含 `uiType`/`regionHint`/`nearbyText`/`expectedState`）、`steps?: TaskStep[]`、`allowedCalendarTitles` |
| `src/operators/operator.ts` | `CuaOperator` 新增 `moveMouse?(x, y)` 可选方法；`ExecuteResult` 新增 `cursorPosition`/`requestedPoint`/`cursorDelta` |
| `src/reports/markdown-report.ts` | 新增 Locator 事件类型与渲染表格（step / source / confidence / coordinates / reason） |
| `src/reports/report-summary.ts` | 新增 `locator_fallback` / `locator_unstable` 失败分类 |
| `package.json` | 新增 `agent-v2` npm script |
| `.env.example` | 新增 `CUA_LOCATOR_MAX_RETRIES`、`CUA_LOCATOR_CONFIDENCE_THRESHOLD` |

### 关键设计：结构化语义目标（Step 1）

VLM locator 不再只接收纯文本描述，而是结构化 `LocateTarget`：

```typescript
interface LocateTarget {
  description: string;     // 自然语言元素描述
  uiType?: string;         // icon / button / input / list_item / ...
  regionHint?: string;     // left_sidebar / top_bar / main_content / ...
  nearbyText?: string;     // 锚点文本，辅助确认目标位置
}
```

Locator system prompt 根据结构化字段精确约束搜索范围，`buildLocatePrompt` 将 `regionHint` 映射为中文名（如 `left_sidebar` → `左侧导航栏/侧边栏`）。

### 关键设计：状态验证闭环（Step 4）

每步 `locate_and_click` 后，如果 `step.expectedState` 非空，agent loop 调用 `verifyStateChange(screenshot, expectedState, vlm)` 判断页面状态是否变更：

- 验证通过 → 继续
- 验证失败且有 `fallbackAction` → 执行 fallback（source: `state_fallback`）
- 验证失败且无 fallback → 记录但继续

`INITIAL_STATE_DESCRIPTION` 定义飞书干净初始状态的文字描述，用于 `resetToInitialState`。

### 关键设计：初始状态重置

`resetToInitialState` 在 agent loop 启动时检查当前是否处于干净的飞书消息列表页面。若不满足，用确定性快捷键序列重置：

1. `esc` × 2（关闭弹窗/搜索/对话框）
2. `ctrl+k`（切换搜索关闭）
3. `alt+1`（切换到第一个 tab = 消息）

最多重试 3 轮，每轮后用 VLM 验证状态。不使用 VLM 定位按钮，避免在非目标页面上产生错误点击。

### 真机测试结果

#### IM 搜索框定位

| 测试 | 结果 | 说明 |
|------|------|------|
| VLM 定位搜索框 | `confidence=1.0`，坐标 `(172, 230)` | 结构化 target `uiType=input, regionHint=main_content, nearbyText=搜索` |
| 第二次运行 | 5 步全部 VLM 驱动，0 fallback | 验证了 locator retry 和 structured target 的稳定性 |

#### Calendar 图标定位

| 测试 | 结果 | 说明 |
|------|------|------|
| VLM 定位日历图标 | 返回 `(142, 551)`，calibrated 为 `(292, 635)` | 点击偏差，后续发现根因是坐标映射问题（见下方关键发现） |

#### IM 发送"你好世界"

| 步骤 | 结果 | 说明 |
|------|------|------|
| Step 1-5 (搜索+打开) | VLM 驱动成功 | |
| Step 5 搜索结果 | VLM 点击了云文档而非联系人 | `uiType` 区分不足，type confusion |
| Step 7-8 | VLM 正确报告 not found → fallback | VLM 诚实返回 `found:false` |
| 最终 | failed | 搜索结果点击错误导致进入错误页面 |

#### Calendar 创建"提交复赛截止"

| 步骤 | 结果 | 说明 |
|------|------|------|
| Step 1 日历图标 | VLM 坐标偏差，miss | 坐标映射问题 |
| 后续步骤 | 全部失败 | 因 Step 1 失败导致页面错误 |

#### 结构化目标 + 状态验证测试

| 测试 | 结果 | 说明 |
|------|------|------|
| IM Step 1 VLM click | state verify FAILED → 触发 fallback → calibrated `(345,267)` | 状态验证正确检测到 click 未生效 |
| Calendar 初始状态 | 不在消息列表（搜索弹窗残留） | 证明初始状态重置的必要性 |

### 关键发现：NutJS 截图坐标与鼠标坐标不一致

**这是本 session 最重要的发现。**

实测数据（NutJS `mouse.move` → VLM 观察光标位置）：

| NutJS move 到 | VLM 观察光标在 | 说明 |
|--------------|---------------|------|
| `(0, 0)` | `(986, 95)` | 完全偏移 |
| `(1024, 576)` | `(465, 744)` | 非线性偏移 |
| `(512, 288)` | `(395, 374)` | 三点确认非简单缩放 |

根因分析：

- 物理显示器 2560×1440，Windows DPI 120%（scaleFactor=1.25），逻辑分辨率 2048×1152
- NutJS 截图管线：物理抓取 → resize 到逻辑分辨率 → 输出 2048×1152
- NutJS 鼠标坐标与截图像素不在同一坐标空间（多显示器环境下偏移更明显）
- `parseBoxToScreenCoords` 对坐标做归一化再用相同 screenWidth/Height 反归一化，无实际坐标转换

VLM 像素精度验证（排除 VLM 精度问题）：

| 目标 | VLM 返回 | 实际 | 结论 |
|------|---------|------|------|
| 截图中心点 | `(1024, 576)` | `(1024, 576)` | **精确匹配** |
| 日历图标 | `(44, 382)` | ~`(44, 382)` | x 轴一致 |
| 侧边栏所有图标 | `x≈44` | `x≈44` | 一致 |

结论：**VLM 像素精度完全足够，定位失败的根因是 NutJS 坐标映射不一致，而非 VLM 能力不足。**

### 已实现的修复（部分）

- `calibrateCursor(screenshot, targetDescription, vlm)` 函数已添加到 `src/models/vlm-locator.ts`：VLM 同时识别光标位置和目标位置，计算偏移
- `CuaOperator` 接口新增 `moveMouse?(x, y)` 可选方法
- `ExecuteResult` 新增 `cursorPosition`、`requestedPoint`、`cursorDelta` 字段

### 未完成 → 已修复：NutJS 坐标映射

- `FeishuDesktopOperator.moveMouse` 实现未完成 → 不再需要独立 moveMouse，坐标映射修复后 NutJS 内部鼠标移动即可正确到达目标
- `calibrateCursor` 未集成到 agent-loop-v2 主循环 → 修复根因后不再需要光标校准绕过
- 坐标映射修复后需重跑 IM + Calendar 测试验证 → 待用户在交互 PowerShell 真机执行

#### 修复内容

**文件**：`src/operators/feishu-desktop-operator.ts`

**根因**：`execute()` 和 `ensureFocused()`（taskbar fallback）把截图的逻辑像素尺寸（2048x1152）直接传给 NutJS 的 `screenWidth/screenHeight`，但 NutJS `mouse.move` 操作的是物理像素空间（2560x1440）。VLM 返回逻辑坐标，归一化后用错误尺寸反归一化，产出逻辑像素坐标，鼠标移到错误位置。

**修复**：

1. `execute()` 方法（line 75-82）：从 `lastScreenshot` 读取 `scaleFactor`，计算物理尺寸 `logicalWidth * scaleFactor`、`logicalHeight * scaleFactor`，传给 `toNutActionInputs`、`getRequestedPoint`、`moveToRequestedPointForTelemetry`、`executeNutActionWithTypeFallback`、`withCursorTelemetry`。
2. `ensureFocused()` taskbar fallback（line 160-174）：同样从 `lastScreenshot` 读取 `scaleFactor` 并计算物理尺寸传给 `nutOperator.execute`。

**修复前**（错误）：

```typescript
const screenWidth = this.lastScreenshot?.width ?? this.options.screenWidth;   // 2048
const screenHeight = this.lastScreenshot?.height ?? this.options.screenHeight; // 1152
```

**修复后**（正确）：

```typescript
const scaleFactor = this.lastScreenshot?.scaleFactor ?? 1;
const logicalWidth = this.lastScreenshot?.width ?? this.options.screenWidth;
const logicalHeight = this.lastScreenshot?.height ?? this.options.screenHeight;
const screenWidth = logicalWidth * scaleFactor;   // 2048 * 1.25 = 2560
const screenHeight = logicalHeight * scaleFactor; // 1152 * 1.25 = 1440
```

这样 VLM 坐标（2048x1152 空间）在 `toNutActionInputs` 中用物理尺寸归一化，NutJS `parseBoxToScreenCoords` 用物理尺寸反归一化，产出物理像素坐标，与 `mouse.move` 空间一致。

### 验证记录

| 命令 | 结果 |
|------|------|
| `npm.cmd run typecheck` | 通过 |
| `npm.cmd test` | 通过（全部 9 个测试套件） |

### 阶段结论

- VLM semantic locator 的核心管线（planner → structured target → locate → retry → fallback → state verify → execute → evaluator）已完整实现并通过 mock 测试
- 真机测试证明 VLM 像素精度满足需求，结构化语义目标和状态验证显著提升定位可靠性
- **NutJS 坐标映射修复已完成**（见下方详细记录）
- **IM 真机端到端已通过**（见下方）
- Calendar 真机仍有问题（VLM 侧边栏小图标定位精度不足 + 初始状态重置不可靠）

## Phase 4 真机验证：坐标映射修复 + IM 端到端通过

### 坐标映射修复过程

**第一轮修复（错误）**：

`execute()` 和 `ensureFocused()` 用 `logicalWidth * scaleFactor` 作为 `screenWidth` 传给 `toNutActionInputs` 和 NutJS。但这导致 VLM 坐标用物理尺寸归一化，NutJS 也用物理尺寸反归一化，两者抵消后鼠标仍落在逻辑像素坐标（错误位置）。

**第二轮修复（正确）**：

核心洞察：NutJS 的 `parseBoxToScreenCoords` 用 `screenWidth × 归一化坐标` 反归一化到像素。要让鼠标落到物理像素位置，需要：

1. VLM 坐标（逻辑空间）用**逻辑尺寸**归一化 → 得到正确的 [0,1] 比例
2. NutJS 用**物理尺寸**反归一化 → 得到物理像素坐标

代码变更（`src/operators/feishu-desktop-operator.ts`）：

```typescript
// 归一化：用逻辑尺寸（VLM 坐标空间）
const actionInputs = toNutActionInputs(action, logicalWidth, logicalHeight);
// 反归一化：传物理尺寸给 NutJS
const physicalWidth = logicalWidth * scaleFactor;
const physicalHeight = logicalHeight * scaleFactor;
```

**验证数据**：

| VLM 返回坐标 | 物理鼠标实际位置 | cursorDelta |
|-------------|----------------|------------|
| (43, 63) 搜索框 | (53.75, 78.75) | (2, 16) |
| (496, 186) 联系人 | (620, 232.5) | — |
| (1150, 915) 输入框 | (1437.5, 1143.75) | (2, 16) |

cursorDelta 仅 2-16 像素，证明坐标映射精确。

### 发现的 NutJS 上游 bug

| Bug | 原因 | 影响 | 绕过方式 |
|-----|------|------|---------|
| `Key.Escape` 不生效 | NutJS Key enum 值为 0，被 `.filter(Boolean)` 过滤 | 初始状态重置无法按 Esc 关闭弹窗 | 点击主内容区替代 |
| `alt+1` 被映射到 Alt+F1 | NutJS 数字键 `'1'` 映射到 F1 | 飞书不识别 Alt+F1，无法切换 tab | 改用 `'num1'` 或直接点击侧边栏图标 |

### IM 真机端到端通过

**任务**：`vlm-im-send-hello-001` — 向CUA测试联系人A发送"你好世界"

**第一次运行**（坐标映射修复前，错误版本）：

- 状态：`blocked`
- 3 步 VLM 定位全部成功（confidence=1），状态验证通过
- 阻塞原因：输入框点击坐标错误（鼠标落在逻辑像素而非物理像素），输入框未聚焦，粘贴"你好世界"未生效，send guard 检测到输入框仍为"CUA测试联系人A"
- Trace：`traces\vlm-im-send-hello-001-v2-1778109394881\steps.jsonl`

**第二次运行**（坐标映射修复后，正确版本）：

- 状态：**`passed`**
- 全部 11 步 VLM 驱动完成，VLM screenshot evaluator 判定通过
- Trace：`traces\vlm-im-send-hello-001-v2-1778110261539\steps.jsonl`

| 步骤 | 操作 | VLM 坐标 | 物理鼠标位置 | confidence |
|------|------|---------|------------|-----------|
| 1 | 点击搜索框 | (42, 61) | (52.5, 76.25) | 1.0 |
| 2 | ctrl+a | — | — | — |
| 3 | 输入"CUA测试联系人A" | — | 剪贴板粘贴 | — |
| 4 | 等待 1.5s | — | — | — |
| 5 | 点击联系人结果 | (496, 186) | (620, 232.5) | 1.0 |
| 6 | 等待 1.5s | — | — | — |
| 7 | 点击输入框 | (1140, 915) | (1425, 1143.75) | 1.0 |
| 8 | ctrl+a | — | — | — |
| 9 | 输入"你好世界" | — | 剪贴板粘贴 | — |
| 10 | Enter 发送 | — | send guard 通过 | — |
| 11 | 等待 2s | — | — | — |

**VLM evaluator 结果**：`passed`，reason 为截图显示已在与CUA测试联系人A的会话中，存在内容为"你好世界"的已发送消息。

### IM Demo 录制版本

去掉状态验证和初始状态重置后，为 demo 录制优化执行速度：

- 去掉 `expectedState` 字段（省去每步 1 次 VLM 状态验证调用 ≈ 10-17 秒/步）
- 新增 `CUA_SKIP_RESET=1` 环境变量跳过初始状态重置（省去 3 轮 × 2 次 VLM 调用 ≈ 60-90 秒）
- 新增 CLI 自然语言参数覆盖：`npm.cmd run agent-v2 -- <task.json> "自然语言指令"`
- `passed` 后自动生成 `report.md`，无需手动运行 `npm.cmd run report`

| 运行 | Trace | 状态 | 耗时 |
|------|-------|------|------|
| Demo 录制 | `traces\vlm-im-send-hello-001-v2-1778112961859\steps.jsonl` | passed | ~3 分钟 |

### 本 session 新增/修改文件汇总

| 文件 | 变更 |
|------|------|
| `src/operators/feishu-desktop-operator.ts` | 坐标映射修复：`toNutActionInputs(action, logicalWidth, logicalHeight)` + 传 `physicalWidth/Height` 给 NutJS；taskbar fallback 同步修复 |
| `src/core/agent-loop-v2.ts` | 新增 `click` 固定坐标动作处理；`CUA_SKIP_RESET` 跳过重置；点击替代 Esc 关闭弹窗；截图叠加光标位置红色十字标记（`drawCursorMarker`）；passed 后自动生成 report |
| `src/core/task-spec.ts` | `TaskStep` 新增 `'click'` 动作类型和 `x/y` 字段 |
| `src/core/planner.ts` | `PlannerStep` 新增 `'click'`、`x`、`y` 字段，planner 透传 |
| `src/cli/agent-loop-v2.ts` | 新增自然语言参数覆盖（`process.argv[3]`）；`CUA_SKIP_RESET` 传入 options |
| `tasks/vlm-im-send-hello-001.json` | 去掉所有 `expectedState` 字段 |
| `tasks/vlm-cal-create-event-001.json` | 日历图标改为固定坐标 `click` 动作；去掉 `expectedState` |
| `tools/parse-trace.cjs` | 新增 trace 解析辅助脚本 |

### Calendar 测试状态

未通过。问题：

1. VLM 对侧边栏小图标（约 40x40px）定位精度不足：日历图标实际 Y≈170，VLM 返回 Y=382（偏差 >200px）
2. 初始状态重置不可靠：飞书搜索弹窗无法通过 Esc 关闭（NutJS Key.Escape=0 bug），alt+1 不被飞书识别
3. 需要用户手动将飞书切到消息页面后再运行

### 验证记录

| 命令 | 结果 |
|------|------|
| `npm.cmd run typecheck` | 通过 |
| `npm.cmd test` | 通过（全部 9 个测试套件） |
| IM 真机 `vlm-im-send-hello-001` | **passed**（两次：修复前 blocked，修复后 passed） |
| IM Demo 录制 | **passed**（~3 分钟，无状态验证无重置） |
| Calendar 真机 `vlm-cal-create-event-001` | blocked（VLM 侧边栏定位精度不足 + 初始状态问题） |

### 待解决

- Calendar 侧边栏图标 VLM 定位精度问题（可能的方案：更大的图标描述、固定坐标 fallback）
- NutJS `Key.Escape=0` 上游 bug（需提 issue 或 fork 修复）
- 初始状态重置机制需要更鲁棒的方案（不依赖 Esc 和 alt 快捷键）

## 交付审计与 README 打磨

### 目标

把当前代码、任务契约、测试与文档打磨为复赛交付 GitHub repo；提交前剔除敏感内容和本地大文件。

### 审计结果

| 项目 | 处理 | 证据 |
|---|---|---|
| README | 已重写为复赛交付视角 | 覆盖项目定位、官方要求映射、架构、任务清单、安装运行、安全护栏、验证记录和下一步 |
| 本地密钥 | 未提交 | `.env` 已在 `.gitignore`；`.env.example` 只保留空占位 |
| VLM endpoint id | 已脱敏 | `DEV_NOTES.md` 中真实 endpoint id 替换为 `<VLM_ENDPOINT_ID_REDACTED>` |
| 本机路径 | 已脱敏 | `.env.example` 和 `DEV_NOTES.md` 中本机飞书安装路径替换为占位说明 |
| 测试联系人 | 已泛化 | 对外交付 TaskSpec 与开发记录使用 `CUA测试联系人A` |
| 大文件/个人交付物 | 不纳入 GitHub 主分支 | `.gitignore` 增加 `*.mp4`、`*.docx`、`*.pdf`、个人提交文档生成脚本 |

### 验证结果

| 命令 | 结果 |
|---|---|
| `npm.cmd run typecheck` | 通过 |
| `npm.cmd test` | 通过，9 个测试套件全部通过 |
