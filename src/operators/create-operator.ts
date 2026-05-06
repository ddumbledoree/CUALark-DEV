import { MockOperator } from './mock-operator.js';
import type { CuaOperator } from './operator.js';

export function createOperator(name = 'mock'): CuaOperator {
  switch (name) {
    case 'mock':
      return new MockOperator();
    default:
      throw new Error(`Operator ${name} is not wired in Phase 1. Use CUA_OPERATOR=mock.`);
  }
}
