import 'dotenv/config';

import { createVlmProvider } from '../models/create-vlm-provider.js';
import { parseVlmAction } from '../models/parse-vlm-action.js';
import { createSolidPngBase64 } from '../utils/png.js';

const SMOKE_PNG_BASE64 = createSolidPngBase64(32, 32, [255, 80, 80, 255]);

async function main(): Promise<void> {
  const provider = createVlmProvider();

  const textSmoke = await provider.complete({
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: '连通性测试：请只回复 OK。',
      },
    ],
  });

  const actionSmoke = await provider.complete({
    temperature: 0,
    image: {
      base64: SMOKE_PNG_BASE64,
      mimeType: 'image/png',
    },
    messages: [
      {
        role: 'system',
        content:
          '你是 CUA-Lark 的 GUI 测试动作规划器。必须只输出一个 JSON object，不要输出 Markdown。',
      },
      {
        role: 'user',
        content:
          '这是一张无敏感测试图片。请输出一个等待动作 JSON，格式严格为 {"type":"wait","waitMs":500}。',
      },
    ],
  });

  const parsedAction = parseVlmAction(actionSmoke.content);

  console.log(
    JSON.stringify(
      {
        ok: true,
        provider: provider.name,
        model: provider.model,
        textSmoke: {
          latencyMs: textSmoke.latencyMs,
          content: textSmoke.content.trim().slice(0, 120),
          usage: textSmoke.usage,
        },
        actionSmoke: {
          latencyMs: actionSmoke.latencyMs,
          content: actionSmoke.content.trim().slice(0, 500),
          parsedAction: parsedAction.action,
          usage: actionSmoke.usage,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
