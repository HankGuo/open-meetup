#!/usr/bin/env node

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(ROOT_DIR, '.open-meetup.pid');
const LOG_DIR = path.join(ROOT_DIR, '.logs');
const SERVER_LOG_FILE = path.join(LOG_DIR, 'server.log');
const CLIENT_LOG_FILE = path.join(LOG_DIR, 'client.log');
const SERVER_DIR = path.join(ROOT_DIR, 'server');
const CLIENT_DIR = path.join(ROOT_DIR, 'client');
const SERVER_DIST_ENTRY = path.join(SERVER_DIR, 'dist', 'index.js');
const CLIENT_DIST_DIR = path.join(CLIENT_DIR, 'dist');

const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function printHelp() {
  console.log(`Open Meetup 启停工具

用法:
  node scripts/meetup-cli.cjs <命令> [选项]

命令:
  start                  启动服务（默认生产模式：自动构建 + 单端口静态托管）
  stop                   停止服务
  logs                   查看并持续跟踪日志
  help                   显示帮助

start 选项:
  --host-password <pwd>  主持人口令（不传则自动生成强口令并在启动后展示）
  --port <port>          访问端口（默认: 8080）
  --dev                  开发者模式：ts-node-dev + Vite dev server（不构建，热更新）
  --force-build          生产模式下忽略已有构建产物，强制重新构建
  -h, --help             显示帮助

示例:
  npm start
  npm start -- --host-password my-secret --port 8080
  npm start -- --dev
  npm stop
  npm run logs
`);
}

function parseStartOptions(argv) {
  const options = {
    hostPassword: (process.env.HOST_PASSWORD || '').trim(),
    clientPort: (process.env.LAN_PORT || '8080').trim(),
    devMode: false,
    forceBuild: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--host-password') {
      options.hostPassword = (argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--port') {
      options.clientPort = (argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (arg === '--dev') {
      options.devMode = true;
      continue;
    }
    if (arg === '--force-build') {
      options.forceBuild = true;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`未知参数: ${arg}`);
  }

  if (!options.devMode && options.hostPassword && options.hostPassword.length < 6) {
    throw new Error('主持人口令至少 6 位，建议 8 位以上且不要使用 12345678 等常见口令');
  }
  if (!options.devMode && options.hostPassword === '12345678') {
    console.warn('⚠️  警告：正在使用弱口令 12345678，局域网内任何人都可以创建并控制房间。');
  }
  if (!isValidPort(options.clientPort)) {
    throw new Error(`访问端口无效: ${options.clientPort}`);
  }

  return options;
}

function isValidPort(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 && num <= 65535;
}

function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number') {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function generatePassword() {
  // 去掉易混淆字符的 8 位强口令
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (const byte of bytes) {
    out += alphabet[byte % alphabet.length];
  }
  return out;
}

function ensureDependencies() {
  const ready = fs.existsSync(path.join(ROOT_DIR, 'node_modules'));
  if (ready) {
    return;
  }

  console.log('检测到依赖缺失，正在自动安装...');
  const result = spawnSync(NPM_CMD, ['run', 'install:all'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error('依赖安装失败，请重试');
  }
}

function buildProd() {
  console.log('正在构建生产包（首次启动或代码更新后需要一次）...');
  const result = spawnSync(NPM_CMD, ['run', 'build'], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error('构建失败，请检查上方错误信息');
  }
}

function runDetachedNpm(cwd, args, env, logFile) {
  const outFd = fs.openSync(logFile, 'a');
  const child = spawn(NPM_CMD, args, {
    cwd,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', outFd, outFd],
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(outFd);
  return child.pid;
}

function runDetachedNode(entryPath, env, logFile) {
  const outFd = fs.openSync(logFile, 'a');
  const child = spawn(process.execPath, [entryPath], {
    cwd: ROOT_DIR,
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', outFd, outFd],
    windowsHide: true,
  });
  child.unref();
  fs.closeSync(outFd);
  return child.pid;
}

async function killByPid(pid, name) {
  if (!pid || typeof pid !== 'number') {
    return;
  }

  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    return;
  }

  // 先 SIGTERM 让服务端有机会广播 room:closed 并清理，超时再强杀
  try {
    process.kill(-pid, 'SIGTERM');
  } catch (_) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (__) {
      return;
    }
  }

  const deadline = Date.now() + 4000;
  while (isProcessAlive(pid) && Date.now() < deadline) {
    await wait(100);
  }
  if (isProcessAlive(pid)) {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (_) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (__) {}
    }
  }
  console.log(`已停止 ${name} 进程 (${pid})`);
}

function readPidState() {
  if (!fs.existsSync(PID_FILE)) {
    return null;
  }
  try {
    const content = fs.readFileSync(PID_FILE, 'utf8');
    return JSON.parse(content);
  } catch (_) {
    return null;
  }
}

function writePidState(state) {
  fs.writeFileSync(PID_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
}

function removePidState() {
  if (fs.existsSync(PID_FILE)) {
    fs.unlinkSync(PID_FILE);
  }
}

async function stopCommand({ silent = false } = {}) {
  const state = readPidState();
  if (!state) {
    if (!silent) {
      console.log('没有检测到运行中的 Open Meetup 进程。');
    }
    return;
  }

  if (!silent) {
    console.log('正在停止 Open Meetup...');
  }

  await killByPid(Number(state.serverPid), 'server');
  if (state.clientPid) {
    await killByPid(Number(state.clientPid), 'client');
  }
  removePidState();

  if (!silent) {
    console.log('Open Meetup 已停止。');
  }
}

function getLanIp() {
  const all = os.networkInterfaces();
  for (const name of Object.keys(all)) {
    const addresses = all[name] || [];
    for (const item of addresses) {
      if (item && item.family === 'IPv4' && !item.internal) {
        return item.address;
      }
    }
  }
  return 'localhost';
}

function tryCopyToClipboard(text) {
  if (!text) {
    return false;
  }

  if (process.platform === 'darwin') {
    const res = spawnSync('pbcopy', { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
    return res.status === 0;
  }
  if (process.platform === 'win32') {
    const res = spawnSync('cmd', ['/c', 'clip'], { input: text, stdio: ['pipe', 'ignore', 'ignore'] });
    return res.status === 0;
  }
  if (process.platform === 'linux') {
    const xclip = spawnSync('xclip', ['-selection', 'clipboard'], {
      input: text,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    if (xclip.status === 0) {
      return true;
    }
    const xsel = spawnSync('xsel', ['--clipboard', '--input'], {
      input: text,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    return xsel.status === 0;
  }
  return false;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function startProdCommand(options) {
  ensureDependencies();

  const needBuild =
    options.forceBuild ||
    !fs.existsSync(SERVER_DIST_ENTRY) ||
    !fs.existsSync(path.join(CLIENT_DIST_DIR, 'index.html'));
  if (needBuild) {
    buildProd();
  }

  await stopCommand({ silent: true });

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(SERVER_LOG_FILE, '', 'utf8');

  const hostPassword = options.hostPassword || generatePassword();
  const serverPid = runDetachedNode(
    SERVER_DIST_ENTRY,
    {
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      PORT: options.clientPort,
      HOST_PASSWORD: hostPassword,
      CLIENT_DIST_PATH: CLIENT_DIST_DIR,
    },
    SERVER_LOG_FILE,
  );

  await wait(1200);
  if (!isProcessAlive(serverPid)) {
    await killByPid(serverPid, 'server');
    throw new Error('启动失败，请执行 npm run logs 查看日志');
  }

  writePidState({
    startedAt: new Date().toISOString(),
    mode: 'production',
    serverPid,
    clientPort: Number(options.clientPort),
  });

  const lanIp = getLanIp();
  const shareUrl = `http://${lanIp}:${options.clientPort}`;

  console.log('Open Meetup 已启动（生产模式，单端口）。');
  console.log(`访问地址: ${shareUrl}`);
  console.log(`主持人口令: ${hostPassword}`);
  console.log('查看日志: npm run logs');
  console.log('停止服务: npm stop');

  if (tryCopyToClipboard(shareUrl)) {
    console.log('访问地址已复制到剪贴板。');
  }
}

async function startDevCommand(options) {
  ensureDependencies();

  await stopCommand({ silent: true });

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(SERVER_LOG_FILE, '', 'utf8');
  fs.writeFileSync(CLIENT_LOG_FILE, '', 'utf8');

  const hostPassword = options.hostPassword || '12345678';
  const serverPid = runDetachedNpm(
    SERVER_DIR,
    ['run', 'dev'],
    {
      HOST: '0.0.0.0',
      PORT: '3001',
      HOST_PASSWORD: hostPassword,
    },
    SERVER_LOG_FILE,
  );

  const clientPid = runDetachedNpm(
    CLIENT_DIR,
    ['run', 'dev', '--', '--host', '0.0.0.0', '--port', options.clientPort],
    {},
    CLIENT_LOG_FILE,
  );

  await wait(2000);

  const serverAlive = isProcessAlive(serverPid);
  const clientAlive = isProcessAlive(clientPid);
  if (!serverAlive || !clientAlive) {
    await killByPid(serverPid, 'server');
    await killByPid(clientPid, 'client');
    throw new Error('启动失败，请执行 npm run logs 查看日志');
  }

  writePidState({
    startedAt: new Date().toISOString(),
    mode: 'dev',
    serverPid,
    clientPid,
    clientPort: Number(options.clientPort),
  });

  const lanIp = getLanIp();
  const shareUrl = `http://${lanIp}:${options.clientPort}`;

  console.log('Open Meetup 已启动（开发者模式，Vite dev server）。');
  console.log(`访问地址: ${shareUrl}`);
  console.log(`主持人口令: ${hostPassword}`);
  console.log('查看日志: npm run logs');
  console.log('停止服务: npm stop');

  if (tryCopyToClipboard(shareUrl)) {
    console.log('访问地址已复制到剪贴板。');
  }
}

function printLastLines(label, filePath, count = 80) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split(/\r?\n/);
  const tail = lines.slice(Math.max(lines.length - count, 0)).filter(Boolean);
  if (tail.length === 0) {
    return;
  }
  process.stdout.write(`\n[${label}] 最近日志:\n`);
  process.stdout.write(`${tail.join('\n')}\n`);
}

function readNewChunk(filePath, from, to) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const length = to - from;
    const buffer = Buffer.alloc(length);
    fs.readSync(fd, buffer, 0, length, from);
    return buffer.toString('utf8');
  } finally {
    fs.closeSync(fd);
  }
}

function logsCommand() {
  const targets = [
    { label: 'server', filePath: SERVER_LOG_FILE },
    { label: 'client', filePath: CLIENT_LOG_FILE },
  ].filter((item) => fs.existsSync(item.filePath));

  if (targets.length === 0) {
    throw new Error('未找到日志文件，请先执行 npm start');
  }

  const offsets = new Map();
  for (const item of targets) {
    printLastLines(item.label, item.filePath, 100);
    const stat = fs.statSync(item.filePath);
    offsets.set(item.filePath, stat.size);
  }

  console.log('\n开始跟踪日志，按 Ctrl+C 退出。\n');

  setInterval(() => {
    for (const item of targets) {
      try {
        const stat = fs.statSync(item.filePath);
        const prev = offsets.get(item.filePath) || 0;
        if (stat.size > prev) {
          const chunk = readNewChunk(item.filePath, prev, stat.size);
          process.stdout.write(`[${item.label}] ${chunk}`);
          offsets.set(item.filePath, stat.size);
        } else if (stat.size < prev) {
          offsets.set(item.filePath, stat.size);
        }
      } catch (_) {
        continue;
      }
    }
  }, 800);
}

async function main() {
  const command = process.argv[2] || 'help';
  const args = process.argv.slice(3);

  if (command === 'help' || command === '-h' || command === '--help') {
    printHelp();
    return;
  }
  if (command === 'start') {
    const options = parseStartOptions(args);
    if (options.devMode) {
      await startDevCommand(options);
    } else {
      await startProdCommand(options);
    }
    return;
  }
  if (command === 'stop') {
    await stopCommand();
    return;
  }
  if (command === 'logs') {
    logsCommand();
    return;
  }

  throw new Error(`未知命令: ${command}`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
