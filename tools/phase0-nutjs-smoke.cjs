#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');

function parseArgs(argv) {
  const args = {
    command: 'screenshot',
    save: false,
    packageRoot: process.env.UI_TARS_NPX_ROOT || '',
    actionType: '',
    startBox: '',
    direction: '',
    key: '',
    content: '',
    delayMs: 0,
    sequenceFile: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--package-root') args.packageRoot = argv[++i] || '';
    else if (arg === '--save') args.save = true;
    else if (arg === '--action-type') args.actionType = argv[++i] || '';
    else if (arg === '--start-box') args.startBox = argv[++i] || '';
    else if (arg === '--direction') args.direction = argv[++i] || '';
    else if (arg === '--key') args.key = argv[++i] || '';
    else if (arg === '--content') args.content = argv[++i] || '';
    else if (arg === '--delay-ms') args.delayMs = Number(argv[++i] || 0);
    else if (arg === '--sequence-file') args.sequenceFile = argv[++i] || '';
    else if (!arg.startsWith('--')) args.command = arg;
  }
  return args;
}

function loadNutJSOperator(packageRoot) {
  const candidates = [
    packageRoot && path.join(packageRoot, 'node_modules', '@ui-tars', 'operator-nut-js'),
    '@ui-tars/operator-nut-js',
  ].filter(Boolean);

  const errors = [];
  for (const candidate of candidates) {
    try {
      return { candidate, NutJSOperator: require(candidate).NutJSOperator };
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }

  throw new Error(`无法加载 NutJSOperator:\n${errors.join('\n')}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { candidate, NutJSOperator } = loadNutJSOperator(args.packageRoot);
  const operator = new NutJSOperator();

  if (!['screenshot', 'execute', 'click-type', 'click-hotkey', 'sequence'].includes(args.command)) {
    throw new Error(`暂不支持命令: ${args.command}`);
  }

  if (args.delayMs > 0) {
    console.error(`等待 ${args.delayMs}ms，请切回目标飞书窗口...`);
    await new Promise((resolve) => setTimeout(resolve, args.delayMs));
  }

  // Phase 0 只先验证截图链路；默认不落盘，避免保存敏感桌面内容。
  const startedAt = Date.now();
  const shot = await operator.screenshot();
  const elapsedMs = Date.now() - startedAt;
  const imageBytes = Buffer.from(shot.base64, 'base64');

  const result = {
    ok: true,
    command: args.command,
    operatorPackage: candidate,
    scaleFactor: shot.scaleFactor,
    imageBytes: imageBytes.length,
    elapsedMs,
    savedPath: null,
    savedBeforePath: null,
    savedAfterPath: null,
  };

  if (args.save) {
    const outputDir = path.join(process.cwd(), 'artifacts', 'phase0');
    fs.mkdirSync(outputDir, { recursive: true });
    const outputPath = path.join(outputDir, `screenshot-before-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
    fs.writeFileSync(outputPath, imageBytes);
    result.savedPath = outputPath;
    result.savedBeforePath = outputPath;
  }

  if (args.command === 'execute' || args.command === 'click-type' || args.command === 'click-hotkey' || args.command === 'sequence') {
    if (args.command === 'sequence') {
      if (!args.content && !args.sequenceFile) {
        throw new Error('sequence 需要 --content 或 --sequence-file 指向 JSON 动作数组');
      }
      const jsonText = args.sequenceFile
        ? fs.readFileSync(path.resolve(process.cwd(), args.sequenceFile), 'utf-8')
        : args.content;
      const actions = JSON.parse(jsonText);
      if (!Array.isArray(actions)) throw new Error('sequence JSON 必须是动作数组');

      result.executed = [];
      for (const action of actions) {
        await operator.execute({
          parsedPrediction: {
            action_type: action.action_type,
            action_inputs: action.action_inputs || {},
          },
          screenWidth: 2048,
          screenHeight: 1152,
          scaleFactor: shot.scaleFactor,
        });
        result.executed.push(action);
        await new Promise((resolve) => setTimeout(resolve, action.wait_ms ?? 300));
      }
      if (args.save) {
        const after = await operator.screenshot();
        const afterBytes = Buffer.from(after.base64, 'base64');
        const outputDir = path.join(process.cwd(), 'artifacts', 'phase0');
        const outputPath = path.join(outputDir, `screenshot-after-${new Date().toISOString().replace(/[:.]/g, '-')}.png`);
        fs.writeFileSync(outputPath, afterBytes);
        result.savedAfterPath = outputPath;
        result.savedPath = outputPath;
      }
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (args.command === 'click-type') {
      if (!args.startBox || !args.content) throw new Error('click-type 需要 --start-box 和 --content');
      await operator.execute({
        parsedPrediction: {
          action_type: 'click',
          action_inputs: { start_box: args.startBox },
        },
        screenWidth: 2048,
        screenHeight: 1152,
        scaleFactor: shot.scaleFactor,
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      await operator.execute({
        parsedPrediction: {
          action_type: 'type',
          action_inputs: { content: args.content },
        },
        screenWidth: 2048,
        screenHeight: 1152,
        scaleFactor: shot.scaleFactor,
      });
      result.executed = {
        actionType: 'click-type',
        actionInputs: {
          start_box: args.startBox,
          content: args.content,
        },
      };
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (args.command === 'click-hotkey') {
      if (!args.startBox || !args.key) throw new Error('click-hotkey 需要 --start-box 和 --key');
      await operator.execute({
        parsedPrediction: {
          action_type: 'click',
          action_inputs: { start_box: args.startBox },
        },
        screenWidth: 2048,
        screenHeight: 1152,
        scaleFactor: shot.scaleFactor,
      });
      await new Promise((resolve) => setTimeout(resolve, 250));
      await operator.execute({
        parsedPrediction: {
          action_type: 'hotkey',
          action_inputs: { key: args.key },
        },
        screenWidth: 2048,
        screenHeight: 1152,
        scaleFactor: shot.scaleFactor,
      });
      result.executed = {
        actionType: 'click-hotkey',
        actionInputs: {
          start_box: args.startBox,
          key: args.key,
        },
      };
      console.log(JSON.stringify(result, null, 2));
      return;
    }

    if (!args.actionType) throw new Error('execute 需要 --action-type');
    const actionInputs = {};
    if (args.startBox) actionInputs.start_box = args.startBox;
    if (args.direction) actionInputs.direction = args.direction;
    if (args.key) actionInputs.key = args.key;
    if (args.content) actionInputs.content = args.content;

    // Phase 0 动作必须显式传入，便于审计坐标、输入内容和风险。
    await operator.execute({
      parsedPrediction: {
        action_type: args.actionType,
        action_inputs: actionInputs,
      },
      screenWidth: 2048,
      screenHeight: 1152,
      scaleFactor: shot.scaleFactor,
    });
    result.executed = {
      actionType: args.actionType,
      actionInputs,
    };
  }

  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
