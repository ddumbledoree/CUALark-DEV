import 'dotenv/config';

import { createLarkCliClientFromEnv } from '../evaluators/lark-cli-client.js';

async function main(): Promise<void> {
  const client = createLarkCliClientFromEnv();
  const result = await client.run(['auth', 'status']);

  console.log(JSON.stringify({
    ok: result.ok,
    exitCode: result.exitCode,
    stdoutJson: result.stdoutJson,
    stderrText: result.stderrText,
  }, null, 2));

  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
