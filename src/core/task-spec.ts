export type TargetProduct = 'im' | 'calendar' | 'docs' | 'base' | 'vc' | 'mail';

export type EvaluatorSpec =
  | {
      type: 'manual';
      checklist: string[];
    }
  | {
      type: 'mock';
      expectedStatus: 'passed' | 'failed';
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
    forbidDelete: boolean;
  };
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
