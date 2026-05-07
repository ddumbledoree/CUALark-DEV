import type { OperatorAction } from '../operators/operator.js';
import type { TaskSpec, TaskStep } from './task-spec.js';

export interface PlannerStep {
  index: number;
  action: 'locate_and_click' | 'locate_and_type' | 'click' | 'type' | 'wait' | 'hotkey';
  targetDescription?: string;
  typeContent?: string;
  hotkey?: string;
  waitMs?: number;
  x?: number;
  y?: number;
  fallbackAction?: OperatorAction;
  uiType?: import('./task-spec.js').UiType;
  regionHint?: import('./task-spec.js').RegionHint;
  nearbyText?: string;
  expectedState?: string;
}

export interface Planner {
  plan(): PlannerStep[];
}

export function createPlanner(task: TaskSpec): Planner {
  return new RuleBasedPlanner(task);
}

class RuleBasedPlanner implements Planner {
  constructor(private readonly task: TaskSpec) {}

  plan(): PlannerStep[] {
    if (this.task.steps?.length) {
      return this.task.steps.map((step, index) => ({
        index,
        action: step.action,
        targetDescription: step.targetDescription,
        typeContent: step.typeContent,
        hotkey: step.hotkey,
        waitMs: step.waitMs,
        x: step.x,
        y: step.y,
        fallbackAction: this.task.actions?.[index],
        uiType: step.uiType,
        regionHint: step.regionHint,
        nearbyText: step.nearbyText,
        expectedState: step.expectedState,
      }));
    }

    return this.planFromInstruction();
  }

  private planFromInstruction(): PlannerStep[] {
    const { targetProduct, instruction } = this.task;
    const lower = instruction.toLowerCase();

    if (targetProduct === 'im') {
      if (lower.includes('搜索') || lower.includes('search')) {
        return this.planImSearch();
      }
      if (lower.includes('发送') || lower.includes('send')) {
        return this.planImSend();
      }
    }

    if (targetProduct === 'calendar') {
      if (lower.includes('创建') || lower.includes('create')) {
        return this.planCalendarCreate();
      }
      if (lower.includes('打开') || lower.includes('open')) {
        return this.planCalendarOpen();
      }
    }

    return this.planFromActions();
  }

  private planImSearch(): PlannerStep[] {
    const allowedChats = this.task.safety.allowedChats ?? [];
    const searchText = allowedChats[0] ?? '';

    return [
      { index: 0, action: 'locate_and_click', targetDescription: '飞书左上方搜索框' },
      { index: 1, action: 'hotkey', hotkey: 'ctrl+a' },
      { index: 2, action: 'locate_and_type', targetDescription: '搜索输入框', typeContent: searchText },
      { index: 3, action: 'wait', waitMs: 1000 },
      { index: 4, action: 'locate_and_click', targetDescription: '搜索结果中目标条目' },
      { index: 5, action: 'wait', waitMs: 1000 },
    ];
  }

  private planImSend(): PlannerStep[] {
    const searchSteps = this.planImSearch().slice(0, -1);
    const allowedTexts = this.task.safety.allowedMessageTexts ?? [];
    const messageText = allowedTexts[0] ?? '';

    return [
      ...searchSteps.map((s, i) => ({ ...s, index: i })),
      { index: searchSteps.length, action: 'locate_and_click', targetDescription: '消息输入框' },
      { index: searchSteps.length + 1, action: 'locate_and_type', targetDescription: '消息输入框', typeContent: messageText },
    ];
  }

  private planCalendarOpen(): PlannerStep[] {
    return [
      { index: 0, action: 'locate_and_click', targetDescription: '左侧导航日历图标' },
      { index: 1, action: 'wait', waitMs: 1500 },
    ];
  }

  private planCalendarCreate(): PlannerStep[] {
    return [
      { index: 0, action: 'locate_and_click', targetDescription: '左侧导航日历图标' },
      { index: 1, action: 'wait', waitMs: 1500 },
      { index: 2, action: 'locate_and_click', targetDescription: '空白时间格或创建按钮' },
      { index: 3, action: 'locate_and_type', targetDescription: '事件标题输入框', typeContent: this.task.safety.allowedCalendars?.[0] ?? '' },
      { index: 4, action: 'locate_and_click', targetDescription: '保存按钮' },
    ];
  }

  private planFromActions(): PlannerStep[] {
    const actions = this.task.actions ?? [];
    return actions.map((action, index) => {
      if (action.type === 'wait') {
        return { index, action: 'wait' as const, waitMs: action.waitMs, fallbackAction: action };
      }
      if (action.type === 'hotkey') {
        return { index, action: 'hotkey' as const, hotkey: action.key, fallbackAction: action };
      }
      if (action.type === 'click' || action.type === 'double_click' || action.type === 'right_click') {
        return { index, action: 'locate_and_click' as const, fallbackAction: action };
      }
      if (action.type === 'type') {
        return {
          index,
          action: 'locate_and_type' as const,
          typeContent: action.content,
          fallbackAction: action,
        };
      }
      return { index, action: 'wait' as const, waitMs: 500, fallbackAction: action };
    });
  }
}
