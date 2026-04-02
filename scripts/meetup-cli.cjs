#!/usr/bin/env node

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const PID_FILE = path.join(ROOT_DIR, '.open-meetup.pid');
const LOG_DIR = path.join(ROOT_DIR, '.logs');
const SERVER_LOG_FILE = path.join(LOG_DIR, 'server.log');
const CLIENT_LOG_FILE = path.join(LOG_DIR, 'client.log');
const SERVER_PORT = '3001';

const NPM_CMD = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function printHelp() {
  console.log(`Open Meetup 启停工具

用法:
  node scripts/meetup-cli.cjs <命令> [选项]

命令:
  start                  启动服务
  stop                   停止服务
  logs                   查看并持续跟踪日志
  help                   显示帮助

start 选项:
  --host-password <pwd>  主持人口令（默认: 12345678）
  --port <port>          访问端口（默认: 8080）
  -h, --help             显示帮助

示例:
  npm start
  npm start -- --host-password 12345678 --port 8080
  npm stop
  npm run logs
`);
}

function parseStartOptions(argv) {
  const options = {
    hostPassword: (process.env.HOST_PASSWORD || '12345678').trim(),
    clientPort: (process.env.LAN_PORT || '8080').trim(),
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
    if (arg === '-h' || arg === '--help') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`未知参数: ${arg}`);
  }

  if (!options.hostPassword) {
    throw new Error('主持人口令不能为空，可用 --host-password 指定');
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

function killByPid(pid, name) {
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

  try {
    process.kill(-pid, 'SIGKILL');
  } catch (_) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch (__) {
      return;
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

  killByPid(Number(state.serverPid), 'server');
  killByPid(Number(state.clientPid), 'client');
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

async function startCommand(argv) {
  const options = parseStartOptions(argv);
  ensureDependencies();

  await stopCommand({ silent: true });

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(SERVER_LOG_FILE, '', 'utf8');
  fs.writeFileSync(CLIENT_LOG_FILE, '', 'utf8');

  const serverPid = runDetachedNpm(
    path.join(ROOT_DIR, 'server'),
    ['run', 'dev'],
    {
      HOST: '0.0.0.0',
      PORT: SERVER_PORT,
      HOST_PASSWORD: options.hostPassword,
    },
    SERVER_LOG_FILE,
  );

  const clientPid = runDetachedNpm(
    path.join(ROOT_DIR, 'client'),
    ['run', 'dev', '--', '--host', '0.0.0.0', '--port', options.clientPort],
    {},
    CLIENT_LOG_FILE,
  );

  await wait(2000);

  const serverAlive = isProcessAlive(serverPid);
  const clientAlive = isProcessAlive(clientPid);
  if (!serverAlive || !clientAlive) {
    killByPid(serverPid, 'server');
    killByPid(clientPid, 'client');
    throw new Error('启动失败，请执行 npm run logs 查看日志');
  }

  writePidState({
    startedAt: new Date().toISOString(),
    serverPid,
    clientPid,
    clientPort: Number(options.clientPort),
  });

  const lanIp = getLanIp();
  const shareUrl = `http://${lanIp}:${options.clientPort}`;

  console.log('Open Meetup 已启动。');
  console.log(`访问地址: ${shareUrl}`);
  console.log(`主持人口令: ${options.hostPassword}`);
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
    await startCommand(args);
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
