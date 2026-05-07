import type { VlmProvider, VlmRequest, VlmResponse } from './vlm-provider.js';

interface OpenAICompatibleProviderOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  name?: string;
}

interface ChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

type MessageContent =
  | string
  | Array<
      | {
          type: 'text';
          text: string;
        }
      | {
          type: 'image_url';
          image_url: {
            url: string;
          };
        }
    >;

export class OpenAICompatibleVlmProvider implements VlmProvider {
  readonly name: string;
  readonly model: string;

  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(options: OpenAICompatibleProviderOptions) {
    this.name = options.name ?? 'openai-compatible';
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.apiKey = options.apiKey;
    this.model = options.model;
  }

  async complete(request: VlmRequest): Promise<VlmResponse> {
    const started = Date.now();
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        temperature: request.temperature ?? 0,
        messages: request.messages.map((message, index) => ({
          role: message.role,
          content: buildContent(message.content, index === request.messages.length - 1 ? request.image : undefined),
        })),
      }),
    });

    const text = await response.text();
    const parsed = parseJson(text) as ChatCompletionResponse;

    if (!response.ok) {
      const message = parsed.error?.message ?? text;
      throw new Error(`VLM request failed with HTTP ${response.status}: ${message}`);
    }

    const content = parsed.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error(`VLM response missing choices[0].message.content: ${text}`);
    }

    return {
      content,
      model: parsed.model ?? this.model,
      usage: {
        promptTokens: parsed.usage?.prompt_tokens,
        completionTokens: parsed.usage?.completion_tokens,
        totalTokens: parsed.usage?.total_tokens,
      },
      latencyMs: Date.now() - started,
    };
  }
}

function buildContent(text: string, image?: VlmRequest['image']): MessageContent {
  if (!image) {
    return text;
  }

  return [
    {
      type: 'text',
      text,
    },
    {
      type: 'image_url',
      image_url: {
        url: `data:${image.mimeType};base64,${image.base64}`,
      },
    },
  ];
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`VLM response is not JSON: ${text.slice(0, 500)}`);
  }
}
