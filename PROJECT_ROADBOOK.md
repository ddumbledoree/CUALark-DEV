# CUA-Lark Project Roadbook

## 2026-05-06 路线调整：API evaluator 优先通过 lark-cli

### 官方事实

- 飞书/Lark 官方推荐的 Agent 工具路径可以采用 `AI Agent -> lark-cli -> 飞书 OAPI`。
- `lark-cli` 是飞书/Lark 官方发布在 GitHub 的 CLI 开源项目，面向人类与 AI Agent，支持登录授权、JSON 输出、shortcut/API/raw API 等调用方式。
- 飞书 OAPI 覆盖大量开放平台能力，但具体 evaluator 能否读取 IM/Calendar 真值，取决于应用权限、身份、scope、测试群/测试日历配置与管理员授权。

### 概念边界

- CUA-Lark 的核心仍是 GUI Agent：自然语言或 TaskSpec -> 截图观察 -> VLM/Agent 决策 -> 桌面 GUI 操作 -> trace。
- API evaluator 不用于替代 GUI 操作，不用 API 直接完成发送消息或创建日程。
- API evaluator 的职责是在 GUI 操作之后，通过 `lark-cli` 查询飞书后端状态，验证业务结果是否真实发生。
- 当 `lark-cli`/OAPI 权限不足时，可以降级到 `vlm_screenshot` 或 manual evaluator，但报告必须标注不确定性。

### 实现路线

1. 先实现 `lark-cli` evaluator 基座：统一调用 CLI、读取 JSON、处理 stderr/exit code/timeout。
2. 再实现 IM message check：GUI 发送唯一测试消息后，evaluator 查询测试群最近消息，匹配 `runId` 或期望文本。
3. 后续实现 Calendar event check：GUI 创建/修改测试日程后，evaluator 查询测试日历事件，匹配标题、时间、参与人。
4. `TaskSpec.evaluator` 增加 `feishu_im_message_check` / `feishu_calendar_event_check`，并保留 `vlm_screenshot` 作为半自动 fallback。
5. 所有 API evaluator 只允许测试资源白名单，不提交真实 key、cookie、token 或敏感截图。

### 当前第一版约束

- 第一版不硬编码未经本地 `lark-cli schema` 确认的具体 IM endpoint。
- TaskSpec 通过 `larkCliArgs` 提供查询命令，项目负责执行、轮询、解析输出、匹配期望消息文本。
- 测试群允许发送无敏感、唯一 runId 的测试消息；发送必须限定在白名单 `allowedChats`，使用 idempotency-key，禁止删除/邀请等风险动作。
- 后续在测试 app、测试群和权限确认后，再把 `larkCliArgs` 收敛为稳定的 IM/Calendar evaluator 命令模板。

> 用途：这是给新 thread / 新协作者的高密度项目路书。读完本文，应能从零理解项目目标、边界、术语、架构决策、开发顺序、复赛级交付标准和第一步执行清单。

## 0. 一句话目标

基于 UI-TARS 的 GUI Agent 能力，构建飞书桌面端质量工程测试系统。

更完整的表达：

CUA-Lark 不是通用电脑助手，也不是传统 RPA 脚本集合，而是一个面向飞书桌面端 Electron 客户端的 Computer-Use Agent 测试框架。它通过视觉多模态模型观察飞书界面，理解自然语言测试任务，执行鼠标键盘操作，验证结果，并生成可复盘的测试 trace 与评估报告。

## 1. 信息源分层

### 1.1 官方事实

来自 `CUA-Lark项目说明 .pdf` 与 `AGENTS.md`：

- 项目属于飞书 AI 校园竞赛质量工程与智能测试方向。
- 目标是构建一个像真实用户一样操作飞书桌面端的 Computer-Use Agent。
- 必做能力包括：
  - 视觉感知：通过截图识别飞书 UI 元素、状态与布局。
  - 语义理解：理解自然语言测试指令，并拆解为可执行操作。
  - 自主操作：模拟鼠标点击、键盘输入、滚动、快捷键等 GUI 行为。
  - 状态验证：执行后通过视觉、语义或结构化方式验证结果。
  - 评估报告：输出操作轨迹、成功率、耗时、步骤数、失败原因等指标。
- 至少覆盖 2 个飞书子产品。候选包括 IM、Calendar、Docs、Base、VC、Mail。
- 可基于 UI-TARS-desktop 二次开发，也可自研；若复用开源项目，需明确引用来源并说明自研创新点。
- 核心操作决策必须基于视觉多模态理解；允许结合 Accessibility Tree、DOM、飞书 API 等方式辅助定位和验证。
- 安全要求：不得使用真实私密联系人、真实公司群聊、敏感文档；不得提交 API key、cookie、token、含敏感信息截图或 `.env`。

### 1.2 社区/开源事实

来自 UI-TARS-desktop / `@ui-tars/sdk` 官方资料：

- UI-TARS Desktop 是一个通用 GUI Agent 桌面应用，提供截图感知、VLM 推理、鼠标键盘执行、状态展示等能力。
- `@ui-tars/cli` 是命令行入口，适合快速验证本机 GUI Agent 能力。
- `@ui-tars/sdk` 是开发库，提供 `GUIAgent`、`Operator`、模型调用、action parsing、`onData` 事件流等抽象。
- `Operator` 的核心职责是实现：
  - `screenshot()`：采集屏幕或窗口截图，返回 base64、scaleFactor 等信息。
  - `execute(action)`：执行 click、type、hotkey、scroll、wait 等动作。
- UI-TARS 能提供通用 GUI Agent 能力，但不会直接提供飞书测试任务集、飞书 API 验证、质量工程报告、多子产品用例体系和安全数据隔离。

### 1.3 综合归纳

- UI-TARS 是通用 GUI Agent 底座。
- CUA-Lark 是飞书桌面端质量工程系统。
- 项目价值不在于重复实现 UI-TARS，而在于把通用 CUA 能力落到飞书测试场景：
  - 飞书桌面端 Electron 适配。
  - 飞书 IM / Calendar / Docs 等子产品任务覆盖。
  - TaskSpec 测试任务契约。
  - trace 与截图留存。
  - evaluator 自动或半自动验证。
  - Markdown / HTML 测试报告。
  - 安全白名单与测试数据隔离。

### 1.4 不确定或待实测

- UI-TARS / NutJS 对当前飞书桌面端窗口控制是否稳定。
- DPI、屏幕缩放、多屏幕、飞书窗口聚焦是否导致坐标偏移。
- 中文输入在飞书 Electron 客户端内是否稳定。
- 所选 VLM 是否能稳定输出可解析 action。
- 飞书开放平台权限是否覆盖 IM / Calendar evaluator 所需验证。

## 2. 核心边界

### 2.1 运行环境

已确定：必须面向飞书桌面端 Electron 客户端，不以飞书网页版为主路径。

因此：

- 不以 Playwright 控制网页端作为核心实现。
- 可以参考网页端方案的架构思想，但桌面端执行层应优先验证 NutJS / 系统级 GUI 自动化。
- API 主要用于验证和结构化辅助，不应替代视觉 GUI 决策。

### 2.2 项目不是

- 不是单纯的 UI-TARS Desktop 换壳。
- 不是传统固定流程 RPA 脚本集合。
- 不是完整覆盖飞书所有产品线的大型平台。
- 不是模型微调项目。
- 不是通用个人电脑助手。
- 不是先做大型 Dashboard 的前端项目。

### 2.3 项目是

- 飞书桌面端 GUI 测试 Agent。
- 可复现、可验证、可报告的质量工程系统。
- 以视觉多模态 Agent 决策为核心，以桌面自动化执行为手段，以 evaluator 结果为验收依据。

## 3. 术语速查

| 术语 | 项目内含义 |
|---|---|
| CUA | Computer-Use Agent，像人一样看屏幕、思考、操作电脑的 Agent。 |
| GUI Agent | 面向图形界面的 Agent，通过截图和动作控制完成任务。 |
| RPA | Robotic Process Automation，传统机器人流程自动化，通常依赖固定脚本、选择器、坐标、录制回放。 |
| UI-TARS Desktop | UI-TARS 官方桌面应用，适合作为能力验证样机和源码参考。 |
| `@ui-tars/cli` | UI-TARS 命令行工具，适合最快验证本机能否控制飞书桌面端。 |
| `@ui-tars/sdk` | UI-TARS 开发工具包，适合作为 CUA-Lark 的 backbone。 |
| SDK | Software Development Kit，开发工具包，不是完整应用。 |
| Backbone | 项目底层骨架。这里指用 `@ui-tars/sdk` 提供 Agent 循环、模型调用、Operator 抽象和事件流。 |
| Agent Core | 任务执行发动机：读取任务、截图、模型推理、解析 action、执行、记录 trace、调用 evaluator。 |
| Operator | 屏幕与动作适配器，实现 `screenshot()` 和 `execute(action)`。 |
| NutJSOperator | 基于 nut.js 的桌面自动化 Operator，可用于截图、点击、输入、滚动等桌面动作。 |
| FeishuDesktopOperator | 可能需要自定义的飞书桌面端 Operator，负责窗口聚焦、DPI 修正、中文输入、截图保存、动作执行。 |
| VLM | Vision-Language Model，视觉语言模型，用截图和自然语言做推理。 |
| TaskSpec | 可审计测试任务契约，描述要测什么、初始状态、期望结果、验证方式和安全约束。 |
| Plan | 模型或系统生成的执行步骤草案，可动态调整。不同于 TaskSpec。 |
| Trace | 实际执行记录，包括截图、模型输出、action、耗时、错误等。 |
| Evaluator | 验证器，判断任务是否真的成功。可用飞书 API、截图 OCR、VLM 判断或人工确认。 |
| Report | 测试报告，汇总成功率、耗时、步骤数、失败原因和关键截图。 |

## 4. 架构总览

目标架构：

```text
User Prompt / TaskSpec
        |
        v
Agent Core based on @ui-tars/sdk
        |
        +--> VLM Model Provider
        |
        +--> FeishuDesktopOperator
        |       +--> screenshot()
        |       +--> execute(click/type/hotkey/scroll/wait)
        |
        +--> Trace Recorder
        |
        +--> Evaluator
        |       +--> Feishu API check
        |       +--> screenshot / OCR / VLM fallback
        |
        +--> Report Generator
```

推荐模块边界：

```text
src/
  core/
    agent-core.ts          # 任务执行循环与事件分发
  operators/
    feishu-desktop.ts      # 飞书桌面端截图和动作执行
  models/
    vlm-provider.ts        # VLM 配置和调用适配
  tasks/
    schema.ts              # TaskSpec 类型定义
  evaluators/
    im-evaluator.ts
    calendar-evaluator.ts
  trace/
    recorder.ts            # steps.jsonl、screenshots 保存
  reports/
    markdown-report.ts
  cli/
    run-task.ts
tasks/
  im-send-text.json
  calendar-create-event.json
runs/
  <timestamp-task-id>/
    task.json
    steps.jsonl
    screenshots/
    result.json
    report.md
```

## 5. 技术路线决策

### 5.1 已收敛路线

- `@ui-tars/sdk` 作为正式工程 backbone。
- UI-TARS Desktop / `@ui-tars/cli` 作为能力验证样机和源码参考。
- 第一阶段优先复用 NutJSOperator 或同类桌面 Operator。
- 如遇到飞书桌面端窗口聚焦、DPI、中文输入、截图范围问题，再封装 FeishuDesktopOperator。
- VLM 阶段优先使用 API，不做模型微调。
- 子产品优先 IM + Calendar；Docs 作为备选或后续扩展。
- 每条任务必须产生 TaskSpec、trace、evaluator result、report。

### 5.2 为什么不是直接改 UI-TARS Desktop

UI-TARS Desktop 是通用 GUI Agent 应用，包含完整桌面 UI、配置和运行展示。CUA-Lark 的核心交付是飞书质量工程测试系统，重点在测试任务、验证、报告和飞书领域适配。

直接 fork 并改 UI-TARS Desktop 的风险：

- 被大型 monorepo / Electron App 结构拖慢。
- 复赛阶段容易把时间花在通用产品 UI，而非飞书测试闭环。
- 难以突出自研创新点。

更合理的方式：

- 用 UI-TARS Desktop / CLI 验证桌面控制能力。
- 阅读其 Operator、event stream、action parsing 实现。
- 在 CUA-Lark 中用 SDK 搭建最小可控核心。

## 6. 复赛级交付范围

复赛版本定义：

> CUA-Lark v0.1：一个基于 UI-TARS SDK 思路的飞书桌面端 GUI 测试 Agent，可通过自然语言或 TaskSpec 执行 IM 和 Calendar 的端到端测试任务，每条任务有截图 trace、动作日志、自动或半自动 evaluator，并输出可复盘测试报告。

### 6.1 必须交付

1. 桌面端 Agent 最小闭环
   - screenshot
   - VLM reasoning
   - action parse
   - execute click/type/hotkey/scroll/wait
   - observe again

2. 飞书桌面端 Operator
   - 飞书窗口聚焦。
   - 截图采集。
   - 坐标转换。
   - click / type / hotkey / scroll / wait / finished。
   - 中文输入与系统剪贴板方案验证。
   - 动作失败时返回可记录错误。

3. VLM 接入
   - 支持配置 `baseURL`、`apiKey`、`model`。
   - 环境变量写入 `.env.example`，不得提交真实 key。
   - 记录 token / latency，如模型接口可返回。

4. TaskSpec
   - 至少 6 条，目标 8 条。
   - 覆盖 IM + Calendar。
   - 每条包含 instruction、initialState、expectedResult、evaluator、安全白名单。

5. Evaluator
   - IM：优先用飞书 API 验证消息是否发送到测试群，内容是否正确。
   - Calendar：优先用飞书 API 验证日程标题、时间、参会人。
   - API 未准备好时，可临时使用截图 OCR / VLM 判断 + 人工确认，但报告必须标注不确定性。

6. Trace
   - 每个 run 独立目录。
   - 保存 `task.json`、`steps.jsonl`、关键截图、`result.json`。
   - 每一步记录 step、timestamp、screenshot、model output、parsed action、execute result、latency、error。

7. Report
   - Markdown 优先，HTML 可后置。
   - 汇总任务数、成功数、成功率、平均步骤数、平均耗时、失败原因、关键截图、evaluator 结果。

8. README
   - 项目简介。
   - 架构图。
   - 技术选型理由。
   - 安装运行。
   - Demo 用例。
   - 已知限制。
   - 创新点。

9. Demo 视频
   - 3-5 分钟。
   - 展示 IM 端到端任务、Calendar 端到端任务、trace/report。

### 6.2 建议用例

IM：

- `IM-001` 打开 IM，搜索测试群。
- `IM-002` 在测试群发送指定文本，并验证发送成功。
- `IM-003` 回复最近一条消息，并验证内容。
- `IM-004` 搜索历史消息或联系人。

Calendar：

- `CAL-001` 打开日历。
- `CAL-002` 创建指定标题、指定时间的日程。
- `CAL-003` 修改日程时间。
- `CAL-004` 邀请测试参会人，并验证参会人存在。

跨产品加分：

- `X-001` 创建日程后，在 IM 测试群发送日程通知。

### 6.3 暂不做

- 不做模型微调。
- 不做复杂多 Agent / skills / hooks 架构。
- 不做大而全 Dashboard。
- 不覆盖 6 个飞书子产品。
- 不把 API 操作完全替代 GUI 决策。
- 不声称 fully autonomous，除非有评测数据支持。

## 7. TaskSpec 设计草案

TaskSpec 是验收契约，不等同于模型计划。模型的 Plan 可以变化，TaskSpec 的 expectedResult 和 evaluator 是判断任务成败的依据。

示例：

```json
{
  "id": "im-send-text-001",
  "product": "im",
  "instruction": "在飞书 IM 中搜索 CUA测试群，并发送 Hello World",
  "initialState": {
    "app": "Feishu Desktop",
    "login": "test_account",
    "startPage": "main"
  },
  "expectedResult": {
    "chatName": "CUA测试群",
    "messageText": "Hello World"
  },
  "evaluator": {
    "type": "feishu_api_message_check",
    "timeoutMs": 10000
  },
  "safety": {
    "allowedChats": ["CUA测试群"],
    "allowedUsers": ["CUA测试用户A", "CUA测试用户B"],
    "forbidDelete": true
  }
}
```

## 8. Trace 格式草案

`steps.jsonl` 每行一个 step：

```json
{
  "step": 3,
  "timestamp": "2026-05-06T12:00:00.000+08:00",
  "screenshot": "screenshots/003.png",
  "model": {
    "latencyMs": 1840,
    "thought": "需要在搜索框输入测试群名称",
    "reflection": "当前仍在消息页，下一步搜索目标群",
    "rawPrediction": "Action: type(content='CUA测试群')"
  },
  "action": {
    "type": "type",
    "input": {
      "content": "CUA测试群"
    }
  },
  "executeResult": {
    "status": "success"
  }
}
```

最终 `result.json`：

```json
{
  "taskId": "im-send-text-001",
  "status": "passed",
  "steps": 7,
  "durationMs": 42800,
  "evaluator": {
    "type": "feishu_api_message_check",
    "passed": true,
    "reason": "Found expected message in target chat"
  }
}
```

## 9. 第一阶段执行计划

### Phase 0: 桌面端可行性 Spike

目标：不要先写大框架，先验证本机能否稳定控制飞书桌面端。

任务：

- 安装并运行 UI-TARS Desktop 或 `@ui-tars/cli`。
- 配置可用 VLM API。
- 打开飞书桌面端。
- 尝试以下动作：
  - 点击消息入口。
  - 搜索 `CUA测试群`。
  - 输入 `Hello World`。
  - 发送消息。
  - 滚动消息列表。
  - 使用快捷键。
- 记录结果到开发记录文档：
  - 是否能截图。
  - 坐标是否偏移。
  - 中文输入是否成功。
  - 飞书窗口是否稳定聚焦。
  - 是否有权限弹窗。
  - 失败时截图。

验收：

- 至少 5 个单步动作成功。
- 明确 NutJS / UI-TARS 桌面执行链路是否可用。
- 明确需要自定义 FeishuDesktopOperator 的问题清单。

### Phase 1: 最小工程骨架

目标：创建 CUA-Lark 自有工程，不直接改 UI-TARS Desktop。

任务：

- 初始化 TypeScript 项目。
- 安装 `@ui-tars/sdk`、桌面 operator 相关依赖、dotenv、测试工具。
- 添加 `.env.example`。
- 定义目录结构。
- 写最小 `run-task` CLI。
- 写第一条 TaskSpec：`im-send-text-001`。

验收：

- `npm run typecheck` 可运行。
- `npm test` 至少有一个 schema 或 parser 测试。
- 能从命令行加载 TaskSpec。

### Phase 2: 最小 Agent 闭环

目标：跑通 screenshot -> VLM -> action -> execute -> trace。

任务：

- 接入 VLM。
- 实现或封装 Operator。
- 记录每一步截图和 action。
- 支持 maxLoop。
- 支持 finished。
- 失败时输出 error result。

验收：

- 单条 IM 任务能执行到 finished 或 maxLoop。
- `runs/<timestamp>/steps.jsonl` 和截图存在。

### Phase 3: Evaluator 与 Report

目标：从“能操作”升级为“能验证”。

任务：

- 接入飞书 API 或临时半自动验证器。
- 实现 IM evaluator。
- 实现 Calendar evaluator。
- 生成 `report.md`。

验收：

- 至少 2 条任务有自动或半自动 evaluator。
- 报告包含成功率、耗时、步骤数、失败原因。

### Phase 4: 复赛用例扩展

目标：形成可演示的复赛级产品。

任务：

- 扩展到 6-8 条 TaskSpec。
- 覆盖 IM + Calendar。
- 补充 README。
- 录制 Demo 视频。
- 整理评测报告。

验收：

- 至少 2 个子产品。
- 至少 6 条可运行用例。
- 至少 4 条有可信 evaluator。
- Demo 可完整展示 trace 与 report。

## 10. 文档体系

建议维护 3 类文档：

### 10.1 `README.md`

面向评委 / 交付：

- 项目简介。
- 背景和目标。
- 架构图。
- 技术选型。
- 安装运行。
- 用例列表。
- 评测报告样例。
- Demo 说明。
- 创新点。
- 已知限制。

### 10.2 `MYSELF.md` 或 `DEV_NOTES.md`

面向自己：

- 术语速查。
- 当前决策。
- 环境坑。
- 命令备忘。
- API 权限申请记录。
- UI-TARS Spike 结果。
- 每日开发记录。
- bug 与排查过程。
- 暂缓事项。

不要写真实 API key、cookie、token 或敏感账号信息。

### 10.3 `docs/decision-log.md`

记录关键架构决策：

- ADR-001：选择飞书桌面端而非网页版。
- ADR-002：选择 `@ui-tars/sdk` 作为 backbone。
- ADR-003：第一阶段覆盖 IM + Calendar。
- ADR-004：API 用于验证优先，不替代视觉 GUI 决策。

## 11. 安全与测试数据

必须准备：

- 飞书测试账号。
- `CUA测试群`。
- `CUA测试用户A` / `CUA测试用户B`。
- 测试日历。
- 测试文档空间。
- 可重复创建和清理的数据。

禁止：

- 操作真实工作群。
- 操作真实私人联系人。
- 删除真实文档或日程。
- 提交 `.env`。
- 保存含敏感信息截图到仓库。
- 把真实 API key 写入文档。

建议实现白名单：

```json
{
  "allowedChats": ["CUA测试群"],
  "allowedUsers": ["CUA测试用户A", "CUA测试用户B"],
  "allowedCalendars": ["CUA测试日历"],
  "forbidDelete": true
}
```

## 12. 复赛答辩叙事

推荐核心叙事：

```text
UI-TARS 提供通用 GUI Agent 能力；
CUA-Lark 在此基础上补齐飞书桌面端质量工程所需的任务定义、桌面端适配、结果验证、trace 留存、评估报告和多子产品用例体系。
```

可强调的创新点：

- 从通用 GUI Agent 到飞书领域测试 Agent。
- 从“看起来完成”到 evaluator 证明成功。
- TaskSpec + Trace + Report 的可审计闭环。
- GUI 决策 + API 验证的 Hybrid 测试方法。
- 面向飞书桌面端 Electron 的窗口、DPI、中文输入、异常处理适配。
- IM + Calendar 多子产品端到端覆盖。

不要过度声称：

- 不说 fully autonomous，除非评测数据充分。
- 不说覆盖全部飞书产品线。
- 不说模型能力自研，除非确实训练或改造模型。

## 13. 立即开始清单

按顺序执行：

1. 创建 `DEV_NOTES.md`，记录术语、决策和 Spike 结果。
2. 准备飞书测试账号、测试群、测试日历。
3. 准备 VLM API：`baseURL`、`apiKey`、`model`。
4. 跑 UI-TARS Desktop 或 `@ui-tars/cli`，验证飞书桌面端 5 个单步动作。
5. 记录控制链路问题：截图、坐标、中文输入、窗口聚焦、权限弹窗。
6. 如果桌面控制可行，初始化 CUA-Lark TypeScript 工程。
7. 引入 `@ui-tars/sdk`，优先尝试 NutJSOperator。
8. 写第一条 TaskSpec：`im-send-text-001`。
9. 跑通最小闭环并保存 trace。
10. 加最小 evaluator 和 `report.md`。

第一条任务建议：

```text
IM-001:
在飞书桌面端打开 IM，搜索 CUA测试群，发送 Hello World，并验证发送成功。
```

## 14. Definition of Done

一个功能或阶段完成，必须满足：

- 有代码或文档落地。
- 有最小可行验证。
- 有结果记录。
- 有限制说明。
- 有下一步。

复赛 v0.1 完成标准：

- 飞书桌面端 Agent 最小闭环可运行。
- 覆盖至少 IM + Calendar 两个子产品。
- 至少 6 条 TaskSpec。
- 每条任务有 trace。
- 至少 4 条任务有自动或半自动 evaluator。
- 能生成 Markdown 测试报告。
- README 能解释项目目标、架构、用法、创新点和限制。
- Demo 视频能展示端到端执行和报告。
