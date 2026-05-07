import type { OperatorAction } from '../operators/operator.js';
import type { TaskSpec } from './task-spec.js';

const FORBIDDEN_CONTENT_PATTERNS = [
  /发送/,
  /删除/,
  /移除/,
  /邀请/,
  /真实/,
  /密码/,
  /token/i,
  /api\s*key/i,
  /cookie/i,
];

const SEND_HOTKEYS = new Set(['enter', 'return', 'ctrl+enter', 'control+enter']);
const FORBIDDEN_HOTKEYS = new Set([
  'cmd+enter',
  'command+enter',
  'shift+enter',
  'delete',
  'backspace',
]);

export interface ActionSafetyResult {
  allowed: boolean;
  reason?: string;
}

export function checkActionSafety(task: TaskSpec, action: OperatorAction): ActionSafetyResult {
  if (isPointingAction(action) && !hasTargetPoint(action)) {
    return {
      allowed: false,
      reason: `${action.type} requires startBox or x/y coordinates`,
    };
  }

  if (task.safety.forbidDelete && isDeleteLike(action)) {
    return {
      allowed: false,
      reason: 'forbidDelete=true blocks delete-like action',
    };
  }

  if (action.type === 'type') {
    return checkTypeAction(task, action);
  }

  if (action.type === 'hotkey') {
    return checkHotkeyAction(task, action);
  }

  return { allowed: true };
}

function isPointingAction(action: OperatorAction): boolean {
  return ['click', 'double_click', 'right_click'].includes(action.type);
}

function hasTargetPoint(action: OperatorAction): boolean {
  return Boolean(action.startBox) || (action.x !== undefined && action.y !== undefined);
}

function checkTypeAction(task: TaskSpec, action: OperatorAction): ActionSafetyResult {
  const content = action.content ?? '';
  if (content.includes('\n') || content.includes('\\n')) {
    return {
      allowed: false,
      reason: 'type content contains newline, which may send a message',
    };
  }

  for (const pattern of FORBIDDEN_CONTENT_PATTERNS) {
    if (pattern.test(content)) {
      return {
        allowed: false,
        reason: `type content matched forbidden pattern: ${pattern.toString()}`,
      };
    }
  }

  if (isAllowedTargetText(task, content) || isAllowedMessageText(task, content)) {
    return { allowed: true };
  }

  if (hasRestrictedTarget(task)) {
    return {
      allowed: false,
      reason: 'type content must match an allowed chat/user/calendar target or allowed message text',
    };
  }

  return { allowed: true };
}

function checkHotkeyAction(task: TaskSpec, action: OperatorAction): ActionSafetyResult {
  const key = normalizeHotkey(action.key ?? '');
  if (SEND_HOTKEYS.has(key)) {
    if (!task.safety.allowSend) {
      return {
        allowed: false,
        reason: `hotkey ${action.key} may send a message and requires safety.allowSend=true`,
      };
    }
    if (!task.safety.allowedMessageTexts?.length) {
      return {
        allowed: false,
        reason: `hotkey ${action.key} requires safety.allowedMessageTexts for auditable send tasks`,
      };
    }
    return { allowed: true };
  }

  if (FORBIDDEN_HOTKEYS.has(key)) {
    return {
      allowed: false,
      reason: `hotkey ${action.key} is blocked during controlled action loop`,
    };
  }

  return { allowed: true };
}

function isDeleteLike(action: OperatorAction): boolean {
  if (action.type === 'hotkey') {
    const key = normalizeHotkey(action.key ?? '');
    return key.includes('delete') || key.includes('backspace');
  }

  const content = action.content ?? '';
  return /删除|移除|delete|remove/i.test(content);
}

function isAllowedTargetText(task: TaskSpec, content: string): boolean {
  const allowedTargets = [
    ...(task.safety.allowedChats ?? []),
    ...(task.safety.allowedUsers ?? []),
    ...(task.safety.allowedCalendars ?? []),
    ...(task.safety.allowedCalendarTitles ?? []),
  ];
  return allowedTargets.some((target) => content.includes(target));
}

function isAllowedMessageText(task: TaskSpec, content: string): boolean {
  return (task.safety.allowedMessageTexts ?? []).some((text) => content === text);
}

function hasRestrictedTarget(task: TaskSpec): boolean {
  return Boolean(
    task.safety.allowedChats?.length
      || task.safety.allowedUsers?.length
      || task.safety.allowedCalendars?.length
      || task.safety.allowedMessageTexts?.length,
  );
}

function normalizeHotkey(key: string): string {
  return key
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/control/g, 'ctrl');
}
