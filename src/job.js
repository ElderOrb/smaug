/**
 * Smaug Scheduled Job
 *
 * Full two-phase workflow:
 * 1. Fetch bookmarks, expand links, extract content
 * 2. Invoke Claude Code or OpenCode CLI for analysis and filing
 *
 * Can be used with:
 * - Cron: "0,30 * * * *" (every 30 min) - node /path/to/smaug/src/job.js
 * - Bree: Import and add to your Bree jobs array
 * - systemd timers: See README for setup
 * - Any other scheduler
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fetchAndPrepareBookmarks } from './processor.js';
import { loadConfig } from './config.js';

const JOB_NAME = 'smaug';
const LOCK_FILE = path.join(os.tmpdir(), 'smaug.lock');

function acquireLock() {
  if (fs.existsSync(LOCK_FILE)) {
    try {
      const { pid, timestamp } = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      try {
        process.kill(pid, 0);
        const age = Date.now() - timestamp;
        if (age < 20 * 60 * 1000) {
          console.log(`[${JOB_NAME}] Previous run still in progress (PID ${pid}). Skipping.`);
          return false;
        }
        console.log(`[${JOB_NAME}] Stale lock found (${Math.round(age / 60000)}min old). Overwriting.`);
      } catch (e) {
        console.log(`[${JOB_NAME}] Removing stale lock (PID ${pid} no longer running)`);
      }
    } catch (e) {
    }
    fs.unlinkSync(LOCK_FILE);
  }
  fs.writeFileSync(LOCK_FILE, JSON.stringify({ pid: process.pid, timestamp: Date.now() }));
  return true;
}

function releaseLock() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const { pid } = JSON.parse(fs.readFileSync(LOCK_FILE, 'utf8'));
      if (pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch (e) {}
}

function findOpenCode() {
  const possiblePaths = [
    path.join(process.env.APPDATA || '', 'Roaming', 'npm', 'opencode.cmd'),
    path.join(process.env.LOCALAPPDATA || '', 'npm', 'opencode.cmd'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'npm', 'opencode.cmd'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'opencode.exe'),
    path.join(process.env.PROGRAMFILES || '', 'OpenCode', 'opencode.exe'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'opencode.exe'),
    '/usr/local/bin/opencode',
    '/opt/homebrew/bin/opencode',
    path.join(process.env.HOME || '', '.local/bin/opencode'),
  ];

  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return 'opencode';
}

async function invokeOpenCodeCLI(config, bookmarkCount, options = {}, modelName) {
  const timeout = config.claudeTimeout || 900000;
  const trackTokens = options.trackTokens || false;
  const openCodeModel = modelName || config.opencodeModel || 'opencode/glm-4.7-free';

  let opencodePath = findOpenCode();

  const showDragonReveal = async (totalBookmarks) => {
    process.stdout.write('\n');
    const fireFramesIntro = ['🔥', '🔥🔥', '🔥🔥🔥', '🔥🔥🔥🔥', '🔥🔥🔥🔥🔥'];
    for (let i = 0; i < 10; i++) {
      const frame = fireFramesIntro[i % fireFramesIntro.length];
      process.stdout.write(`\r  ${frame.padEnd(12)}`);
      await new Promise(r => setTimeout(r, 150));
    }

    process.stdout.write('\r                    \r');
    process.stdout.write(`  Wait... that's not Claude... it's

   🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥
        _____ __  __   _   _   _  ____
       / ____|  \/  | / \ | | | |/ ___|
       \___ \| |\/| |/ _ \| | | | |  _
        ___) | |  | / ___ \ |_| | |_| |
       |____/|_|  |_/_/  \_\___/ \____|

   🐉 The dragon stirs... ${totalBookmarks} treasure${totalBookmarks !== 1 ? 's' : ''} to hoard!
  `);
  };

  await showDragonReveal(bookmarkCount);

  return new Promise((resolve) => {
    const args = [
      'run',
      '--format', 'json',
      '--model', openCodeModel,
      '--',
      'Process the ${bookmarkCount} bookmark(s) in ./.state/pending-bookmarks.json following the instructions in ./.claude/commands/process-bookmarks.md. Read that file first, then process each bookmark.'
    ];

    const nodePaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      path.join(process.env.HOME || '', 'Library/Application Support/Herd/config/nvm/versions/node/v20.19.4/bin'),
      path.join(process.env.HOME || '', '.local/bin'),
      path.join(process.env.HOME || '', '.bun/bin'),
    ];
    const enhancedPath = [...nodePaths, process.env.PATH || ''].join(path.delimiter);

    const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;

    console.log('[DEBUG] Spawning OpenCode CLI...');
    console.log('[DEBUG] opencodePath:', opencodePath);
    console.log('[DEBUG] Full args array:', JSON.stringify(args, null, 2));

    const proc = spawn(opencodePath, args, {
      cwd: config.projectRoot || process.cwd(),
      env: {
        ...process.env,
        PATH: enhancedPath,
        ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
        OPENCODE_MODEL: openCodeModel
      },
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    let stdout = '';
    let stderr = '';
    let lastText = '';
    let filesWritten = [];
    let bookmarksProcessed = 0;
    let totalBookmarks = bookmarkCount;

    const parallelTasks = new Map();
    let tasksSpawned = 0;
    let tasksCompleted = 0;

    const tokenUsage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      subagentInput: 0,
      subagentOutput: 0,
      model: modelName || 'opencode',
      subagentModel: null
    };

    const startTime = Date.now();
    const elapsed = () => {
      const ms = Date.now() - startTime;
      const secs = Math.floor(ms / 1000);
      return secs < 60 ? `${secs}s` : `${Math.floor(secs/60)}m ${secs%60}s`;
    };

    const progressBar = (current, total, width = 20) => {
      const pct = Math.min(current / total, 1);
      const filled = Math.round(pct * width);
      const empty = width - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      return `[${bar}] ${current}/${total}`;
    };

    const dragonSays = [
      '🐉 *sniff sniff* Fresh bookmarks detected...',
      '🔥 Breathing fire on these tweets...',
      '💎 Adding treasures to the hoard...',
      '🏔️ Guarding the mountain of knowledge...',
      '⚔️ Vanquishing duplicate bookmarks...',
      '🌋 The dragon\'s flames illuminate the data...',
    ];
    let dragonMsgIndex = 0;
    const nextDragonMsg = () => dragonSays[dragonMsgIndex++ % dragonSays.length];

    const shownMessages = new Set();

    const fireFrames = [
      '  🔥    ',
      ' 🔥🔥   ',
      '🔥🔥🔥  ',
      ' 🔥🔥🔥 ',
      '  🔥🔥🔥',
      '   🔥🔥 ',
      '    🔥  ',
      '   🔥   ',
      '  🔥🔥  ',
      ' 🔥 🔥  ',
      '🔥  🔥  ',
      '🔥   🔥 ',
      ' 🔥  🔥 ',
      '  🔥 🔥 ',
      '   🔥🔥 ',
    ];
    const spinnerMessages = [
      'Breathing fire on bookmarks',
      'Examining the treasures',
      'Sorting the hoard',
      'Polishing the gold',
      'Counting coins',
      'Guarding the lair',
      'Hunting for gems',
      'Cataloging riches',
    ];
    let fireFrame = 0;
    let spinnerMsgFrame = 0;
    let lastSpinnerLine = '';
    let spinnerActive = true;
    let currentSpinnerMsg = spinnerMessages[0];

    const msgInterval = setInterval(() => {
      if (!spinnerActive) return;
      spinnerMsgFrame = (spinnerMsgFrame + 1) % spinnerMessages.length;
      currentSpinnerMsg = spinnerMessages[spinnerMsgFrame];
    }, 10000);

    const spinnerInterval = setInterval(() => {
      if (!spinnerActive) return;
      fireFrame = (fireFrame + 1) % fireFrames.length;
      const flame = fireFrames[fireFrame];
      const spinnerLine = `\r  ${flame} ${currentSpinnerMsg}... [${elapsed()}]`;
      process.stdout.write(spinnerLine + '          ');
      lastSpinnerLine = spinnerLine;
    }, 150);

    process.stdout.write('\n  ⏳ Dragons are patient hunters... this may take a moment.\n');
    lastSpinnerLine = '  🔥     Processing...';
    process.stdout.write(lastSpinnerLine);

    const printStatus = (msg) => {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      process.stdout.write(msg);
    };

    const stopSpinner = () => {
      spinnerActive = false;
      clearInterval(spinnerInterval);
      clearInterval(msgInterval);
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    };

    let lineBuffer = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;

      lineBuffer += text;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        if (!line.startsWith('{')) continue;

        try {
          const event = JSON.parse(line);

          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text' && block.text !== lastText) {
                const newPart = block.text.slice(lastText.length);
                if (newPart && newPart.length > 50) {
                  if (newPart.includes('Processed') && newPart.includes('bookmark')) {
                    process.stdout.write(`\n💬 ${newPart.trim().slice(0, 200)}${newPart.length > 200 ? '...' : ''}\n`);
                  }
                }
                lastText = block.text;
              }

              if (block.type === 'tool_use') {
                const toolName = block.name;
                const input = block.input || {};

                if (toolName === 'Write' && input.file_path) {
                  const fileName = input.file_path.split('/').pop();
                  const dir = input.file_path.includes('/knowledge/tools/') ? 'tools' :
                             input.file_path.includes('/knowledge/articles/') ? 'articles' : '';
                  filesWritten.push(fileName);
                  if (dir) {
                    printStatus(`    💎 Hoarded → ${dir}/${fileName}\n`);
                  } else if (fileName === 'bookmarks.md') {
                    bookmarksProcessed++;
                    const fireIntensity = '🔥'.repeat(Math.min(Math.ceil(bookmarksProcessed / 2), 5));
                    printStatus(`  ${fireIntensity} ${progressBar(bookmarksProcessed, totalBookmarks)} [${elapsed()}]`);
                  } else {
                    printStatus(`    💎 ${fileName}\n`);
                  }
                } else if (toolName === 'Edit' && input.file_path) {
                  const fileName = input.file_path.split('/').pop();
                  if (fileName === 'bookmarks.md') {
                    bookmarksProcessed++;
                    const fireIntensity = '🔥'.repeat(Math.min(Math.ceil(bookmarksProcessed / 2), 5));
                    printStatus(`  ${fireIntensity} ${progressBar(bookmarksProcessed, totalBookmarks)} [${elapsed()}]`);
                  } else if (fileName === 'pending-bookmarks.json') {
                    printStatus(`  🐉 *licks claws clean* Tidying the lair...\n`);
                  }
                } else if (toolName === 'Read' && input.file_path) {
                  const fileName = input.file_path.split('/').pop();
                  if (fileName === 'pending-bookmarks.json' && !shownMessages.has('eye')) {
                    shownMessages.add('eye');
                    printStatus(`  👁️  The dragon's eye opens... surveying treasures...\n`);
                  } else if (fileName === 'process-bookmarks.md' && !shownMessages.has('scrolls')) {
                    shownMessages.add('scrolls');
                    printStatus(`  📜 Consulting the ancient scrolls...\n`);
                  }
                } else if (toolName === 'Task') {
                  const desc = input.description || `batch ${tasksSpawned + 1}`;
                  const taskKey = `task-${desc}`;
                  if (!parallelTasks.has(taskKey)) {
                    tasksSpawned++;
                    parallelTasks.set(taskKey, {
                      description: desc,
                      startTime: Date.now(),
                      status: 'running'
                    });
                    printStatus(`  🐲 Summoning dragon minion: ${desc}\n`);
                    if (tasksSpawned > 1) {
                      printStatus(`     🔥 ${tasksSpawned} dragons now circling the hoard\n`);
                    }
                  }
                } else if (toolName === 'Bash') {
                  const cmd = input.command || '';
                  if (cmd.includes('jq') && cmd.includes('bookmarks')) {
                    printStatus(`  ⚡ ${nextDragonMsg()}\n`);
                  }
                }
              }
            }
          }

          if (event.type === 'user' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_result' && !block.is_error && block.tool_use_id) {
                const content = typeof block.content === 'string' ? block.content : '';
                const toolId = block.tool_use_id;
                if ((content.includes('Processed') || content.includes('completed')) &&
                    !shownMessages.has(`task-done-${toolId}`)) {
                  shownMessages.add(`task-done-${toolId}`);
                  tasksCompleted++;
                  if (tasksSpawned > 0 && tasksCompleted <= tasksSpawned) {
                    const pct = Math.round((tasksCompleted / tasksSpawned) * 100);
                    const flames = '🔥'.repeat(Math.ceil(pct / 20));
                    printStatus(`  🐲 Dragon minion returns! ${flames} (${tasksCompleted}/${tasksSpawned})\n`);
                  }
                }
              }
            }
          }

          if (event.type === 'result' && event.usage) {
            tokenUsage.input = event.usage.input_tokens || 0;
            tokenUsage.output = event.usage.output_tokens || 0;
            tokenUsage.cacheRead = event.usage.cache_read_input_tokens || 0;
            tokenUsage.cacheWrite = event.usage.cache_creation_input_tokens || 0;
          }

          if (event.type === 'user' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_result' && block.content) {
                const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
                const usageMatch = content.match(/usage.*?input.*?(\d+).*?output.*?(\d+)/i);
                if (usageMatch) {
                  tokenUsage.subagentInput += parseInt(usageMatch[1], 10);
                  tokenUsage.subagentOutput += parseInt(usageMatch[2], 10);
                }
                if (!tokenUsage.subagentModel && content.includes('haiku')) {
                  tokenUsage.subagentModel = 'haiku';
                } else if (!tokenUsage.subagentModel && content.includes('sonnet')) {
                  tokenUsage.subagentModel = 'sonnet';
                }
              }
            }
          }

          if (event.type === 'result') {
            stopSpinner();

            const hoardDescriptions = {
              small: [
                'A Few Coins',
                'Sparse',
                'Humble Beginnings',
                'First Treasures',
                'A Modest Start'
              ],
              medium: [
                'Glittering',
                'Growing Nicely',
                'Respectable Pile',
                'Gleaming Hoard',
                'Handsome Collection'
              ],
              large: [
                'Overflowing',
                'Mountain of Gold',
                'Legendary Hoard',
                'Dragon\'s Fortune',
                'Vast Riches'
              ]
            };

            const tier = totalBookmarks > 15 ? 'large' : totalBookmarks > 7 ? 'medium' : 'small';
            const descriptions = hoardDescriptions[tier];
            const hoardStatus = descriptions[Math.floor(Math.random() * descriptions.length)];

            let tokenDisplay = '';
            if (trackTokens && (tokenUsage.input > 0 || tokenUsage.output > 0)) {
              const pricing = {
                'sonnet': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
                'haiku': { input: 0.25, output: 1.25, cacheRead: 0.025, cacheWrite: 0.30 },
                'opus': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 }
              };

              const mainPricing = pricing[tokenUsage.model] || pricing.sonnet;
              const subPricing = pricing[tokenUsage.subagentModel || tokenUsage.model] || mainPricing;

              const mainInputCost = (tokenUsage.input / 1_000_000) * mainPricing.input;
              const mainOutputCost = (tokenUsage.output / 1_000_000) * mainPricing.output;
              const cacheReadCost = (tokenUsage.cacheRead / 1_000_000) * mainPricing.cacheRead;
              const cacheWriteCost = (tokenUsage.cacheWrite / 1_000_000) * mainPricing.cacheWrite;
              const subInputCost = (tokenUsage.subagentInput / 1_000_000) * subPricing.input;
              const subOutputCost = (tokenUsage.subagentOutput / 1_000_000) * subPricing.output;

              const totalCost = mainInputCost + mainOutputCost + cacheReadCost + cacheWriteCost + subInputCost + subOutputCost;

              const formatNum = (n) => n.toLocaleString();
              const formatCost = (c) => c < 0.01 ? '<$0.01' : `$${c.toFixed(2)}`;

              tokenDisplay = `
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📊 TOKEN USAGE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Main (${tokenUsage.model}):
     Input:       ${formatNum(tokenUsage.input).padStart(10)} tokens  ${formatCost(mainInputCost)}
     Output:      ${formatNum(tokenUsage.output).padStart(10)} tokens  ${formatCost(mainOutputCost)}
     Cache Read:  ${formatNum(tokenUsage.cacheRead).padStart(10)} tokens  ${formatCost(cacheReadCost)}
     Cache Write: ${formatNum(tokenUsage.cacheWrite).padStart(10)} tokens  ${formatCost(cacheWriteCost)}
 ${tokenUsage.subagentInput > 0 || tokenUsage.subagentOutput > 0 ? `
   Subagents (${tokenUsage.subagentModel || 'unknown'}):
     Input:       ${formatNum(tokenUsage.subagentInput).padStart(10)} tokens  ${formatCost(subInputCost)}
     Output:      ${formatNum(tokenUsage.subagentOutput).padStart(10)} tokens  ${formatCost(subOutputCost)}
 ` : ''}
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   💰 TOTAL COST: ${formatCost(totalCost)}
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 `;
            }

            process.stdout.write(`

   🔥🔥🔥  THE DRAGON'S HOARD GROWS!  🔥🔥🔥

             🐉
           /|  |\\
          / |💎| \\      Victory!
         /  |__|  \\
        /  /    \\  \\
       /__/  💰  \\__\\

   ⏱️  Quest Duration:  ${elapsed()}
   📦  Bookmarks:       ${totalBookmarks} processed
   🐲  Dragon Minions:  ${tasksSpawned > 0 ? tasksSpawned + ' summoned' : 'solo hunt'}
   🏔️  Hoard Status:    ${hoardStatus}
 ${tokenDisplay}
   🐉 Smaug rests... until the next hoard arrives.

  `);
          }
        } catch (e) {
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    const timeoutId = setTimeout(() => {
      stopSpinner();
      proc.kill('SIGTERM');
      resolve({
        success: false,
        error: `Timeout after ${timeout}ms`,
        stdout,
        stderr,
        exitCode: -1
      });
    }, timeout);

    proc.on('close', (code) => {
      stopSpinner();
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve({ success: true, output: stdout, tokenUsage });
      } else {
        resolve({
          success: false,
          error: `Exit code ${code}`,
          stdout,
          stderr,
          exitCode: code,
          tokenUsage
        });
      }
    });

    proc.on('error', (err) => {
      stopSpinner();
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: err.message,
        stdout,
        stderr,
        exitCode: -1
      });
    });
  });
}

async function invokeClaudeCode(config, bookmarkCount, options = {}) {
  const timeout = config.claudeTimeout || 900000;
  const model = config.claudeModel || 'sonnet';
  const trackTokens = options.trackTokens || false;

  const allowedTools = config.allowedTools || 'Read,Write,Edit,Glob,Grep,Bash,Task,TodoWrite';

  let claudePath = 'claude';
  const possiblePaths = [
    path.join(process.env.APPDATA || '', 'Roaming', 'npm', 'claude.cmd'),
    path.join(process.env.LOCALAPPDATA || '', 'npm', 'claude.cmd'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Roaming', 'npm', 'claude.cmd'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'claude.exe'),
    path.join(process.env.PROGRAMFILES || '', 'Claude', 'claude.exe'),
    path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Programs', 'claude.exe'),
    '/usr/local/bin/claude',
    '/opt/homebrew/bin/claude',
    path.join(process.env.HOME || '', '.local/bin/claude'),
    path.join(process.env.HOME || '', 'Library/Application Support/Herd/config/nvm/versions/node/v20.19.4/bin/claude'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      claudePath = p;
      break;
    }
  }

  const showDragonReveal = async (totalBookmarks) => {
    process.stdout.write('\n');
    const fireFramesIntro = ['🔥', '🔥🔥', '🔥🔥🔥', '🔥🔥🔥🔥', '🔥🔥🔥🔥🔥'];
    for (let i = 0; i < 10; i++) {
      const frame = fireFramesIntro[i % fireFramesIntro.length];
      process.stdout.write(`\r  ${frame.padEnd(12)}`);
      await new Promise(r => setTimeout(r, 150));
    }

    process.stdout.write('\r                    \r');
    process.stdout.write(`  Wait... that's not Claude... it's

   🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥  🔥
        _____ __  __   _   _   _  ____
       / ____|  \/  | / \ | | | |/ ___|
       \___ \| |\/| |/ _ \| | | | |  _
        ___) | |  | / ___ \ |_| | |_| |
       |____/|_|  |_/_/  \_\___/ \____|

   🐉 The dragon stirs... ${totalBookmarks} treasure${totalBookmarks !== 1 ? 's' : ''} to hoard!
  `);
  };

  await showDragonReveal(bookmarkCount);

  return new Promise((resolve) => {
    const args = [
      '--print',
      '--verbose',
      '--output-format', 'stream-json',
      '--model', model,
      '--allowedTools', allowedTools,
      '--',
      `Process the ${bookmarkCount} bookmark(s) in ./.state/pending-bookmarks.json following the instructions in ./.claude/commands/process-bookmarks.md. Read that file first, then process each bookmark.`
    ];

    const nodePaths = [
      '/usr/local/bin',
      '/opt/homebrew/bin',
      path.join(process.env.HOME || '', 'Library/Application Support/Herd/config/nvm/versions/node/v20.19.4/bin'),
      path.join(process.env.HOME || '', '.local/bin'),
      path.join(process.env.HOME || '', '.bun/bin'),
    ];
    const enhancedPath = [...nodePaths, process.env.PATH || ''].join(path.delimiter);

    const apiKey = config.anthropicApiKey || process.env.ANTHROPIC_API_KEY;

    const proc = spawn(claudePath, args, {
      cwd: config.projectRoot || process.cwd(),
      env: {
        ...process.env,
        PATH: enhancedPath,
        ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {})
      },
      stdio: ['inherit', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    let stdout = '';
    let stderr = '';
    let lastText = '';
    let filesWritten = [];
    let bookmarksProcessed = 0;
    let totalBookmarks = bookmarkCount;

    const parallelTasks = new Map();
    let tasksSpawned = 0;
    let tasksCompleted = 0;

    const tokenUsage = {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      subagentInput: 0,
      subagentOutput: 0,
      model: model,
      subagentModel: null
    };

    const startTime = Date.now();
    const elapsed = () => {
      const ms = Date.now() - startTime;
      const secs = Math.floor(ms / 1000);
      return secs < 60 ? `${secs}s` : `${Math.floor(secs/60)}m ${secs%60}s`;
    };

    const progressBar = (current, total, width = 20) => {
      const pct = Math.min(current / total, 1);
      const filled = Math.round(pct * width);
      const empty = width - filled;
      const bar = '█'.repeat(filled) + '░'.repeat(empty);
      return `[${bar}] ${current}/${total}`;
    };

    const dragonSays = [
      '🐉 *sniff sniff* Fresh bookmarks detected...',
      '🔥 Breathing fire on these tweets...',
      '💎 Adding treasures to the hoard...',
      '🏔️ Guarding the mountain of knowledge...',
      '⚔️ Vanquishing duplicate bookmarks...',
      '🌋 The dragon\'s flames illuminate the data...',
    ];
    let dragonMsgIndex = 0;
    const nextDragonMsg = () => dragonSays[dragonMsgIndex++ % dragonSays.length];

    const shownMessages = new Set();

    const fireFrames = [
      '  🔥    ',
      ' 🔥🔥   ',
      '🔥🔥🔥  ',
      ' 🔥🔥🔥 ',
      '  🔥🔥🔥',
      '   🔥🔥 ',
      '    🔥  ',
      '   🔥   ',
      '  🔥🔥  ',
      ' 🔥 🔥  ',
      '🔥  🔥  ',
      '🔥   🔥 ',
      ' 🔥  🔥 ',
      '  🔥 🔥 ',
      '   🔥🔥 ',
    ];
    const spinnerMessages = [
      'Breathing fire on bookmarks',
      'Examining the treasures',
      'Sorting the hoard',
      'Polishing the gold',
      'Counting coins',
      'Guarding the lair',
      'Hunting for gems',
      'Cataloging riches',
    ];
    let fireFrame = 0;
    let spinnerMsgFrame = 0;
    let lastSpinnerLine = '';
    let spinnerActive = true;
    let currentSpinnerMsg = spinnerMessages[0];

    const msgInterval = setInterval(() => {
      if (!spinnerActive) return;
      spinnerMsgFrame = (spinnerMsgFrame + 1) % spinnerMessages.length;
      currentSpinnerMsg = spinnerMessages[spinnerMsgFrame];
    }, 10000);

    const spinnerInterval = setInterval(() => {
      if (!spinnerActive) return;
      fireFrame = (fireFrame + 1) % fireFrames.length;
      const flame = fireFrames[fireFrame];
      const spinnerLine = `\r  ${flame} ${currentSpinnerMsg}... [${elapsed()}]`;
      process.stdout.write(spinnerLine + '          ');
      lastSpinnerLine = spinnerLine;
    }, 150);

    process.stdout.write('\n  ⏳ Dragons are patient hunters... this may take a moment.\n');
    lastSpinnerLine = '  🔥     Processing...';
    process.stdout.write(lastSpinnerLine);

    const printStatus = (msg) => {
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
      process.stdout.write(msg);
    };

    const stopSpinner = () => {
      spinnerActive = false;
      clearInterval(spinnerInterval);
      clearInterval(msgInterval);
      process.stdout.write('\r' + ' '.repeat(60) + '\r');
    };

    let lineBuffer = '';

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;

      lineBuffer += text;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        if (!line.startsWith('{')) continue;

        try {
          const event = JSON.parse(line);

          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text' && block.text !== lastText) {
                const newPart = block.text.slice(lastText.length);
                if (newPart && newPart.length > 50) {
                  if (newPart.includes('Processed') && newPart.includes('bookmark')) {
                    process.stdout.write(`\n💬 ${newPart.trim().slice(0, 200)}${newPart.length > 200 ? '...' : ''}\n`);
                  }
                }
                lastText = block.text;
              }

              if (block.type === 'tool_use') {
                const toolName = block.name;
                const input = block.input || {};

                if (toolName === 'Write' && input.file_path) {
                  const fileName = input.file_path.split('/').pop();
                  const dir = input.file_path.includes('/knowledge/tools/') ? 'tools' :
                             input.file_path.includes('/knowledge/articles/') ? 'articles' : '';
                  filesWritten.push(fileName);
                  if (dir) {
                    printStatus(`    💎 Hoarded → ${dir}/${fileName}\n`);
                  } else if (fileName === 'bookmarks.md') {
                    bookmarksProcessed++;
                    const fireIntensity = '🔥'.repeat(Math.min(Math.ceil(bookmarksProcessed / 2), 5));
                    printStatus(`  ${fireIntensity} ${progressBar(bookmarksProcessed, totalBookmarks)} [${elapsed()}]`);
                  } else {
                    printStatus(`    💎 ${fileName}\n`);
                  }
                } else if (toolName === 'Edit' && input.file_path) {
                  const fileName = input.file_path.split('/').pop();
                  if (fileName === 'bookmarks.md') {
                    bookmarksProcessed++;
                    const fireIntensity = '🔥'.repeat(Math.min(Math.ceil(bookmarksProcessed / 2), 5));
                    printStatus(`  ${fireIntensity} ${progressBar(bookmarksProcessed, totalBookmarks)} [${elapsed()}]`);
                  } else if (fileName === 'pending-bookmarks.json') {
                    printStatus(`  🐉 *licks claws clean* Tidying the lair...\n`);
                  }
                } else if (toolName === 'Read' && input.file_path) {
                  const fileName = input.file_path.split('/').pop();
                  if (fileName === 'pending-bookmarks.json' && !shownMessages.has('eye')) {
                    shownMessages.add('eye');
                    printStatus(`  👁️  The dragon's eye opens... surveying treasures...\n`);
                  } else if (fileName === 'process-bookmarks.md' && !shownMessages.has('scrolls')) {
                    shownMessages.add('scrolls');
                    printStatus(`  📜 Consulting the ancient scrolls...\n`);
                  }
                } else if (toolName === 'Task') {
                  const desc = input.description || `batch ${tasksSpawned + 1}`;
                  const taskKey = `task-${desc}`;
                  if (!parallelTasks.has(taskKey)) {
                    tasksSpawned++;
                    parallelTasks.set(taskKey, {
                      description: desc,
                      startTime: Date.now(),
                      status: 'running'
                    });
                    printStatus(`  🐲 Summoning dragon minion: ${desc}\n`);
                    if (tasksSpawned > 1) {
                      printStatus(`     🔥 ${tasksSpawned} dragons now circling the hoard\n`);
                    }
                  }
                } else if (toolName === 'Bash') {
                  const cmd = input.command || '';
                  if (cmd.includes('jq') && cmd.includes('bookmarks')) {
                    printStatus(`  ⚡ ${nextDragonMsg()}\n`);
                  }
                }
              }
            }
          }

          if (event.type === 'user' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_result' && !block.is_error && block.tool_use_id) {
                const content = typeof block.content === 'string' ? block.content : '';
                const toolId = block.tool_use_id;
                if ((content.includes('Processed') || content.includes('completed')) &&
                    !shownMessages.has(`task-done-${toolId}`)) {
                  shownMessages.add(`task-done-${toolId}`);
                  tasksCompleted++;
                  if (tasksSpawned > 0 && tasksCompleted <= tasksSpawned) {
                    const pct = Math.round((tasksCompleted / tasksSpawned) * 100);
                    const flames = '🔥'.repeat(Math.ceil(pct / 20));
                    printStatus(`  🐲 Dragon minion returns! ${flames} (${tasksCompleted}/${tasksSpawned})\n`);
                  }
                }
              }
            }
          }

          if (event.type === 'result' && event.usage) {
            tokenUsage.input = event.usage.input_tokens || 0;
            tokenUsage.output = event.usage.output_tokens || 0;
            tokenUsage.cacheRead = event.usage.cache_read_input_tokens || 0;
            tokenUsage.cacheWrite = event.usage.cache_creation_input_tokens || 0;
          }

          if (event.type === 'user' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'tool_result' && block.content) {
                const content = typeof block.content === 'string' ? block.content : JSON.stringify(block.content);
                const usageMatch = content.match(/usage.*?input.*?(\d+).*?output.*?(\d+)/i);
                if (usageMatch) {
                  tokenUsage.subagentInput += parseInt(usageMatch[1], 10);
                  tokenUsage.subagentOutput += parseInt(usageMatch[2], 10);
                }
                if (!tokenUsage.subagentModel && content.includes('haiku')) {
                  tokenUsage.subagentModel = 'haiku';
                } else if (!tokenUsage.subagentModel && content.includes('sonnet')) {
                  tokenUsage.subagentModel = 'sonnet';
                }
              }
            }
          }

          if (event.type === 'result') {
            stopSpinner();

            const hoardDescriptions = {
              small: [
                'A Few Coins',
                'Sparse',
                'Humble Beginnings',
                'First Treasures',
                'A Modest Start'
              ],
              medium: [
                'Glittering',
                'Growing Nicely',
                'Respectable Pile',
                'Gleaming Hoard',
                'Handsome Collection'
              ],
              large: [
                'Overflowing',
                'Mountain of Gold',
                'Legendary Hoard',
                'Dragon\'s Fortune',
                'Vast Riches'
              ]
            };

            const tier = totalBookmarks > 15 ? 'large' : totalBookmarks > 7 ? 'medium' : 'small';
            const descriptions = hoardDescriptions[tier];
            const hoardStatus = descriptions[Math.floor(Math.random() * descriptions.length)];

            let tokenDisplay = '';
            if (trackTokens && (tokenUsage.input > 0 || tokenUsage.output > 0)) {
              const pricing = {
                'sonnet': { input: 3.00, output: 15.00, cacheRead: 0.30, cacheWrite: 3.75 },
                'haiku': { input: 0.25, output: 1.25, cacheRead: 0.025, cacheWrite: 0.30 },
                'opus': { input: 15.00, output: 75.00, cacheRead: 1.50, cacheWrite: 18.75 }
              };

              const mainPricing = pricing[tokenUsage.model] || pricing.sonnet;
              const subPricing = pricing[tokenUsage.subagentModel || tokenUsage.model] || mainPricing;

              const mainInputCost = (tokenUsage.input / 1_000_000) * mainPricing.input;
              const mainOutputCost = (tokenUsage.output / 1_000_000) * mainPricing.output;
              const cacheReadCost = (tokenUsage.cacheRead / 1_000_000) * mainPricing.cacheRead;
              const cacheWriteCost = (tokenUsage.cacheWrite / 1_000_000) * mainPricing.cacheWrite;
              const subInputCost = (tokenUsage.subagentInput / 1_000_000) * subPricing.input;
              const subOutputCost = (tokenUsage.subagentOutput / 1_000_000) * subPricing.output;

              const totalCost = mainInputCost + mainOutputCost + cacheReadCost + cacheWriteCost + subInputCost + subOutputCost;

              const formatNum = (n) => n.toLocaleString();
              const formatCost = (c) => c < 0.01 ? '<$0.01' : `$${c.toFixed(2)}`;

              tokenDisplay = `
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   📊 TOKEN USAGE
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Main (${tokenUsage.model}):
     Input:       ${formatNum(tokenUsage.input).padStart(10)} tokens  ${formatCost(mainInputCost)}
     Output:      ${formatNum(tokenUsage.output).padStart(10)} tokens  ${formatCost(mainOutputCost)}
     Cache Read:  ${formatNum(tokenUsage.cacheRead).padStart(10)} tokens  ${formatCost(cacheReadCost)}
     Cache Write: ${formatNum(tokenUsage.cacheWrite).padStart(10)} tokens  ${formatCost(cacheWriteCost)}
 ${tokenUsage.subagentInput > 0 || tokenUsage.subagentOutput > 0 ? `
   Subagents (${tokenUsage.subagentModel || 'unknown'}):
     Input:       ${formatNum(tokenUsage.subagentInput).padStart(10)} tokens  ${formatCost(subInputCost)}
     Output:      ${formatNum(tokenUsage.subagentOutput).padStart(10)} tokens  ${formatCost(subOutputCost)}
 ` : ''}
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   💰 TOTAL COST: ${formatCost(totalCost)}
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 `;
            }

            process.stdout.write(`

   🔥🔥🔥  THE DRAGON'S HOARD GROWS!  🔥🔥🔥

             🐉
           /|  |\\
          / |💎| \\      Victory!
         /  |__|  \\
        /  /    \\  \\
       /__/  💰  \\__\\

   ⏱️  Quest Duration:  ${elapsed()}
   📦  Bookmarks:       ${totalBookmarks} processed
   🐲  Dragon Minions:  ${tasksSpawned > 0 ? tasksSpawned + ' summoned' : 'solo hunt'}
   🏔️  Hoard Status:    ${hoardStatus}
 ${tokenDisplay}
   🐉 Smaug rests... until the next hoard arrives.

  `);
          }
        } catch (e) {
        }
      }
    });

    proc.stderr.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      process.stderr.write(text);
    });

    const timeoutId = setTimeout(() => {
      stopSpinner();
      proc.kill('SIGTERM');
      resolve({
        success: false,
        error: `Timeout after ${timeout}ms`,
        stdout,
        stderr,
        exitCode: -1
      });
    }, timeout);

    proc.on('close', (code) => {
      stopSpinner();
      clearTimeout(timeoutId);
      if (code === 0) {
        resolve({ success: true, output: stdout, tokenUsage });
      } else {
        resolve({
          success: false,
          error: `Exit code ${code}`,
          stdout,
          stderr,
          exitCode: code,
          tokenUsage
        });
      }
    });

    proc.on('error', (err) => {
      stopSpinner();
      clearTimeout(timeoutId);
      resolve({
        success: false,
        error: err.message,
        stdout,
        stderr,
        exitCode: -1
      });
    });
  });
}

async function invokeAI(config, bookmarkCount, options = {}) {
  const cliTool = config.cliTool || 'claude';

  const modelName = cliTool === 'opencode'
    ? config.opencodeModel
    : config.claudeModel;

  if (cliTool === 'opencode') {
    return invokeOpenCodeCLI(config, bookmarkCount, options, modelName);
  } else {
    return invokeClaudeCode(config, bookmarkCount, options);
  }
}

async function sendWebhook(config, payload) {
  if (!config.webhookUrl) return;

  try {
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      console.error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    console.error(`Webhook error: ${error.message}`);
  }
}

function formatDiscordPayload(title, description, success = true) {
  return {
    embeds: [{
      title,
      description,
      color: success ? 0x00ff00 : 0xff0000,
      timestamp: new Date().toISOString()
    }]
  };
}

function formatSlackPayload(title, description, success = true) {
  return {
    text: title,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${success ? '✅' : '❌'} ${title}` }
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: description }
      }
    ]
  };
}

async function notify(config, title, description, success = true) {
  if (!config.webhookUrl) return;

  let payload;
  if (config.webhookType === 'slack') {
    payload = formatSlackPayload(title, description, success);
  } else {
    payload = formatDiscordPayload(title, description, success);
  }

  await sendWebhook(config, payload);
}

export async function run(options = {}) {
  const startTime = Date.now();
  const now = new Date().toISOString();
  const config = loadConfig(options.configPath);

  console.log(`[${now}] Starting smaug job...`);

  if (!acquireLock()) {
    return { success: true, skipped: true };
  }

  try {
    let pendingData = null;
    let bookmarkCount = 0;

    if (fs.existsSync(config.pendingFile)) {
      try {
        pendingData = JSON.parse(fs.readFileSync(config.pendingFile, 'utf8'));
        bookmarkCount = pendingData.bookmarks?.length || 0;
      } catch (e) {
      }
    }

    if (bookmarkCount === 0 || options.forceFetch) {
      console.log(`[${now}] Phase 1: Fetching and preparing bookmarks...`);
      const prepResult = await fetchAndPrepareBookmarks(options);

      if (fs.existsSync(config.pendingFile)) {
        pendingData = JSON.parse(fs.readFileSync(config.pendingFile, 'utf8'));
        bookmarkCount = pendingData.bookmarks?.length || 0;
      }

      if (prepResult.count > 0) {
        console.log(`[${now}] Fetched ${prepResult.count} new bookmarks`);
      }
    } else {
      console.log(`[${now}] Found ${bookmarkCount} pending bookmarks, skipping fetch`);
    }

    if (bookmarkCount === 0) {
      console.log(`[${now}] No bookmarks to process`);
      return { success: true, count: 0, duration: Date.now() - startTime };
    }

    console.log(`[${now}] Processing ${bookmarkCount} bookmarks`);

    const idsToProcess = pendingData.bookmarks.map(b => b.id);

    const shouldInvoke = config.cliTool === 'opencode'
      ? config.autoInvokeOpencode !== false
      : config.autoInvokeClaude !== false;

    if (shouldInvoke) {
      console.log(`[${now}] Phase 2: Invoking ${config.cliTool || 'Claude'} for analysis...`);

      const aiResult = await invokeAI(config, bookmarkCount, {
        trackTokens: options.trackTokens
      });

      if (aiResult.success) {
        console.log(`[${now}] Analysis complete`);

        if (fs.existsSync(config.pendingFile)) {
          const currentData = JSON.parse(fs.readFileSync(config.pendingFile, 'utf8'));
          const processedIds = new Set(idsToProcess);
          const remaining = currentData.bookmarks.filter(b => !processedIds.has(b.id));

          fs.writeFileSync(config.pendingFile, JSON.stringify({
            generatedAt: currentData.generatedAt,
            count: remaining.length,
            bookmarks: remaining
          }, null, 2));

          console.log(`[${now}] Cleaned up ${idsToProcess.length} processed bookmarks, ${remaining.length} remaining`);
        }

        await notify(
          config,
          'Bookmarks Processed',
          `**New:** ${bookmarkCount} bookmarks archived`,
          true
        );

        return {
          success: true,
          count: bookmarkCount,
          duration: Date.now() - startTime,
          output: aiResult.output,
          tokenUsage: aiResult.tokenUsage
        };

      } else {
        console.error(`[${now}] ${config.cliTool || 'Claude'} failed:`, aiResult.error);

        await notify(
          config,
          'Bookmark Processing Failed',
          `Prepared ${bookmarkCount} bookmarks but analysis failed:\n${aiResult.error}`,
          false
        );

        return {
          success: false,
          count: bookmarkCount,
          duration: Date.now() - startTime,
          error: aiResult.error
        };
      }
    } else {
      console.log(`[${now}] AI auto-invoke disabled. Run 'smaug process' or /process-bookmarks manually.`);

      return {
        success: true,
        count: bookmarkCount,
        duration: Date.now() - startTime,
        pendingFile: config.pendingFile
      };
    }

  } catch (error) {
    console.error(`[${now}] Job error:`, error.message);

    await notify(
      config,
      'Smaug Job Failed',
      `Error: ${error.message}`,
      false
    );

    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime
    };
  } finally {
    releaseLock();
  }
}

export default {
  name: JOB_NAME,
  interval: '*/30 * * * *',
  timezone: 'America/New_York',
  run
};

if (process.argv[1] && process.argv[1].endsWith('job.js')) {
  run().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}
