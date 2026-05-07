import type { OperatorAction, OperatorActionType } from '../operators/operator.js';
import type { ParsedVlmAction } from './vlm-provider.js';

const SUPPORTED_ACTION_TYPES = new Set<OperatorActionType>([
  'click',
  'double_click',
  'right_click',
  'type',
  'hotkey',
  'scroll',
  'wait',
  'finished',
]);

interface RawAction {
  type?: unknown;
  startBox?: unknown;
  start_box?: unknown;
  x?: unknown;
  y?: unknown;
  position?: unknown;
  coord?: unknown;
  content?: unknown;
  key?: unknown;
  direction?: unknown;
  waitMs?: unknown;
  wait_ms?: unknown;
}

export function parseVlmAction(content: string): ParsedVlmAction {
  const rawJson = parseJsonObject(extractJson(content));
  const rawAction = rawJson as RawAction;
  const type = readActionType(rawAction.type);

  const action: OperatorAction = { type };
  const startBox = readOptionalString(rawAction.startBox ?? rawAction.start_box, 'startBox');
  const point = readOptionalPoint(rawAction);
  const textContent = readOptionalString(rawAction.content, 'content');
  const key = readOptionalString(rawAction.key, 'key');
  const direction = readOptionalDirection(rawAction.direction);
  const waitMs = readOptionalNumber(rawAction.waitMs ?? rawAction.wait_ms, 'waitMs');

  if (startBox) action.startBox = startBox;
  if (point) {
    action.x = point.x;
    action.y = point.y;
  }
  if (textContent) action.content = textContent;
  if (key) action.key = key;
  if (direction) action.direction = direction;
  if (waitMs !== undefined) action.waitMs = waitMs;

  return { action, rawJson };
}

function readOptionalPoint(rawAction: RawAction): { x: number; y: number } | undefined {
  const arrayPoint = rawAction.position ?? rawAction.coord;
  if (Array.isArray(arrayPoint)) {
    if (arrayPoint.length < 2) {
      throw new Error('VLM action position must contain [x, y].');
    }

    return {
      x: readRequiredNumber(arrayPoint[0], 'position[0]'),
      y: readRequiredNumber(arrayPoint[1], 'position[1]'),
    };
  }

  if (rawAction.x !== undefined || rawAction.y !== undefined) {
    return {
      x: readRequiredNumber(rawAction.x, 'x'),
      y: readRequiredNumber(rawAction.y, 'y'),
    };
  }

  return undefined;
}

function extractJson(content: string): string {
  const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return content.slice(start, end + 1);
  }

  return content.trim();
}

function parseJsonObject(text: string): unknown {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('VLM action must be a JSON object.');
  }

  return parsed;
}

function readActionType(value: unknown): OperatorActionType {
  if (typeof value !== 'string') {
    throw new Error('VLM action missing string field: type');
  }

  if (!SUPPORTED_ACTION_TYPES.has(value as OperatorActionType)) {
    throw new Error(`Unsupported VLM action type: ${value}`);
  }

  return value as OperatorActionType;
}

function readOptionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`VLM action field ${field} must be a string.`);
  }

  return value;
}

function readOptionalDirection(value: unknown): OperatorAction['direction'] | undefined {
  const direction = readOptionalString(value, 'direction');
  if (!direction) {
    return undefined;
  }

  if (!['up', 'down', 'left', 'right'].includes(direction)) {
    throw new Error(`Unsupported scroll direction: ${direction}`);
  }

  return direction as OperatorAction['direction'];
}

function readOptionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`VLM action field ${field} must be a finite number.`);
  }

  return value;
}

function readRequiredNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`VLM action field ${field} must be a finite number.`);
  }

  return value;
}
