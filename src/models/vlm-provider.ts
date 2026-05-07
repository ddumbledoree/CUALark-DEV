import type { OperatorAction } from '../operators/operator.js';

export interface VlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface VlmImageInput {
  base64: string;
  mimeType: 'image/png' | 'image/jpeg';
}

export interface VlmRequest {
  messages: VlmMessage[];
  image?: VlmImageInput;
  temperature?: number;
}

export interface VlmResponse {
  content: string;
  model: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  latencyMs: number;
}

export interface VlmProvider {
  name: string;
  model: string;
  complete(request: VlmRequest): Promise<VlmResponse>;
}

export interface ParsedVlmAction {
  action: OperatorAction;
  rawJson: unknown;
}
