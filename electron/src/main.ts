import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog } from 'electron';
import path from 'path';
import { fork, ChildProcess } from 'child_process';
import http from 'http';
import os from 'os';
import fs from 'fs';

// ---------------------------------------------------------------------------
// Paths — resolve relative to the packaged app or dev layout
// ---------------------------------------------------------------------------

const IS_PACKAGED = app.isPackaged;

function resolveProjectPath(...segments: string[]): string {
  if (IS_PACKAGED) {
    return path.join(process.resourcesPath, 'app', ...segments);
  }
  return path.join(__dirname, '..', '..', ...segments);
}

const SERVER_ENTRY = resolveProjectPath('server', 'dist', 'index.js');
const CLIENT_DIST = resolveProjectPath('client', 'dist');
const PRELOAD_PATH = path.join(__dirname, 'preload.js');

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let mainWindow: BrowserWindow | null = null;
let configWindow: BrowserWindow | null = null;
let serverProcess: ChildProcess | null = null;
let _tray: Tray | null = null;

interface AppConfig {
  port: number;
  hostPassword: string;
  roomTitle: string;
}

const DEFAULT_CONFIG: AppConfig = {
  port: 3001,
  hostPassword: '12345678',
  roomTitle: 'Open Meetup',
};

// ---------------------------------------------------------------------------
// Persistent config (electron-store)
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let store: any = null;

async function loadStore(): Promise<void> {
  // electron-store is ESM-only v8+; dynamic import
  const { default: Store } = await import('electron-store');
  store = new Store({
    name: 'open-meetup-config',
    defaults: DEFAULT_CONFIG,
  });
}

function getConfig(): AppConfig {
  if (!store) {
    return { ...DEFAULT_CONFIG };
  }
  return {
    port: store.get('port', DEFAULT_CONFIG.port) as number,
    hostPassword: store.get('hostPassword', DEFAULT_CONFIG.hostPassword) as string,
    roomTitle: store.get('roomTitle', DEFAULT_CONFIG.roomTitle) as string,
  };
}

function saveConfig(cfg: Partial<AppConfig>): void {
  if (!store) return;
  if (cfg.port !== undefined) store.set('port', cfg.port);
  if (cfg.hostPassword !== undefined) store.set('hostPassword', cfg.hostPassword);
  if (cfg.roomTitle !== undefined) store.set('roomTitle', cfg.roomTitle);
}

// ---------------------------------------------------------------------------
// Network helpers
// ---------------------------------------------------------------------------

function getLanIp(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

function waitForServer(port: number, maxAttempts = 30, intervalMs = 500): Promise<void> {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts += 1;
      const req = http.get(`http://127.0.0.1:${port}/health`, (res) => {
        if (res.statusCode === 200) {
          resolve();
        } else if (attempts < maxAttempts) {
          setTimeout(check, intervalMs);
        } else {
          reject(new Error(`Server health check failed after ${maxAttempts} attempts`));
        }
        res.resume();
      });
      req.on('error', () => {
        if (attempts < maxAttempts) {
          setTimeout(check, intervalMs);
        } else {
          reject(new Error(`Server not reachable after ${maxAttempts} attempts`));
        }
      });
      req.end();
    };
    check();
  });
}

// ---------------------------------------------------------------------------
// Server management
// ---------------------------------------------------------------------------

function startServer(config: AppConfig): ChildProcess {
  const env: Record<string, string> = {
    PORT: String(config.port),
    HOST: '0.0.0.0',
    HOST_PASSWORD: config.hostPassword,
    CORS_ALLOW_ORIGIN: '*',
    NODE_ENV: 'development', // avoid production CORS / password strictness
    CLIENT_DIST_PATH: CLIENT_DIST, // 让 Express 直接托管前端静态文件，无需 proxy
  };

  // Verify server entry exists
  if (!fs.existsSync(SERVER_ENTRY)) {
    throw new Error(`Server entry not found: ${SERVER_ENTRY}`);
  }

  const child = fork(SERVER_ENTRY, [], {
    cwd: resolveProjectPath('server'),
    env: { ...process.env, ...env },
    silent: true,
  });

  child.stdout?.on('data', (data: Buffer) => {
    console.log(`[server] ${data.toString().trim()}`);
  });

  child.stderr?.on('data', (data: Buffer) => {
    console.error(`[server] ${data.toString().trim()}`);
  });

  child.on('exit', (code, signal) => {
    console.log(`[server] exited code=${code} signal=${signal}`);
    serverProcess = null;
  });

  return child;
}

function killServer(): void {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
    // Force-kill after timeout
    setTimeout(() => {
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }, 3000);
  }
  serverProcess = null;
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function createMainWindow(port: number): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Open Meetup',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // In production (packaged) the client is served by the Express server
  // via the static middleware we inject. In dev we also use the server URL
  // because the built client is served the same way.
  // 使用 localhost 访问本机 proxy
  win.loadURL(`http://localhost:${port}`);

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

function createConfigWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 480,
    height: 420,
    resizable: false,
    title: 'Open Meetup — 设置',
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  const config = getConfig();
  const lanIp = getLanIp();

  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Open Meetup 设置</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f5f5f5; padding: 32px; color: #333;
  }
  h1 { font-size: 20px; margin-bottom: 24px; text-align: center; }
  label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 4px; margin-top: 16px; }
  input {
    width: 100%; padding: 8px 12px; border: 1px solid #ccc; border-radius: 6px;
    font-size: 14px; outline: none;
  }
  input:focus { border-color: #4f8cff; box-shadow: 0 0 0 2px rgba(79,140,255,0.2); }
  .hint { font-size: 11px; color: #888; margin-top: 2px; }
  .btn {
    display: block; width: 100%; margin-top: 28px; padding: 10px;
    background: #4f8cff; color: #fff; border: none; border-radius: 6px;
    font-size: 15px; font-weight: 600; cursor: pointer;
  }
  .btn:hover { background: #3a75e6; }
</style>
</head>
<body>
  <h1>🚀 Open Meetup 配置</h1>
  <label for="port">服务端口</label>
  <input id="port" type="number" value="${config.port}" min="1024" max="65535">
  <div class="hint">局域网地址: http://${lanIp}:&lt;端口&gt;</div>

  <label for="password">主持人密码</label>
  <input id="password" type="text" value="${config.hostPassword}">

  <label for="title">房间名称</label>
  <input id="title" type="text" value="${config.roomTitle}">

  <button class="btn" id="start">启动服务</button>

  <script>
    document.getElementById('start').addEventListener('click', () => {
      const port = parseInt(document.getElementById('port').value, 10);
      const hostPassword = document.getElementById('password').value.trim();
      const roomTitle = document.getElementById('title').value.trim();
      window.electronAPI.saveConfigAndStart({ port, hostPassword, roomTitle });
    });
  </script>
</body>
</html>`;

  win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  win.on('closed', () => {
    configWindow = null;
  });

  return win;
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function createTray(port: number): Tray {
  const trayIcon = createTrayIcon();

  const t = new Tray(trayIcon);
  const lanIp = getLanIp();

  const updateMenu = () => {
    const contextMenu = Menu.buildFromTemplate([
      { label: `Open Meetup — 运行中`, enabled: false },
      { type: 'separator' },
      { label: `局域网: http://${lanIp}:${port}`, enabled: false },
      { label: `本地: http://localhost:${port}`, enabled: false },
      { type: 'separator' },
      {
        label: '打开窗口',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            mainWindow = createMainWindow(port);
          }
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          app.quit();
        },
      },
    ]);
    t.setContextMenu(contextMenu);
    t.setToolTip(`Open Meetup — http://${lanIp}:${port}`);
  };

  updateMenu();
  return t;
}

function createTrayIcon(): Electron.NativeImage {
  // Generate a simple 16x16 PNG icon with a filled circle
  // This is a minimal 16x16 RGBA PNG (blue circle on transparent)
  // For production, replace with a proper icon file
  const size = 16;

  if (process.platform === 'darwin') {
    // Use a template image on macOS for menu bar
    const canvas = Buffer.alloc(size * size * 4, 0);
    const cx = size / 2;
    const cy = size / 2;
    const r = 6;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - cx + 0.5;
        const dy = y - cy + 0.5;
        if (dx * dx + dy * dy <= r * r) {
          const offset = (y * size + x) * 4;
          canvas[offset] = 0; // R
          canvas[offset + 1] = 0; // G
          canvas[offset + 2] = 0; // B
          canvas[offset + 3] = 255; // A
        }
      }
    }
    const img = nativeImage.createFromBuffer(canvas, { width: size, height: size });
    img.setTemplateImage(true);
    return img;
  }

  // Windows / Linux: blue circle
  const canvas = Buffer.alloc(size * size * 4, 0);
  const cx = size / 2;
  const cy = size / 2;
  const r = 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5;
      const dy = y - cy + 0.5;
      if (dx * dx + dy * dy <= r * r) {
        const offset = (y * size + x) * 4;
        canvas[offset] = 79; // R
        canvas[offset + 1] = 140; // G
        canvas[offset + 2] = 255; // B
        canvas[offset + 3] = 255; // A
      }
    }
  }
  return nativeImage.createFromBuffer(canvas, { width: size, height: size });
}

// ---------------------------------------------------------------------------
// (Proxy 已移除 — Express 通过 CLIENT_DIST_PATH 直接托管静态文件，单端口架构)

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

let proxyPort = 0; // The port the user-facing proxy runs on

async function launchApp(config: AppConfig): Promise<void> {
  // 单端口架构：Express 同时托管 API + Socket.IO + 前端静态文件
  // 用户配置的端口 = 所有人访问的端口，零 proxy
  const port = config.port;

  // 1. Start the server (Express 内置静态文件托管，通过 CLIENT_DIST_PATH 环境变量)
  console.log(`[main] Starting server on port ${port}...`);
  serverProcess = startServer(config);

  // 2. Wait for the server to be ready
  try {
    await waitForServer(port);
    console.log('[main] Server is ready');
  } catch (err) {
    console.error('[main] Server failed to start:', err);
    dialog.showErrorBox('启动失败', `端口 ${port} 被占用，请在设置中更换端口。`);
    killServer();
    app.quit();
    return;
  }

  proxyPort = port;

  // 3. Create main window
  mainWindow = createMainWindow(port);

  // 4. Create tray — shows LAN IP for sharing
  _tray = createTray(port);
}

app.whenReady().then(async () => {
  await loadStore();

  const config = getConfig();
  const isFirstRun = !store?.has('port');

  if (isFirstRun) {
    // Show config window on first run
    configWindow = createConfigWindow();
  } else {
    // Launch directly with saved config
    await launchApp(config);
  }

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (proxyPort > 0) {
        mainWindow = createMainWindow(proxyPort);
      }
    }
  });
});

// IPC: config window sends config and requests startup
ipcMain.on('save-config-and-start', async (_event, config: AppConfig) => {
  saveConfig(config);

  if (configWindow) {
    configWindow.close();
    configWindow = null;
  }

  await launchApp(getConfig());
});

// macOS: don't quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  killServer();
});

app.on('will-quit', () => {
  killServer();
});
