#!/usr/bin/env node

const { io } = require('socket.io-client');

const DEFAULTS = {
  server: process.env.SERVER_URL || process.env.VITE_SERVER_URL || 'http://localhost:3001',
  count: 35,
  timeoutMs: 8000,
  spreadMs: 15,
  keepAliveMs: 120000,
  autoCreateRoom: false,
  hostName: '压测主持人',
  roomTitle: `压测房间-${new Date().toISOString().slice(11, 19)}`,
  hostPassword: process.env.HOST_PASSWORD || '12345678',
  userPrefix: '压测用户',
  endRoomOnExit: false,
};

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const signalState = createSignalState();

  if (options.help) {
    printHelp();
    signalState.detach();
    return;
  }

  if (!Number.isInteger(options.count) || options.count <= 0) {
    throw new Error('参数错误: --count 必须是大于 0 的整数');
  }

  const roomState = await fetchRoomState(options.server);
  let hostSocket = null;
  let createdRoom = false;

  if (!roomState.exists) {
    if (!options.autoCreateRoom) {
      throw new Error('当前没有可加入的房间。请先在浏览器创建房间，或添加 --auto-create-room 参数。');
    }

    const created = await createRoom(options);
    hostSocket = created.socket;
    createdRoom = true;
    console.log(`[create] 已自动创建房间: ${options.roomTitle}`);
  } else {
    console.log(`[room] 检测到活动房间: ${roomState.title}`);
  }

  const simulation = await simulateParticipants(options, signalState);

  console.log('');
  console.log('========== 模拟结果 ==========');
  console.log(`目标人数: ${options.count}`);
  console.log(`成功加入: ${simulation.successes.length}`);
  console.log(`加入失败: ${simulation.failures.length}`);

  if (simulation.failures.length > 0) {
    const grouped = groupFailures(simulation.failures);
    for (const [code, users] of Object.entries(grouped)) {
      console.log(`- ${code}: ${users.length} 人 (${users.join(', ')})`);
    }
  }

  console.log('=============================');

  await keepAliveUntilExit(options.keepAliveMs, simulation.successes.length, signalState);
  try {
    await gracefulShutdown({
      options,
      hostSocket,
      createdRoom,
      participantSockets: simulation.successes.map((item) => item.socket),
    });
  } finally {
    signalState.detach();
  }
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--auto-create-room') {
      options.autoCreateRoom = true;
      continue;
    }

    if (arg === '--end-room-on-exit') {
      options.endRoomOnExit = true;
      continue;
    }

    const [key, valueFromEqual] = arg.split('=');
    const value = valueFromEqual ?? argv[i + 1];

    if (value == null || value.startsWith('--')) {
      throw new Error(`参数错误: ${arg} 缺少取值`);
    }

    switch (key) {
      case '--server':
        options.server = value;
        break;
      case '--count':
        options.count = Number(value);
        break;
      case '--timeout-ms':
        options.timeoutMs = Number(value);
        break;
      case '--spread-ms':
        options.spreadMs = Number(value);
        break;
      case '--keep-alive-ms':
        options.keepAliveMs = Number(value);
        break;
      case '--host-name':
        options.hostName = value;
        break;
      case '--room-title':
        options.roomTitle = value;
        break;
      case '--host-password':
        options.hostPassword = value;
        break;
      case '--user-prefix':
        options.userPrefix = value;
        break;
      default:
        throw new Error(`未知参数: ${key}`);
    }

    if (valueFromEqual == null) {
      i += 1;
    }
  }

  return options;
}

function printHelp() {
  console.log(`\nOpen Meetup 批量加入模拟器\n\n用法:\n  node scripts/bulk-join-simulator/simulate-bulk-join.cjs [选项]\n\n选项:\n  --count <n>             模拟人数（默认: ${DEFAULTS.count}）\n  --server <url>          服务端地址（默认: ${DEFAULTS.server}）\n  --spread-ms <ms>        每个用户启动间隔（默认: ${DEFAULTS.spreadMs}ms）\n  --timeout-ms <ms>       单用户加入超时（默认: ${DEFAULTS.timeoutMs}ms）\n  --keep-alive-ms <ms>    模拟成功后保持在线时长（默认: ${DEFAULTS.keepAliveMs}ms）\n  --auto-create-room      无房间时自动创建房间\n  --host-name <name>      自动建房时主持人昵称\n  --room-title <title>    自动建房时房间标题\n  --host-password <pwd>   自动建房时主持人口令\n  --user-prefix <prefix>  模拟用户名前缀（默认: ${DEFAULTS.userPrefix}）\n  --end-room-on-exit      退出时结束自动创建的房间\n  -h, --help              查看帮助\n`);
}

async function fetchRoomState(serverUrl) {
  const url = `${stripTrailingSlash(serverUrl)}/api/room/current`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`查询房间状态失败: HTTP ${response.status}`);
  }
  return response.json();
}

async function createRoom(options) {
  const socket = io(options.server, {
    autoConnect: true,
    reconnection: false,
  });

  try {
    await waitForConnect(socket, options.timeoutMs);
    const response = await emitWithAck(socket, 'room:create', {
      userName: options.hostName,
      title: options.roomTitle,
      password: options.hostPassword,
    }, options.timeoutMs);

    if (!response?.success) {
      const code = response?.error?.code || 'UNKNOWN';
      const message = response?.error?.message || '未知错误';
      throw new Error(`自动创建房间失败: [${code}] ${message}`);
    }

    return { socket, response };
  } catch (error) {
    socket.disconnect();
    throw error;
  }
}

async function simulateParticipants(options, signalState) {
  const users = Array.from({ length: options.count }, (_, idx) => {
    const serial = String(idx + 1).padStart(2, '0');
    return `${options.userPrefix}-${serial}`;
  });

  const successes = [];
  const failures = [];

  const tasks = users.map((userName, idx) =>
    (async () => {
      if (options.spreadMs > 0) {
        await sleep(idx * options.spreadMs);
      }

      if (signalState.aborted) {
        failures.push({ userName, code: 'ABORTED', message: `收到 ${signalState.signal}，已中止后续加入` });
        return;
      }

      const result = await joinOneParticipant(options, userName);
      if (result.ok) {
        successes.push(result.data);
        const current = String(successes.length).padStart(2, '0');
        console.log(`[join:ok ${current}/${options.count}] ${userName}`);
      } else {
        failures.push({ userName, code: result.code, message: result.message });
        console.log(`[join:failed] ${userName} -> ${result.code}: ${result.message}`);
      }
    })()
  );

  await Promise.all(tasks);
  return { successes, failures };
}

async function joinOneParticipant(options, userName) {
  const socket = io(options.server, {
    autoConnect: true,
    reconnection: false,
  });

  try {
    await waitForConnect(socket, options.timeoutMs);

    const response = await emitWithAck(socket, 'room:join', { userName }, options.timeoutMs);

    if (!response?.success) {
      socket.disconnect();
      return {
        ok: false,
        code: response?.error?.code || 'UNKNOWN',
        message: response?.error?.message || '未知错误',
      };
    }

    return {
      ok: true,
      data: {
        userName,
        socket,
        ticket: response.data.ticket,
        userId: response.data.userId,
      },
    };
  } catch (error) {
    socket.disconnect();
    return {
      ok: false,
      code: 'CONNECT_OR_TIMEOUT',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function groupFailures(failures) {
  const map = {};

  for (const item of failures) {
    const key = item.code || 'UNKNOWN';
    if (!map[key]) {
      map[key] = [];
    }
    map[key].push(item.userName);
  }

  return map;
}

async function keepAliveUntilExit(keepAliveMs, onlineCount, signalState) {
  if (onlineCount <= 0) {
    return;
  }

  if (keepAliveMs <= 0) {
    return;
  }

  console.log('');
  console.log(`[hold] 模拟用户在线保持 ${keepAliveMs}ms，可在此期间观察前端效果。`);
  await Promise.race([sleep(keepAliveMs), signalState.wait()]);
}

async function gracefulShutdown(context) {
  const { participantSockets, createdRoom, hostSocket, options } = context;

  if (participantSockets.length > 0) {
    console.log('[cleanup] 正在让模拟用户离开房间...');

    await Promise.all(
      participantSockets.map(async (socket) => {
        if (!socket.connected) {
          socket.disconnect();
          return;
        }

        try {
          await emitWithAck(socket, 'room:leave', {}, Math.max(options.timeoutMs, 3000));
        } catch {
          // 忽略清理阶段的错误，确保脚本可退出
        } finally {
          socket.disconnect();
        }
      })
    );
  }

  if (hostSocket) {
    if (createdRoom && options.endRoomOnExit && hostSocket.connected) {
      try {
        console.log('[cleanup] 正在结束自动创建的房间...');
        await emitWithAck(hostSocket, 'room:end', {}, Math.max(options.timeoutMs, 3000));
      } catch {
        // 忽略清理阶段错误
      }
    }
    hostSocket.disconnect();
  }

  console.log('[done] 已完成清理并退出。');
}

function waitForConnect(socket, timeoutMs) {
  if (socket.connected) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`连接超时 (${timeoutMs}ms)`));
    }, timeoutMs);

    const onConnect = () => {
      cleanup();
      resolve();
    };

    const onError = (error) => {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    };

    function cleanup() {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    }

    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
  });
}

function emitWithAck(socket, event, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
      if (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      resolve(response);
    });
  });
}

function stripTrailingSlash(url) {
  return url.replace(/\/+$/, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSignalState() {
  let aborted = false;
  let signal = '';
  let resolveWait;

  const waitPromise = new Promise((resolve) => {
    resolveWait = resolve;
  });

  const onSignal = (receivedSignal) => {
    if (aborted) {
      return;
    }
    aborted = true;
    signal = receivedSignal;
    console.log(`\n[signal] 收到 ${receivedSignal}，准备清理并退出...`);
    resolveWait();
  };

  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  return {
    get aborted() {
      return aborted;
    },
    get signal() {
      return signal;
    },
    wait() {
      return waitPromise;
    },
    detach() {
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
    },
  };
}

main().catch((error) => {
  console.error('[error]', error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
