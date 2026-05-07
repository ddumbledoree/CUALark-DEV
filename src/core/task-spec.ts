import type { OperatorAction } from '../operators/operator.js';

export type TargetProduct = 'im' | 'calendar' | 'docs' | 'base' | 'vc' | 'mail';

export type UiType = 'icon' | 'button' | 'input' | 'list_item' | 'link' | 'tab' | 'text_field';
export type RegionHint = 'left_sidebar' | 'top_bar' | 'main_content' | 'right_panel' | 'bottom_bar';

export interface TaskStep {
  action: 'locate_and_click' | 'locate_and_type' | 'click' | 'type' | 'wait' | 'hotkey';
  targetDescription?: string;
  typeContent?: string;
  hotkey?: string;
  waitMs?: number;
  x?: number;
  y?: number;
  uiType?: UiType;
  regionHint?: RegionHint;
  nearbyText?: string;
  expectedState?: string;
}

export type EvaluatorSpec =
  | {
      type: 'manual';
      checklist: string[];
    }
  | {
      type: 'mock';
      expectedStatus: 'passed' | 'failed';
    }
  | {
      type: 'vlm_screenshot';
      question: string;
      expectedAnswer: 'passed' | 'failed';
    }
  | {
      type: 'feishu_im_message_check';
      expectedText: string;
      larkCliArgs: string[];
      timeoutMs?: number;
      pollIntervalMs?: number;
      chatId?: string;
      chatName?: string;
    }
  | {
      type: 'feishu_calendar_event_check';
      expectedTitle: string;
      larkCliArgs: string[];
      timeoutMs?: number;
      pollIntervalMs?: number;
      calendarId?: string;
      calendarName?: string;
      expectedStartText?: string;
      expectedEndText?: string;
      expectedAttendee?: string;
    };

export interface TaskSpec {
  id: string;
  title: string;
  targetProduct: TargetProduct;
  instruction: string;
  initialState: string;
  expectedResult: string;
  safety: {
    allowedChats?: string[];
    allowedUsers?: string[];
    allowedCalendars?: string[];
    allowedCalendarTitles?: string[];
    allowedMessageTexts?: string[];
    allowSend?: boolean;
    forbidDelete: boolean;
  };
  actions?: OperatorAction[];
  steps?: TaskStep[];
  evaluator: EvaluatorSpec;
}

export interface TaskRunResult {
  taskId: string;
  status: 'passed' | 'failed' | 'blocked';
  operator: string;
  tracePath: string;
  startedAt: string;
  endedAt: string;
  observations: string[];
}
