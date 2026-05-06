# AGENTS.md

## Project identity

This project is CUA-Lark: a Computer-Use Agent for Feishu/Lark GUI testing.

The goal is to build an agent that can:
- observe Feishu/Lark UI through screenshots;
- understand natural-language test instructions;
- plan and execute GUI actions;
- verify results after execution;
- generate test reports with traces, success rate, latency, and failure reasons.

The project must stay aligned with the official CUA-Lark PDF requirements:
- visual perception;
- semantic instruction understanding;
- autonomous GUI operation;
- state verification;
- evaluation report generation;
- at least two Feishu/Lark sub-products covered.

## Working agreements

- Read existing code, docs, and tests before modifying anything.
- Prefer the smallest useful change.
- Do not perform unrelated refactors.
- After modifying code, run the smallest relevant validation first.
- Every final report must include evidence: changed files, commands run, test results, or observed outputs.
- Record phase acceptance evidence and necessary screenshots in `DEV_NOTES.md`; if the evidence already exists, do not duplicate it.
- Keep project files, spike scripts, screenshots, traces, reports, and generated artifacts inside the workspace path whenever possible; avoid writing to C: unless a tool or OS requirement forces it.
- If a task is ambiguous, make a reasonable assumption and state it briefly instead of blocking.

## Development priority

Build in this order:

1. Minimal agent loop:
   screenshot → model reasoning → action parse → execute → observe again.

2. Operator layer:
   implement screenshot() and execute(action) cleanly.
   Keep the Agent Core independent from whether the backend is desktop, browser, or mock.

3. Task schema:
   define structured test cases with:
   - instruction
   - initial state
   - target product
   - expected result
   - evaluator

4. Evaluation:
   every demo task must have automatic or semi-automatic verification.
   Avoid demos that only “look successful” without evidence.

5. Reports:
   save traces, screenshots, actions, latency, token usage if available, and final status.

## Architecture principles

- Separate Agent Core, Operator, Evaluator, Report Generator, and UI/Dashboard.
- Do not hard-code Feishu-specific logic inside generic agent loop code.
- Prefer dependency injection for model provider, operator backend, and evaluator.
- Keep actions typed and auditable.
- Store task traces in a machine-readable format such as JSONL.

## Safety and test data rules

- Never use real private contacts, real company chats, or sensitive documents in tests.
- Use dedicated test accounts, test groups, and test documents.
- Do not delete user data unless the task explicitly uses disposable test data.
- Do not commit API keys, cookies, tokens, screenshots containing private data, or `.env` files.
- Add `.env.example` when new environment variables are needed.

## Recommended technical direction

Primary stack:
- TypeScript
- Playwright or desktop automation backend
- VLM API through a provider abstraction
- JSON/JSONL task and trace files
- Markdown or HTML report generation

Acceptable fallback:
- Python tools for offline evaluation, report analysis, or dataset processing.

## Validation commands

When relevant, run:

```bash
npm run lint
npm run typecheck
npm test
```

If these scripts do not exist yet, create minimal versions before relying on them.

## Definition of done

A task is done only when:

- code is implemented;
- a minimal validation was run;
- results are recorded;
- limitations are documented;
- next steps are clear.

## Do not do

- Do not build a large frontend before the agent loop works.
- Do not fine-tune models before a baseline API-driven agent works.
- Do not mix Codex config with project business config.
- Do not silently bypass failing tests.
- Do not claim “fully autonomous” unless evaluation data supports it.
