import { OpenAICompatibleVlmProvider } from './openai-compatible-vlm-provider.js';
import type { VlmProvider } from './vlm-provider.js';

export function createVlmProvider(): VlmProvider {
  const baseUrl = requiredEnv('VLM_BASE_URL');
  const apiKey = requiredEnv('VLM_API_KEY');
  const model = requiredEnv('VLM_MODEL');

  return new OpenAICompatibleVlmProvider({
    baseUrl,
    apiKey,
    model,
    name: process.env.VLM_PROVIDER_NAME ?? 'volcengine-ark',
  });
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required. Set it in the current shell or a local .env file that is not committed.`);
  }

  return value;
}
