# CUA-Lark 可行性调研与 Workflow 拆解

> 基于 UI-TARS-desktop SDK 二次开发，面向飞书平台的 Computer Use Agent

---

## 目录

- [0. 论文与开源项目调研](#0-论文与开源项目调研)
- [1. 核心操作决策逻辑与视觉多模态理解](#1-核心操作决策逻辑与视觉多模态理解)
- [2. 模型调优](#2-模型调优)
- [3. 操作执行](#3-操作执行)
- [4. 测评体系](#4-测评体系)
- [5. 前端可视化](#5-前端可视化)
- [6. 整体架构与技术栈选型](#6-整体架构与技术栈选型)
- [7. 开发路线图与 Workflow 拆解](#7-开发路线图与-workflow-拆解)

---

## 0. 论文与开源项目调研

### 0.1 推荐开源项目

#### UI-TARS-desktop (字节跳动)

| 维度 | 详情 |
|------|------|
| 定位 | 多模态 AI Agent 全栈，包含 Agent TARS (CLI/Web) 和 UI-TARS Desktop (Electron 桌面应用) |
| 核心能力 | 截图感知 → VLM 推理 → 动作执行的 GUI Agent 闭环 |
| SDK | `@ui-tars/sdk` (npm)，提供 `GUIAgent<T extends Operator>` 抽象类 |
| Operator 接口 | 两个抽象方法：`screenshot()` → 返回 base64 + scaleFactor；`execute(ExecuteParams)` → 执行动作 |
| Model 接口 | `UITarsModel`，调用 VLM 获取 `prediction` + `parsedPredictions` |
| 动作空间 | click, double_click, right_click, type, hotkey, scroll, drag, wait, finished, call_user 等 |
| 二次开发关键点 | 继承 `Operator`，实现自定义的 screenshot 和 execute 即可接入新平台 |
| 技术栈 | TypeScript, Electron, React, pnpm monorepo, Rslib 构建 |
| 协议 | Apache 2.0 |

**SDK 核心架构（从源码分析）：**

```
GUIAgent<T extends Operator>
├── constructor(config: GUIAgentConfig<T>)
│   ├── operator: T           // 自定义 Operator（你需要实现的部分）
│   ├── model: UITarsModel    // VLM 模型调用（OpenAI 兼容接口）
│   ├── systemPrompt          // 可自定义系统提示词
│   ├── maxLoopCount          // 最大循环次数，默认 25
│   └── retry config          // screenshot/model/execute 各环节重试
├── run(instruction, historyMessages?)
│   └── while 循环:
│       ├── 1. operator.screenshot()     → 截图
│       ├── 2. model.invoke(vlmParams)   → VLM 推理
│       ├── 3. 解析 parsedPredictions    → 动作解析
│       └── 4. operator.execute(params)  → 动作执行
├── pause() / resume() / stop()  // 控制接口
└── onData / onError 回调        // 事件流
```

**Operator 抽象接口（你需要实现）：**

```typescript
abstract class Operator {
  static MANUAL: { ACTION_SPACES: string[]; EXAMPLES?: string[] };
  abstract screenshot(): Promise<ScreenshotOutput>;  // 返回 { base64, scaleFactor }
  abstract execute(params: ExecuteParams): Promise<ExecuteOutput>;
}
```

#### UI-TARS 模型 (字节跳动)

| 维度 | 详情 |
|------|------|
| 定位 | 端到端视觉-语言-动作模型，OSWorld SOTA |
| 创新点 | 增强感知(纯截图理解)、统一动作建模(跨平台)、System-2 推理(任务分解+反思)、迭代训练(反射式在线轨迹) |
| 性能 | OSWorld 24.6 (50步)，超越 Claude (22.0)；AndroidWorld 46.6，超越 GPT-4o (34.5) |
| 参考价值 | VLM 模型调用方式、Prompt 设计模式（thought/reflection/action_type/action_inputs）、坐标后处理 |
| 模型获取 | 火山引擎 API (doubao-1-5-thinking-vision-pro)、ModelScope 部署、本地 vLLM |

#### TuriX-CUA (TurixAI)

| 维度 | 详情 |
|------|------|
| 定位 | 多 Agent 架构 CUA，OSWorld 得分 64.2%（第三名） |
| 架构 | 4 角色分离：Brain (决策VLM) → Actor (动作翻译) → Memory (状态管理) → Planner (任务分解，可选) |
| MCP 集成 | 原生支持 MCP 协议，可被其他 Agent 作为桌面执行后端调用 |
| Skills 系统 | Markdown Playbook + YAML frontmatter，支持热插拔技能 |
| 参考价值 | Multi-Agent 分工模式（决策与执行解耦）、Memory 持久化与恢复、Skill 风格的任务模板 |
| 技术栈 | Python, PyAutoGUI, AppleScript |

#### OSWorld (xlang-ai)

| 维度 | 详情 |
|------|------|
| 定位 | 操作系统级 Agent 评测 Benchmark，NeurIPS 2024 |
| 评测方式 | Gymnasium 接口：`reset(task_config)` → agent 交互 → `evaluate()` 返回 0/1 分数 |
| 任务量 | 369 个真实电脑任务，跨办公/日常/专业场景 |
| 参考价值 | 任务定义 JSON Schema (instruction + config + evaluator)、getter/metric 评测框架、多后端虚拟化 |
| 关键发现 | 人类 72.36%，最佳模型仅 12.24%（主要瓶颈：GUI Grounding 和操作知识） |

### 0.2 推荐论文核心要点

#### UI-TARS (ByteDance, 2025, arXiv:2501.12326)

- **纯截图感知**：不依赖 Accessibility Tree 或 DOM，模型直接从像素级截图理解 UI
- **统一动作建模**：跨桌面/移动/Web 统一动作词汇表 (click/type/scroll/drag/hotkey...)
- **System-2 推理**：每步输出 Thought → Reflection → Action，引入"慢思考"
- **迭代训练**：在数百个 VM 上自动收集轨迹 → 过滤失败 → 反思微调 → 循环

#### OS Agents Survey (ACL 2025 Oral)

- **三种范式**：API-based Agent / GUI-based Agent / Hybrid Agent
- **关键结论**：飞书类企业应用最适合 Hybrid（API 处理结构化操作，GUI 处理 API 未覆盖的场景）
- **核心挑战**：Grounding 精度、长程规划、错误恢复、安全权限

#### ScaleCUA (ICLR 2026 Oral)

- **核心发现**：数据质量 > 数据数量，中等规模模型 + 高质量领域数据可超越大模型
- **基础设施**：分布式 VM 并行数据收集 + 自动质量控制管线
- **对飞书 CUA 的启示**：构建飞书专属高质量轨迹数据集比追求大模型更有效

#### GUI-R1

- **RL 训练 GUI Agent**：基于规则的奖励（+1 正确动作 / -1 错误动作）替代人工标注
- **Chain-of-Thought**：每步输出可审计的推理链
- **对飞书 CUA 的启示**：可定义飞书任务规则奖励（消息发送成功 +1、文档创建完成 +1），实现持续自我改进

---

## 1. 核心操作决策逻辑与视觉多模态理解

### 1.1 决策循环 (Perception → Reasoning → Action)

```
┌─────────────────────────────────────────────────────┐
│                    用户指令 (NL)                       │
│  "帮我把上周的会议纪要发给张三，并创建一个跟进任务"        │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  Step 1: Perception (感知)                            │
│  ├── screenshot() → 飞书界面截图 (base64)              │
│  ├── scaleFactor → 设备 DPR                          │
│  └── 可选: 飞书 API 获取当前状态上下文                   │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  Step 2: Reasoning (推理)                             │
│  ├── System Prompt (动作空间 + 飞书 UI 规则)            │
│  ├── History (对话历史 + 截图历史)                      │
│  ├── VLM Model (UITarsModel / 自定义 VLM)             │
│  └── 输出: Thought + Reflection + Action              │
└──────────────────────┬──────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────┐
│  Step 3: Action (执行)                                │
│  ├── 解析 parsedPrediction → action_type + inputs      │
│  ├── 路由: API 可用? → Feishu API / GUI 操作            │
│  └── execute() → 执行动作并返回状态                     │
└──────────────────────┬──────────────────────────────┘
                       ▼
                   下一步循环
```

### 1.2 System Prompt 设计策略

UI-TARS SDK 的 System Prompt 由 Operator 的 `ACTION_SPACES` 自动生成，格式为：

```
You are a GUI agent...
## Action Space:
- click(start_box): Click at the specified coordinates
- type(content): Type text content
- scroll(direction): Scroll in direction
- hotkey(key): Press keyboard shortcut
- finished(): Task completed
...

## Response Format:
Thought: <step-by-step reasoning>
Reflection: <self-evaluation of progress>
Action: <action_type>(<action_inputs>)
```

**飞书 CUA 需要扩展的部分：**

```
## Additional Action Space (Feishu-specific):
- feishu_send_message(chat_id, content): 通过 API 发送消息
- feishu_create_doc(title, content, folder_id): 通过 API 创建文档
- feishu_schedule_meeting(title, start_time, end_time, attendees): 通过 API 创建会议
- feishu_submit_approval(form_id, data): 通过 API 提交审批
- feishu_search(query, scope): 搜索飞书内容

## Feishu UI Rules:
- 侧边栏导航: 消息 / 日历 / 文档 / 工作台 / ...
- 聊天窗口结构: 消息列表 + 输入框 + 附件按钮
- 文档编辑器: 标题 + 正文 + 工具栏
```

### 1.3 Hybrid 路由决策

```python
def route_action(parsed_prediction, feishu_api_capability):
    """决定使用 API 还是 GUI 执行动作"""
    action = parsed_prediction.action_type

    # 1. 纯 API 操作（精确、快速、可审计）
    if action in ['feishu_send_message', 'feishu_create_doc',
                   'feishu_schedule_meeting', 'feishu_search']:
        return Route.API

    # 2. 纯 GUI 操作（API 无法覆盖的场景）
    if action in ['click', 'type', 'scroll', 'drag', 'hotkey']:
        return Route.GUI

    # 3. 混合操作（API 验证 + GUI 补充）
    # 例: 编辑文档 → API 读取内容 → GUI 拖拽调整布局
    return Route.HYBRID
```

---

## 2. 模型调优

### 2.1 可选模型方案

| 方案 | 模型 | 优点 | 缺点 | 推荐度 |
|------|------|------|------|--------|
| A. UI-TARS 原生 | UI-TARS-1.5/2.0 | OSWorld SOTA，动作空间天然适配 | 需要部署，资源消耗大 | ★★★★ |
| B. 豆包 VL | doubao-1-5-thinking-vision-pro | API 即用，Agent TARS 原生支持 | 闭源，无法微调 | ★★★★★ |
| C. Qwen-VL + SFT | Qwen2.5-VL-7B | 开源可微调，社区生态好 | 需要自建训练管线 | ★★★★ |
| D. Claude/GPT-4o | Claude 3.7 Sonnet / GPT-4o | 能力强，通用性好 | 成本高，延迟大 | ★★★ |

### 2.2 推荐方案：豆包 VL API + 飞书领域 Prompt 优化

**阶段 1 (MVP)：** 直接使用豆包 VL API，通过 UI-TARS SDK 的 `UITarsModel` 调用

```typescript
// SDK 内置 OpenAI 兼容接口
const agent = new GUIAgent({
  operator: new FeishuOperator(),
  model: {
    baseURL: 'https://ark.cn-beijing.volces.com/api/v3',
    model: 'doubao-1-5-thinking-vision-pro-250428',
    apiKey: process.env.VOLCENGINE_API_KEY,
  },
  systemPrompt: feishuSystemPrompt,
  maxLoopCount: 30,
});
```

**阶段 2 (进阶)：** 构建飞书专属训练数据 → SFT 微调开源 VLM

```
数据收集管线:
1. 在虚拟机/云桌面中运行飞书客户端
2. 录制人工操作轨迹 (screenshot → action pair)
3. 自动过滤失败轨迹，保留成功轨迹
4. 格式化为 UI-TARS 训练格式 (conversation turns)
5. 飞书特定增强: 多种分辨率/DPI/主题/布局

参考 ScaleCUA: 高质量 > 大数量，几百条精细轨迹可能优于万条噪声数据
```

**阶段 3 (RL)：** 参考 GUI-R1 的规则奖励方案

```
奖励规则设计:
- 发送消息成功: +1 (通过 API 验证消息是否到达)
- 创建文档成功: +1 (通过 API 验证文档存在)
- 导航到正确页面: +0.5 (通过截图对比验证)
- 错误操作/死循环: -1
- 超时未完成: -0.5
```

### 2.3 Prompt Engineering 关键点

```
系统提示词需要包含:
1. 动作空间定义 (ACTION_SPACES) — 自动从 Operator.MANUAL 生成
2. 飞书 UI 知识 — 侧边栏结构、功能入口位置、快捷键
3. 安全约束 — 不允许删除文档、不向错误的人发送消息等
4. 坐标格式 — bounding box [x1,y1,x2,y2] 或 center point [x,y]
5. 反思模板 — 每步必须输出 Thought + Reflection
```

---

## 3. 操作执行

### 3.1 自定义 Operator 架构

这是二次开发的核心 — 继承 `@ui-tars/sdk` 的 `Operator` 抽象类：

```typescript
import { Operator, ExecuteParams, ExecuteOutput } from '@ui-tars/sdk';

class FeishuOperator extends Operator {
  static MANUAL = {
    ACTION_SPACES: [
      // GUI 动作 (继承自 UI-TARS)
      'click(start_box: str) - Click at coordinates',
      'double_click(start_box: str) - Double click',
      'right_click(start_box: str) - Right click',
      'type(content: str) - Type text',
      'hotkey(key: str) - Press hotkey',
      'scroll(direction: str) - Scroll page',
      'drag(start_box: str, end_box: str) - Drag element',
      'wait() - Wait for page load',
      'finished() - Task completed',

      // 飞书 API 动作 (扩展)
      'feishu_send_message(chat_name: str, content: str)',
      'feishu_create_doc(title: str, folder: str)',
      'feishu_schedule_event(title: str, time: str)',
      'feishu_search(query: str, scope: str)',
    ],
  };

  async screenshot(): Promise<ScreenshotOutput> {
    // 方案 A: 控制飞书桌面客户端截图
    // 方案 B: 控制浏览器中的飞书网页版 (Playwright)
    // 方案 C: 控制远程桌面 (RDP/VNC)
    // 方案 D: 使用 Electron 嵌入飞书 + 截图
  }

  async execute(params: ExecuteParams): Promise<ExecuteOutput> {
    const { parsedPrediction, screenWidth, screenHeight, scaleFactor } = params;

    switch (parsedPrediction.action_type) {
      // GUI 操作 → 坐标转换后执行鼠标/键盘
      case 'click':
      case 'type':
      case 'scroll':
        return this.executeGUI(params);

      // API 操作 → 直接调用飞书 API
      case 'feishu_send_message':
        return this.executeAPI(params);

      default:
        return this.executeGUI(params);
    }
  }
}
```

### 3.2 执行层技术选型

| 执行方式 | 技术栈 | 适用场景 | 可靠性 |
|----------|--------|----------|--------|
| **Playwright (推荐)** | TypeScript + Playwright | 飞书网页版 | ★★★★★ |
| **RobotJS / nut.js** | TypeScript native | 飞书桌面客户端 | ★★★ |
| **PyAutoGUI** | Python | 跨平台桌面操作 | ★★★ |
| **飞书 API 直调** | TypeScript + HTTP | 结构化操作 | ★★★★★ |
| **Electron 内嵌** | Electron + Puppeteer | 自定义容器 | ★★★★ |

**推荐方案：Playwright 控制飞书网页版 + 飞书 API 辅助**

```
优势:
1. Playwright 提供精确的 DOM 定位 + 截图能力
2. 网页版飞书可在无头模式运行，节省资源
3. 可获取 DOM Accessibility Tree 作为补充感知
4. 飞书 API 处理消息发送/文档创建等结构化操作
5. 两者结合: GUI 感知 + API 执行 = 最可靠的 Hybrid 方案
```

### 3.3 坐标后处理

```
VLM 输出坐标 → SDK 自动处理:

1. parsedPrediction.action_inputs.start_box = "[x1,y1,x2,y2]"
   (模型输出的是 0-1000 归一化坐标)

2. 转换公式:
   physical_x = (x / 1000) * screenWidth * scaleFactor
   physical_y = (y / 1000) * screenHeight * scaleFactor

3. Playwright 点击:
   page.click({ x: physical_x, y: physical_y })

4. 对于飞书特定元素，可辅助使用 CSS 选择器:
   page.locator('[data-testid="send-button"]').click()
```

---

## 4. 测评体系

### 4.1 评测框架设计 (参考 OSWorld)

```
评测架构:
├── Task Definition (JSON)
│   ├── instruction: "在飞书中给张三发送一条消息：明天下午3点开会"
│   ├── config: 初始状态设置 (打开飞书、登录状态、初始页面)
│   └── evaluator: 验证函数
│       ├── getter: 提取实际状态 (消息是否发送、发给谁、内容是什么)
│       ├── expected: 预期结果
│       └── metric: 比对函数 (精确匹配 / 包含匹配 / 语义相似度)
│
├── Runner
│   ├── 创建隔离环境 (浏览器 profile / 虚拟机快照)
│   ├── 注入任务
│   ├── 执行 Agent
│   └── 运行 Evaluator
│
└── Report
    ├── 任务成功率 (binary: 0/1)
    ├── 步骤效率 (实际步数 / 最优步数)
    ├── 平均 Token 消耗
    └── 错误分类统计
```

### 4.2 飞书 CUA 任务分类

```
Level 1 - 基础导航 (20 tasks)
├── 打开消息列表
├── 切换到日历视图
├── 打开文档应用
├── 搜索联系人
└── 进入设置页面

Level 2 - 单步操作 (50 tasks)
├── 发送一条文本消息
├── 创建一个空白文档
├── 创建一个日程
├── 上传一个文件
├── 回复一条消息
└── 点赞/表情回应

Level 3 - 多步流程 (80 tasks)
├── 从文档中提取内容，发送给指定人
├── 创建日程并邀请参会者
├── 在文档中插入表格并填写数据
├── 提交一个审批流程
└── 创建群聊并设置群名

Level 4 - 复杂工作流 (50 tasks)
├── 整理上周会议纪要 → 提取待办 → 创建任务分配
├── 从多维表格汇总数据 → 生成报表 → 发送给团队
├── 跨应用协作: 文档 → 表格 → 消息 → 日历
└── 错误恢复: 网络断开、弹窗处理、权限不足
```

### 4.3 评测指标

```python
metrics = {
    "task_success_rate": "binary success (0/1) per task",
    "step_efficiency": "actual_steps / optimal_steps",
    "grounding_accuracy": "correct_element_clicked / total_clicks",
    "error_recovery_rate": "recovered_from_error / total_errors",
    "api_vs_gui_ratio": "api_calls / total_actions (hybrid efficiency)",
    "token_consumption": "total_input_tokens + output_tokens",
    "latency_per_step": "average time per agent step",
}
```

### 4.4 自动化评测实现

```typescript
// 参考 OSWorld 的 Gym 接口设计
interface FeishuEvalEnv {
  reset(taskConfig: TaskConfig): Promise<Observation>;
  step(action: Action): Promise<{ observation: Observation; reward: number; done: boolean }>;
  evaluate(): Promise<number>; // 0 or 1
}

// Evaluator 实现示例
class FeishuMessageEvaluator {
  async evaluate(task: Task, agentTrace: AgentTrace): Promise<number> {
    // 1. 通过飞书 API 验证消息是否发送
    const messages = await feishuAPI.getRecentMessages(task.targetChat);
    const match = messages.find(m =>
      m.content.includes(task.expectedContent) &&
      m.receiver === task.expectedReceiver
    );
    return match ? 1 : 0;
  }
}
```

---

## 5. 前端可视化

### 5.1 方案选型

| 方案 | 技术 | 优点 | 缺点 |
|------|------|------|------|
| **A. Electron 桌面应用** | Electron + React | UI-TARS Desktop 现成架构可复用 | 打包体积大 |
| **B. Web Dashboard** | React + WebSocket | 轻量、跨平台、易分享 | 无法直接控制桌面 |
| **C. 飞书小程序/H5** | 飞书小程序框架 | 原生飞书体验 | 功能受限 |

**推荐方案：B (Web Dashboard) + 飞书 Bot 集成**

理由：
- Agent 核心在后端运行，前端只做监控和交互
- Web Dashboard 方便团队协作和远程查看
- 通过飞书 Bot 接收任务和返回结果，融入飞书工作流

### 5.2 可视化组件设计

```
Dashboard 布局:
┌────────────────────────────────────────────────────────┐
│  CUA-Lark Dashboard                           [设置]    │
├──────────────┬─────────────────────┬───────────────────┤
│  任务列表     │   实时屏幕 (Agent 视角)  │   Agent 日志      │
│              │                     │                   │
│  ▶ 任务 1    │   ┌─────────────┐   │  Thought: 需要...  │
│    运行中     │   │             │   │  Reflection: ...   │
│  ■ 任务 2    │   │  飞书截图    │   │  Action: click(..) │
│    已完成     │   │  + 标注框    │   │  Result: OK        │
│  ▶ 任务 3    │   │             │   │                   │
│    运行中     │   └─────────────┘   │  Token: 1.2k      │
│              │                     │  Step: 5/30       │
├──────────────┴─────────────────────┴───────────────────┤
│  执行时间线                                              │
│  ──●──────────●────────────●──────────────●──→         │
│  截图   VLM推理     点击操作    API发送消息               │
├────────────────────────────────────────────────────────┤
│  输入: [  请帮我给张三发送明天开会的通知  ]     [发送]      │
└────────────────────────────────────────────────────────┘
```

### 5.3 Event Stream 设计

```typescript
// UI-TARS SDK 提供 onData 回调，可直接映射为 Event Stream
interface AgentEvent {
  type: 'screenshot' | 'prediction' | 'action' | 'error' | 'status';
  timestamp: number;
  data: {
    screenshot?: string;        // base64
    thought?: string;           // Agent 思考
    reflection?: string;        // 自我评估
    action_type?: string;       // 动作类型
    action_inputs?: object;     // 动作参数
    bounding_box?: number[];    // 点击位置标注
    status?: string;            // running/pause/end/error
  };
}

// WebSocket 推送到前端
agent.onData = (event) => {
  wss.broadcast({ type: 'agent_update', payload: event });
};
```

---

## 6. 整体架构与技术栈选型

### 6.1 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Web Dashboard │  │ 飞书 Bot/H5  │  │ CLI (Agent TARS 兼容) │  │
│  │ React + WS    │  │ 飞书开放平台   │  │ @agent-tars/cli      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼──────────────────────┼─────────────┘
          │                 │                      │
          ▼                 ▼                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Agent Core (TypeScript)                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  GUIAgent<T extends Operator>  (@ui-tars/sdk)            │    │
│  │  ┌──────────┐  ┌──────────┐  ┌───────────────────────┐ │    │
│  │  │ Operator │  │  Model   │  │  System Prompt Engine  │ │    │
│  │  │ (自定义)  │  │ (VLM)   │  │  (飞书 UI 知识注入)     │ │    │
│  │  └────┬─────┘  └────┬─────┘  └───────────────────────┘ │    │
│  └───────┼─────────────┼──────────────────────────────────┘    │
│          │             │                                         │
│  ┌───────▼─────────────▼───────────────────────────────────┐    │
│  │              Action Router (Hybrid)                       │    │
│  │    API 可用? ──→ Feishu API Layer (TypeScript)            │    │
│  │    GUI 需要? ──→ Browser Automation (Playwright)          │    │
│  └──────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
          │                              │
          ▼                              ▼
┌──────────────────┐       ┌────────────────────────────────────┐
│  Feishu Open API │       │  Browser / Desktop Control          │
│  ├── IM 消息      │       │  ├── Playwright (网页版飞书)         │
│  ├── 文档         │       │  ├── nut.js (桌面客户端)            │
│  ├── 日历         │       │  └── Screenshot Service             │
│  ├── 审批         │       └────────────────────────────────────┘
│  ├── 通讯录       │
│  └── 多维表格     │
└──────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Evaluation Layer (Python)                      │
│  ├── Task Runner (隔离环境 + Agent 执行)                          │
│  ├── FeishuEvaluator (API 验证 + 截图对比)                       │
│  └── Report Generator (成功率/效率/错误分析)                      │
└─────────────────────────────────────────────────────────────────┘
```

### 6.2 技术栈总结

| 层级 | 技术 | 语言 | 理由 |
|------|------|------|------|
| Agent Core | `@ui-tars/sdk` | TypeScript | 官方 SDK，Operator 抽象完备 |
| VLM 模型 | 豆包 VL / UI-TARS API | - | OpenAI 兼容接口，SDK 直接支持 |
| 浏览器控制 | Playwright | TypeScript | 网页版飞书自动化，截图+操作一体 |
| 飞书 API | `@larksuiteoapi/node-sdk` | TypeScript | 官方 SDK，完整 API 覆盖 |
| 前端 | React + Vite + WebSocket | TypeScript | 实时监控 Agent 运行 |
| 评测框架 | 自建 (参考 OSWorld) | Python | 评测脚本独立于 Agent 运行 |
| 数据/训练 | vLLM + transformers | Python | 如需微调，使用 Python 工具链 |
| 部署 | Docker + Node.js | - | 容器化部署 |

---

## 7. 开发路线图与 Workflow 拆解

### Phase 1: 基础框架搭建

```
□ 1.1 项目初始化
    ├── 创建 monorepo (pnpm workspace)
    ├── 安装 @ui-tars/sdk, @larksuiteoapi/node-sdk, playwright
    └── 配置 TypeScript + ESLint + Vitest

□ 1.2 实现 FeishuOperator
    ├── screenshot(): Playwright 截图飞书网页版
    ├── execute(): 坐标转换 + Playwright 点击/输入
    └── ACTION_SPACES 定义 (基础 GUI 动作)

□ 1.3 基础 Agent 运行
    ├── 配置豆包 VL API 模型
    ├── 编写飞书 System Prompt
    ├── 连接 GUIAgent → FeishuOperator → Model
    └── 端到端测试: 打开飞书、导航到聊天
```

### Phase 2: API + GUI Hybrid

```
□ 2.1 飞书 API 集成
    ├── 消息发送/接收
    ├── 文档创建/编辑
    ├── 日历查询/创建
    └── 联系人搜索

□ 2.2 Action Router 实现
    ├── 动作分类: API / GUI / Hybrid
    ├── API 操作: 直接调用飞书 API
    ├── GUI 操作: Playwright 执行
    └── 结果验证: API 调用验证 GUI 操作结果

□ 2.3 System Prompt 优化
    ├── 注入飞书 UI 知识 (页面结构、功能位置)
    ├── 添加 API 动作空间
    └── 安全约束规则
```

### Phase 3: 评测体系

```
□ 3.1 评测框架实现
    ├── Task JSON Schema 定义
    ├── Task Runner (Playwright 环境管理)
    ├── Evaluator 基类 (getter + metric)
    └── 报告生成器

□ 3.2 任务用例编写
    ├── Level 1: 基础导航 (20 tasks)
    ├── Level 2: 单步操作 (50 tasks)
    ├── Level 3: 多步流程 (80 tasks)
    └── Level 4: 复杂工作流 (50 tasks)

□ 3.3 自动化评测
    ├── CI 集成
    ├── 回归测试
    └── 性能基准建立
```

### Phase 4: 前端可视化

```
□ 4.1 Web Dashboard
    ├── React 项目搭建
    ├── WebSocket 实时通信
    ├── 实时屏幕显示 + 标注
    └── Agent 日志流

□ 4.2 任务管理界面
    ├── 任务输入/创建
    ├── 运行状态监控
    ├── 历史记录查看
    └── 评测报告展示

□ 4.3 飞书 Bot 集成
    ├── 事件订阅 (消息接收)
    ├── 自然语言 → Agent 任务
    ├── 交互式卡片 (确认/取消)
    └── 执行结果推送
```

### Phase 5: 模型优化 (可选进阶)

```
□ 5.1 数据收集
    ├── 飞书操作轨迹录制
    ├── 人工标注 + 自动标注
    └── 质量过滤

□ 5.2 微调训练
    ├── Qwen2.5-VL SFT
    ├── 飞书专属评测
    └── 与基线模型对比

□ 5.3 RL 优化 (参考 GUI-R1)
    ├── 规则奖励定义
    ├── GRPO 训练
    └── 迭代改进
```

---

## 附录: 关键参考链接

| 资源 | 链接 |
|------|------|
| UI-TARS-desktop | https://github.com/bytedance/UI-TARS-desktop |
| UI-TARS 论文 | https://arxiv.org/abs/2501.12326 |
| @ui-tars/sdk (npm) | https://www.npmjs.com/package/@ui-tars/sdk |
| TuriX-CUA | https://github.com/TurixAI/TuriX-CUA |
| OSWorld | https://github.com/xlang-ai/OSWorld |
| 飞书开放平台 | https://open.feishu.cn/ |
| 飞书 Node SDK | https://www.npmjs.com/package/@larksuiteoapi/node-sdk |
| Agent TARS CLI | https://www.npmjs.com/package/@agent-tars/cli |
| Playwright | https://playwright.dev/ |
