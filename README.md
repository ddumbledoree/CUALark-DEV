# CUA-Lark

CUA-Lark 是一个面向飞书/Lark 桌面端 GUI 测试的 Computer-Use Agent 原型。它把自然语言或结构化 TaskSpec 转换为可审计的桌面操作，通过截图 trace、动作日志、VLM/API evaluator 和 Markdown report 证明测试是否真的完成。

项目定位不是通用 RPA 脚本集合，而是飞书桌面端质量工程测试框架：视觉感知负责理解 UI，Operator 负责真实桌面动作，Evaluator 负责验收业务结果，Report 负责复盘证据。

## 交付状态

**官方事实**

- 复赛要求已整理到 `PROJECT_ROADBOOK.md`：需要覆盖视觉感知、语义理解、自主 GUI 操作、状态验证、评估报告，并至少覆盖两个飞书子产品。
- 安全边界要求：不得提交真实 API key、cookie、token、`.env`、敏感截图或真实私密联系人/群聊数据。

**当前成果**

- 已实现 TypeScript 工程骨架、TaskSpec、Mock Operator、Feishu Desktop Operator、VLM provider、Agent Loop、Hybrid Agent Loop v2、Evaluator、Trace、Markdown Report 和 Summary Report。
- 已通过真实 VLM smoke：OpenAI-compatible 文本与图片输入可用，模型输出可解析 JSON 动作。
- 已通过真实飞书桌面 observe-only 闭环：`screenshot -> VLM -> action -> execute -> observe -> trace`。
- 已通过 IM 真机端到端闭环：VLM 语义定位驱动搜索测试联系人、打开会话、输入并发送测试消息，最终由 VLM screenshot evaluator 判定通过。
- 已实现 Calendar 用例与 evaluator 基座，但 Calendar 创建日程的真机稳定性仍需继续校准。

**综合归纳**

CUA-Lark v0.1 的核心成果是一个可运行、可审计、可扩展的飞书桌面 GUI Agent 测试闭环。代码已经把“看起来点到了”推进到“有 trace、有 evaluator、有报告”的质量工程形态。

**不确定或限制**

- 当前不能宣称 fully autonomous。更准确的表述是：安全边界内的桌面 GUI Agent loop + VLM semantic locator + calibrated actions + VLM/API evaluator。
- `feishu_im_message_check` 和 `feishu_calendar_event_check` 依赖测试租户授权、lark-cli 登录状态和对应 scope。
- Calendar 侧边栏小图标、初始状态重置和日程创建流程仍是下一阶段稳定性重点。

## 架构

```text
TaskSpec / Natural Instruction
  -> Planner
  -> VLM Locator / VLM Action Parser
  -> Safety Guard
  -> Feishu Desktop Operator
  -> Trace Recorder
  -> Evaluator
  -> Markdown Report
```

主要模块：

- `src/core/`：TaskSpec、任务加载、固定动作 run loop、Agent Loop、Agent Loop v2、安全检查。
- `src/operators/`：`mock` 与 `feishu-desktop` operator，封装截图、点击、输入、热键、滚动、窗口聚焦和 DPI 坐标映射。
- `src/models/`：OpenAI-compatible VLM provider、动作解析、VLM semantic locator、状态验证。
- `src/evaluators/`：VLM 截图 evaluator、IM/Calendar lark-cli evaluator。
- `src/reports/`：单次运行 Markdown report 和批量 summary report。
- `tasks/`：IM、Calendar、Phase 校准与 API evaluator 示例任务。
- `tests/`：TaskSpec、action parser、安全护栏、locator、planner、report、IM/Calendar evaluator 单测。

## 技术选型

| 层次 | 选择 | 原因 |
|---|---|---|
| 语言 | TypeScript | 类型约束适合 TaskSpec、Action、Trace、Evaluator 等可审计契约 |
| 桌面控制 | `@ui-tars/operator-nut-js` + 自定义 Feishu operator | 复用 GUI Agent 桌面控制能力，同时补飞书窗口聚焦、中文输入、DPI 映射 |
| VLM | OpenAI-compatible provider | 便于接入不同多模态模型，不把供应商写死在核心逻辑里 |
| 验证 | VLM screenshot + lark-cli API evaluator | GUI 执行后用视觉或后端只读查询证明结果，避免只凭动作成功判断 |
| 证据 | JSONL trace + PNG screenshots + Markdown report | 便于复盘、统计和提交评审证据 |

## TaskSpec 示例

正式交付候选：

- `tasks/im-open-chat-001.json`：IM 搜索并进入测试群，不发送消息，VLM 截图验证。
- `tasks/im-send-group-hello-world-001.json`：向测试群发送白名单测试文本，带发送安全阀。
- `tasks/im-send-contact-hello-world-001.json`：向测试联系人发送白名单测试文本，带发送安全阀。
- `tasks/vlm-im-send-hello-001.json`：VLM semantic locator 驱动 IM 发送任务。
- `tasks/calendar-open-001.json`：打开 Calendar 并用 VLM 截图验证。
- `tasks/calendar-create-event-001.json` / `tasks/vlm-cal-create-event-001.json`：Calendar 创建日程契约与 v2 任务。
- `tasks/im-message-api-eval.example.json`：IM 消息 API evaluator 示例。
- `tasks/calendar-api-eval.example.json`：Calendar 日程 API evaluator 示例。

Phase 校准任务保留在 `tasks/phase2-*.json` 与 `tasks/vlm-loc-*.json`，用于解释探索过程，不直接计入稳定业务用例。

## 安装

```powershell
npm.cmd install --cache .npm-cache --ignore-scripts
```

如本机可以正常编译原生桌面依赖，也可以使用：

```powershell
npm.cmd install --cache .npm-cache
```

复制 `.env.example` 为 `.env`，只在本地填写：

```powershell
Copy-Item .env.example .env
```

关键环境变量：

- `VLM_BASE_URL`、`VLM_API_KEY`、`VLM_MODEL`：VLM provider 配置。
- `CUA_OPERATOR=mock|feishu-desktop`：选择 mock 或真实飞书桌面 operator。
- `CUA_TRACE_DIR=traces`：trace 输出目录。
- `LARK_CLI_BIN`：本地 lark-cli 路径，用于 API evaluator。
- `CUA_AGENT_ALLOWED_ACTIONS`：Agent Loop 允许动作集合，真实写操作前应收紧。

不要提交 `.env`、真实 key、cookie、token、trace 截图、真实联系人或真实群聊数据。

## 常用命令

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run run-task -- tasks/im-send-text-001.mock.json
npm.cmd run agent-loop -- tasks/phase2-vlm-loop-observe.json
npm.cmd run agent-v2 -- tasks/vlm-im-send-hello-001.json
npm.cmd run report -- traces/<run-id>
npm.cmd run report-summary -- traces
npm.cmd run vlm-smoke
npm.cmd run lark-cli-smoke
```

真实桌面运行前，请确认飞书当前账号、目标测试群、测试联系人、测试日历均为专用测试资源：

```powershell
$env:CUA_OPERATOR="feishu-desktop"
$env:CUA_SKIP_RESET="1"
npm.cmd run agent-v2 -- tasks/vlm-im-send-hello-001.json
```

## 安全护栏

- `TaskSpec.safety.allowedChats` / `allowedUsers` / `allowedMessageTexts` 限制允许发送的对象与文本。
- `allowSend` 未显式开启时，`Enter` / `Return` / `Ctrl+Enter` 会被阻断。
- 删除类热键、无坐标点击、非白名单输入会被 `src/core/action-safety.ts` 拦截。
- 发送前 `send.guard` 会用 VLM 再次确认当前会话和待发送内容。
- `.gitignore` 默认排除 `.env`、trace、截图、视频、docx、本地 PDF 与个人交付生成脚本。

## 验证记录

最近一次本地可行验证应至少包含：

```powershell
npm.cmd run typecheck
npm.cmd test
```

已在 `DEV_NOTES.md` 记录的关键证据：

- Phase 1：`npm.cmd run typecheck`、`npm.cmd test`、mock run-task 通过。
- Phase 2：真实 VLM smoke 通过，真实 Feishu desktop observe-only loop 通过。
- Phase 3：Markdown report、report summary、IM/Calendar evaluator 单测通过。
- Phase 4：坐标映射修复后，IM 真机端到端任务 passed。

## 交付材料建议

GitHub repo 只提交代码、任务契约、文档和可脱敏的轻量证据。Demo 视频和复赛 docx 建议通过竞赛提交系统或 Release 附件交付，避免把大文件和个人信息写入主分支历史。

## 下一步

1. 将 Calendar 创建日程任务从 calibrated fallback 打磨到稳定可复现。
2. 在测试租户完成 lark-cli 授权，跑通 IM/Calendar API evaluator 的只读真值验证。
3. 生成一份脱敏 summary report，作为 README 可链接的样例报告。
4. 把 Demo 视频单独上传到 Release 或竞赛平台，不进入源码主分支。
