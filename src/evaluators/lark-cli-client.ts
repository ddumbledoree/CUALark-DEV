import { spawn } from 'node:child_process';

export interface LarkCliRunResult {
  ok: boolean;
  stdoutText: string;
  stdoutJson?: unknown;
  stderrText: string;
  exitCode: number | null;
}

export interface LarkCliClient {
  run(args: string[], options?: { timeoutMs?: number }): Promise<LarkCliRunResult>;
}

export interface LarkCliClientOptions {
  bin: string;
  defaultTimeoutMs: number;
}

export function createLarkCliClientFromEnv(env: NodeJS.ProcessEnv = process.env): LarkCliClient {
  return new ProcessLarkCliClient({
    bin: env.LARK_CLI_BIN ?? 'lark-cli',
    defaultTimeoutMs: parsePositiveInteger(env.CUA_EVALUATOR_TIMEOUT_MS, 10000),
  });
}

export class ProcessLarkCliClient implements LarkCliClient {
  private readonly bin: string;
  private readonly defaultTimeoutMs: number;

  constructor(options: LarkCliClientOptions) {
    this.bin = options.bin;
    this.defaultTimeoutMs = options.defaultTimeoutMs;
  }

  run(args: string[], options: { timeoutMs?: number } = {}): Promise<LarkCliRunResult> {
    const timeoutMs = options.timeoutMs ?? this.defaultTimeoutMs;

    return new Promise((resolve) => {
      const child = spawn(this.bin, args, {
        shell: shouldUseShell(this.bin),
        windowsHide: true,
      });
      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];
      let settled = false;

      const timer = setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        child.kill();
        resolve({
          ok: false,
          stdoutText: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderrText: `lark-cli timed out after ${timeoutMs}ms`,
          exitCode: null,
        });
      }, timeoutMs);

      child.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
      child.on('error', (error) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve({
          ok: false,
          stdoutText: Buffer.concat(stdoutChunks).toString('utf-8'),
          stderrText: error.message,
          exitCode: null,
        });
      });
      child.on('close', (exitCode) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        const stdoutText = Buffer.concat(stdoutChunks).toString('utf-8');
        const stderrText = Buffer.concat(stderrChunks).toString('utf-8');
        resolve({
          ok: exitCode === 0,
          stdoutText,
          stdoutJson: parseJson(stdoutText),
          stderrText,
          exitCode,
        });
      });
    });
  }
}

function shouldUseShell(bin: string): boolean {
  return process.platform === 'win32' && /\.(cmd|bat)$/i.test(bin);
}

function parseJson(text: string): unknown | undefined {
  const trimmed = text.trim();
  if (!trimmed) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
