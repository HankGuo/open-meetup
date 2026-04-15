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
  win.loadURL(`http://127.0.0.1:${port}`);

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
// Client proxy — serves static client files and proxies API/socket.io
// to the backend server. This allows the client to use window.location.origin
// for API calls (production mode) while keeping server code unmodified.
// ---------------------------------------------------------------------------

function startClientProxy(backendPort: number, proxyPort: number, clientDistPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url || '/';

      // Proxy API requests, health, uploads, and socket.io to backend
      if (
        url.startsWith('/api/') ||
        url.startsWith('/health') ||
        url.startsWith('/uploads/') ||
        url.startsWith('/socket.io/')
      ) {
        const proxyReq = http.request(
          {
            hostname: '127.0.0.1',
            port: backendPort,
            path: url,
            method: req.method,
            headers: req.headers,
          },
          (proxyRes) => {
            res.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
            proxyRes.pipe(res);
          },
        );
        proxyReq.on('error', (_err) => {
          res.writeHead(502);
          res.end('Bad Gateway');
        });
        req.pipe(proxyReq);
        return;
      }

      // Serve static files from client dist
      serveStaticFile(clientDistPath, url, res);
    });

    // Handle WebSocket upgrades for socket.io
    server.on('upgrade', (req, socket, _head) => {
      const options = {
        hostname: '127.0.0.1',
        port: backendPort,
        path: req.url,
        method: req.method,
        headers: req.headers,
      };

      const proxyReq = http.request(options);
      proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
        socket.write(
          `HTTP/1.1 ${proxyRes.statusCode || 101} ${proxyRes.statusMessage || 'Switching Protocols'}\r\n` +
            Object.entries(proxyRes.headers)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\r\n') +
            '\r\n\r\n',
        );
        if (proxyHead.length > 0) {
          socket.write(proxyHead);
        }
        proxySocket.pipe(socket);
        socket.pipe(proxySocket);
      });
      proxyReq.on('error', () => {
        socket.destroy();
      });
      proxyReq.end();
    });

    server.listen(proxyPort, '0.0.0.0', () => {
      console.log(`[proxy] Client proxy listening on port ${proxyPort}`);
      resolve(proxyPort);
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Try next port
        server.listen(proxyPort + 1, '0.0.0.0');
      } else {
        reject(err);
      }
    });
  });
}

function serveStaticFile(basePath: string, urlPath: string, res: http.ServerResponse): void {
  // Strip query params
  const cleanPath = urlPath.split('?')[0];

  // Map URL to filesystem
  const filePath = path.join(basePath, cleanPath);

  // Security: prevent path traversal
  if (!filePath.startsWith(basePath)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Try to serve the file; fall back to index.html (SPA routing)
  fs.stat(filePath, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(filePath, res);
    } else if (!err && stats.isDirectory()) {
      const indexPath = path.join(filePath, 'index.html');
      fs.stat(indexPath, (err2) => {
        if (!err2) {
          sendFile(indexPath, res);
        } else {
          sendFile(path.join(basePath, 'index.html'), res);
        }
      });
    } else {
      // SPA fallback
      sendFile(path.join(basePath, 'index.html'), res);
    }
  });
}

function sendFile(filePath: string, res: http.ServerResponse): void {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': data.length,
    });
    res.end(data);
  });
}

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------

let proxyPort = 0; // The port the user-facing proxy runs on

async function launchApp(config: AppConfig): Promise<void> {
  const backendPort = config.port;

  // 1. Start the backend server
  console.log(`[main] Starting server on port ${backendPort}...`);
  serverProcess = startServer(config);

  // 2. Wait for the server to be ready
  try {
    await waitForServer(backendPort);
    console.log('[main] Server is ready');
  } catch (err) {
    console.error('[main] Server failed to start:', err);
    dialog.showErrorBox('启动失败', `服务启动超时，请检查端口 ${backendPort} 是否被占用。`);
    killServer();
    app.quit();
    return;
  }

  // 3. Start the client proxy on proxyPort (= backendPort + 1 by default,
  //    but the user sees backendPort as "the port"). To keep things simple,
  //    the user-facing port IS the proxy port, and the backend port is internal.
  //    Let's reassign: backend uses an internal port, proxy uses config.port.
  //    But we can't change the backend port after fork()...
  //
  //    Solution: backend on config.port, proxy on config.port + 1000 (internal).
  //    Actually — let the proxy run on config.port and backend on config.port+1.
  //    But the backend is already started on config.port...
  //
  //    Simplest: proxy runs on a different port. The user-facing URL is the
  //    proxy port. Let's use backendPort + 100 or find a free port.
  //
  //    REVISED: backend runs on backendPort (from config). Proxy runs on
  //    backendPort + 1000. The main window loads from the proxy. The LAN
  //    URL shared is the proxy URL. This keeps it clean.

  const clientProxyPort = backendPort + 1000;
  try {
    proxyPort = await startClientProxy(backendPort, clientProxyPort, CLIENT_DIST);
    console.log(`[main] Client proxy ready on port ${proxyPort}`);
  } catch (err) {
    console.error('[main] Client proxy failed:', err);
    dialog.showErrorBox('启动失败', '客户端代理启动失败。');
    killServer();
    app.quit();
    return;
  }

  // 4. Create main window
  mainWindow = createMainWindow(proxyPort);

  // 5. Create tray
  _tray = createTray(proxyPort);
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
