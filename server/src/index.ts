import express, { Request } from 'express';
import http from 'http';
import os from 'os';
import path from 'path';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './roomManager';
import { clearActiveRoomChannel, emitRoomClosed, registerHandlers } from './handlers';
import {
  HOST_PASSWORD,
  MAX_IMAGE_UPLOAD_BYTES,
  IS_HOST_PASSWORD_DEFAULT,
  IS_PRODUCTION,
  ROOM_CLEANUP_INTERVAL_MS,
  SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES,
  SOCKET_PING_INTERVAL_MS,
  SOCKET_PING_TIMEOUT_MS,
} from './config';
import { isRateLimitedByWindow, RateLimitWindow } from './rateLimit';
import { createAssetStorage } from './assetStorage';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const ACTIVE_ROOM_CHANNEL = 'room:active';

const TRUST_PROXY = parseTrustProxySetting(process.env.TRUST_PROXY);
// 单端口自托管模式（CLIENT_DIST_PATH）面向局域网，默认放行为同源反射；
// 公网反代部署仍强制显式配置 CORS_ALLOW_ORIGIN
const IS_SELF_HOSTED = Boolean(process.env.CLIENT_DIST_PATH);
const CORS_ALLOW_ORIGIN = resolveCorsOriginSetting(process.env.CORS_ALLOW_ORIGIN, IS_SELF_HOSTED);

const app = express();
app.set('trust proxy', TRUST_PROXY);
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CORS_ALLOW_ORIGIN,
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES,
  pingInterval: SOCKET_PING_INTERVAL_MS,
  pingTimeout: SOCKET_PING_TIMEOUT_MS,
});

app.disable('x-powered-by');

// 基础安全响应头：全局 nosniff + 禁止被第三方页面 iframe 嵌套
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.use(
  cors({
    origin: CORS_ALLOW_ORIGIN,
  }),
);
app.use(express.json({ limit: '256kb' }));

const IMAGE_UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000;
const IMAGE_UPLOAD_RATE_LIMIT_MAX_REQUESTS = parseRateLimitMaxRequests(
  process.env.IMAGE_UPLOAD_RATE_LIMIT_MAX_REQUESTS,
  30,
);
// 线下场景所有参与者共享出口 IP，校验类 HTTP 限流按 NAT 规模放宽（可配）
const TICKET_CHECK_HTTP_RATE_LIMIT_WINDOW_MS = parsePositiveIntEnv(
  process.env.TICKET_CHECK_RATE_LIMIT_WINDOW_MS,
  60_000,
  1_000,
  600_000,
);
const TICKET_CHECK_HTTP_RATE_LIMIT_MAX = parseRateLimitMaxRequests(
  process.env.TICKET_CHECK_RATE_LIMIT_MAX_REQUESTS,
  300,
);

app.post(
  '/api/uploads/image',
  express.raw({ type: () => true, limit: MAX_IMAGE_UPLOAD_BYTES }),
  async (req, res) => {
    const ticket = resolveTicketHeader(req.headers['x-open-meetup-ticket']);
    if (!ticket) {
      res.status(400).json({ error: 'Ticket is required.' });
      return;
    }
    const pageId = resolvePageIdHeader(req.headers['x-open-meetup-page-id']);
    if (!pageId) {
      res.status(400).json({ error: 'Page ID is required.' });
      return;
    }

    const rateLimitKey = `${getTicketCheckRateLimitKey(req)}:${ticket}`;
    if (
      isRateLimitedByWindow(imageUploadRateState, rateLimitKey, {
        windowMs: IMAGE_UPLOAD_RATE_LIMIT_WINDOW_MS,
        max: IMAGE_UPLOAD_RATE_LIMIT_MAX_REQUESTS,
        compactThreshold: 5_000,
      })
    ) {
      res.status(429).json({ error: 'Too many image uploads. Please retry later.' });
      return;
    }

    const mimeType = normalizeMimeType(req.headers['content-type']);
    if (!mimeType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image upload is supported.' });
      return;
    }

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buffer.length === 0) {
      res.status(400).json({ error: 'Image payload is empty.' });
      return;
    }

    try {
      const result = await roomManager.uploadImageByTicket(ticket, mimeType, buffer, pageId);
      if (!result.success) {
        const statusCode =
          result.error.code === 'NOT_AUTHORIZED' ? 403 : result.error.code === 'RATE_LIMITED' ? 429 : 400;
        res.status(statusCode).json({ error: result.error.message, code: result.error.code });
        return;
      }
      res.json({ url: result.data.url });
    } catch (error) {
      console.error('[HTTP] image upload failed', error);
      res.status(500).json({ error: 'Image upload failed.' });
    }
  },
);

const assetStorage = createAssetStorage();
const roomManager = new RoomManager(undefined, assetStorage);
registerHandlers(io, roomManager);
const ticketCheckRateState = new Map<string, RateLimitWindow>();
const imageUploadRateState = new Map<string, RateLimitWindow>();
const templateAssetRateState = new Map<string, RateLimitWindow>();

app.post(
  '/api/uploads/template-asset',
  express.raw({ type: () => true, limit: MAX_IMAGE_UPLOAD_BYTES }),
  async (req, res) => {
    const ticket = resolveTicketHeader(req.headers['x-open-meetup-ticket']);
    if (!ticket) {
      res.status(400).json({ error: 'Ticket is required.' });
      return;
    }

    const rateLimitKey = `${getTicketCheckRateLimitKey(req)}:${ticket}`;
    if (
      isRateLimitedByWindow(templateAssetRateState, rateLimitKey, {
        windowMs: IMAGE_UPLOAD_RATE_LIMIT_WINDOW_MS,
        max: IMAGE_UPLOAD_RATE_LIMIT_MAX_REQUESTS,
        compactThreshold: 5_000,
      })
    ) {
      res.status(429).json({ error: 'Too many template asset uploads. Please retry later.' });
      return;
    }

    const mimeType = normalizeMimeType(req.headers['content-type']);
    if (!mimeType.startsWith('image/')) {
      res.status(400).json({ error: 'Only image upload is supported.' });
      return;
    }

    const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (buffer.length === 0) {
      res.status(400).json({ error: 'Image payload is empty.' });
      return;
    }

    try {
      const result = await roomManager.uploadTemplateAsset(ticket, mimeType, buffer);
      if (!result.success) {
        const statusCode =
          result.error.code === 'NOT_AUTHORIZED' ? 403 : result.error.code === 'RATE_LIMITED' ? 429 : 400;
        res.status(statusCode).json({ error: result.error.message, code: result.error.code });
        return;
      }
      res.json({ url: result.data.url });
    } catch (error) {
      console.error('[HTTP] template asset upload failed', error);
      res.status(500).json({ error: 'Template asset upload failed.' });
    }
  },
);

app.get('/uploads/:roomId/:fileName', async (req, res) => {
  const roomId = sanitizeUploadRoomId(req.params.roomId);
  const fileName = sanitizeUploadFileName(req.params.fileName);
  if (!roomId || !fileName) {
    res.status(404).json({ error: 'Asset not found' });
    return;
  }

  try {
    const asset = await assetStorage.getObject(roomId, fileName);
    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }
    if (asset.contentType) {
      res.setHeader('Content-Type', asset.contentType);
    }
    // 用户上传内容一律按不可信数据处理：
    // sandbox CSP 阻止 SVG/伪装文件在站点源执行脚本，nosniff 阻止浏览器猜测类型
    res.setHeader('Content-Security-Policy', 'sandbox');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (asset.contentType === 'image/svg+xml') {
      res.setHeader('Content-Disposition', 'attachment');
    }
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.send(asset.buffer);
  } catch (error) {
    console.error('[HTTP] failed to load uploaded asset', error);
    res.status(500).json({ error: 'Failed to load asset' });
  }
});

app.get('/api/room/current', (_req, res) => {
  const room = roomManager.getActiveRoom();
  if (!room) {
    res.json({ exists: false });
    return;
  }

  res.json({
    exists: true,
    title: room.title,
    participantLimit: room.participantLimit,
    status: room.status,
    phase: room.phase,
    currentStep: room.currentStep,
    totalPages: room.pages.length,
    hostId: room.hostId,
  });
});

// Ticket 校验改用 POST：避免敏感凭证进入访问日志与代理日志
app.post('/api/room/ticket-check', (req, res) => {
  const rateLimitKey = getTicketCheckRateLimitKey(req);
  if (
    isRateLimitedByWindow(ticketCheckRateState, rateLimitKey, {
      windowMs: TICKET_CHECK_HTTP_RATE_LIMIT_WINDOW_MS,
      max: TICKET_CHECK_HTTP_RATE_LIMIT_MAX,
      compactThreshold: 5_000,
    })
  ) {
    res.status(429).json({ valid: false, error: 'Too many requests. Please retry later.' });
    return;
  }

  const body = typeof req.body === 'object' && req.body !== null ? (req.body as Record<string, unknown>) : {};
  const ticket = typeof body.ticket === 'string' ? body.ticket : '';
  if (!ticket.trim()) {
    res.status(400).json({ valid: false, error: 'Ticket is required.' });
    return;
  }

  const result = roomManager.checkTicket(ticket);
  if (!result.valid) {
    res.json({ valid: false, error: 'Ticket invalid or room unavailable.' });
    return;
  }

  res.json({ valid: true });
});

app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    activeRooms: roomManager.getActiveRoomCount(),
    disconnectGraceMs: roomManager.getDisconnectGraceMs(),
    socketPingIntervalMs: SOCKET_PING_INTERVAL_MS,
    socketPingTimeoutMs: SOCKET_PING_TIMEOUT_MS,
  });
});

// 生产模式：通过 CLIENT_DIST_PATH 环境变量直接托管前端静态文件
// 开发模式：前端由 Vite dev server 独立提供
const CLIENT_DIST_PATH = process.env.CLIENT_DIST_PATH;
if (CLIENT_DIST_PATH) {
  const resolvedClientPath = path.resolve(CLIENT_DIST_PATH);
  app.use(express.static(resolvedClientPath, { index: false }));
  // SPA fallback：所有非 API/uploads 请求返回 index.html
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/') || req.path === '/health') {
      return next();
    }
    res.sendFile(path.join(resolvedClientPath, 'index.html'), (error) => {
      if (error) {
        res.status(500).json({ error: 'Client bundle is missing. Run `npm run build` first.' });
      }
    });
  });
  console.log(`[server] Serving client from: ${resolvedClientPath}`);
}

server.listen(PORT, HOST, () => {
  const lanAddresses = getLanIPv4Addresses();
  const lanHint =
    lanAddresses.length > 0
      ? lanAddresses.map((ip) => `   LAN:   http://${ip}:${PORT}`).join('\n')
      : '   LAN:   (未检测到局域网网卡)';
  const passwordHint = IS_HOST_PASSWORD_DEFAULT ? HOST_PASSWORD : '已通过环境变量/启动参数设置';

  console.log(`
🚀 Open Meetup Server running on:
   Local: http://localhost:${PORT}
${lanHint}

💡 参与者请用上方 LAN 地址访问
🔑 主持人口令: ${passwordHint}
`);
  if (IS_HOST_PASSWORD_DEFAULT) {
    console.warn(
      '[Config] 警告：正在使用默认主持人口令，仅建议本机体验使用。正式活动请通过 HOST_PASSWORD 或 --host-password 设置强口令。',
    );
  }
});

function getLanIPv4Addresses(): string[] {
  const results: string[] = [];
  const interfaces = os.networkInterfaces();
  for (const addresses of Object.values(interfaces)) {
    for (const item of addresses ?? []) {
      if (item.family === 'IPv4' && !item.internal) {
        results.push(item.address);
      }
    }
  }
  return results;
}

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  console.log(`[Server] Received ${signal}, shutting down...`);

  try {
    // 有活动房间时主动告知所有客户端，避免参与者停在"幽灵房间"里
    if (roomManager.getActiveRoom()) {
      emitRoomClosed(io, 'SERVER_SHUTDOWN');
      clearActiveRoomChannel(io);
    }
  } catch (error) {
    console.error('[Server] failed to notify room on shutdown', error);
  }

  io.close();
  server.close(() => {
    process.exit(0);
  });
  // 兜底：连接未及时断开时强制退出
  setTimeout(() => {
    process.exit(0);
  }, 3_000).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

let cleanupRunning = false;
setInterval(async () => {
  if (cleanupRunning) {
    return;
  }
  cleanupRunning = true;
  try {
    const cleanup = await roomManager.cleanupExpired();
    if (cleanup.removedParticipants.length > 0 && cleanup.closedRooms.length === 0) {
      emitStateSync(io, roomManager);
    }

    if (cleanup.closedRooms.length > 0) {
      for (const room of cleanup.closedRooms) {
        emitRoomClosed(io, room.reason);
      }
      clearActiveRoomChannel(io);
      console.log(`[Cleanup] Closed ${cleanup.closedRooms.length} room(s) due to expiration`);
    }
  } catch (error) {
    console.error('[Cleanup] cleanupExpired failed', error);
  } finally {
    cleanupRunning = false;
  }
}, ROOM_CLEANUP_INTERVAL_MS);

function emitStateSync(io: Server, roomManager: RoomManager) {
  pruneActiveRoomChannel(io, roomManager);
  const snapshot = roomManager.getPublicRoomSnapshot();
  if (!snapshot.success) {
    return;
  }

  // state:sync 不携带 pageContents：内容走 content:update / content:reset 增量通道，
  // 避免每次翻页把全部画布内容重发给每个参与者
  io.to(ACTIVE_ROOM_CHANNEL).emit('state:sync', {
    participants: snapshot.data.participants,
    status: snapshot.data.status,
    phase: snapshot.data.phase,
    currentStep: snapshot.data.currentStep,
    hostId: snapshot.data.hostId,
    pages: snapshot.data.pages,
  });
}

function pruneActiveRoomChannel(io: Server, roomManager: RoomManager): void {
  const roomSockets = io.sockets.adapter.rooms.get(ACTIVE_ROOM_CHANNEL);
  if (!roomSockets) {
    return;
  }
  for (const socketId of roomSockets) {
    const roomSocket = io.sockets.sockets.get(socketId);
    if (!roomSocket) {
      continue;
    }
    const identity = roomSocket.data?.identity;
    if (
      !identity ||
      typeof identity.userId !== 'string' ||
      typeof identity.sessionId !== 'string' ||
      !roomManager.isSocketIdentityAuthorized(socketId, {
        userId: identity.userId,
        sessionId: identity.sessionId,
      })
    ) {
      roomSocket.data.identity = undefined;
      roomSocket.leave(ACTIVE_ROOM_CHANNEL);
    }
  }
}

function parseRateLimitMaxRequests(rawValue: string | undefined, fallback: number): number {
  const parsed = Number(rawValue);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  if (normalized < 1 || normalized > 10_000) {
    return fallback;
  }
  return normalized;
}

function parseTrustProxySetting(rawValue: string | undefined): boolean | number {
  const normalized = rawValue?.trim();
  if (!normalized) {
    return false;
  }
  if (normalized === 'true') {
    return true;
  }
  if (normalized === 'false') {
    return false;
  }
  const hops = Number(normalized);
  if (Number.isInteger(hops) && hops >= 1) {
    return hops;
  }
  return false;
}

function resolveCorsOriginSetting(rawValue: string | undefined, selfHosted: boolean): true | string[] {
  const normalized = rawValue?.trim() ?? '';
  if (!normalized) {
    if (IS_PRODUCTION && !selfHosted) {
      throw new Error('[Config] CORS_ALLOW_ORIGIN is required for public deployments (no CLIENT_DIST_PATH).');
    }
    if (IS_PRODUCTION && selfHosted) {
      console.warn(
        '[Config] CORS_ALLOW_ORIGIN 未配置，已按局域网自托管模式放行同源请求。若部署到公网请显式配置。',
      );
    }
    return true;
  }
  if (normalized === '*') {
    if (IS_PRODUCTION) {
      throw new Error('[Config] CORS_ALLOW_ORIGIN cannot be "*" in production. Please set explicit origins.');
    }
    return true;
  }

  const origins = normalized
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (origins.length === 0) {
    if (IS_PRODUCTION) {
      throw new Error('[Config] CORS_ALLOW_ORIGIN is invalid in production environment.');
    }
    return true;
  }
  return origins;
}

function parsePositiveIntEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  if (normalized < min || normalized > max) {
    return fallback;
  }
  return normalized;
}

function getTicketCheckRateLimitKey(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

function sanitizeUploadRoomId(segment: unknown): string {
  if (typeof segment !== 'string') {
    return '';
  }
  const trimmed = segment.trim();
  if (!trimmed) {
    return '';
  }
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function sanitizeUploadFileName(segment: unknown): string {
  if (typeof segment !== 'string') {
    return '';
  }
  const trimmed = segment.trim();
  if (!trimmed) {
    return '';
  }
  if (!/^[a-zA-Z0-9_-]{1,128}\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function resolveTicketHeader(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim().toUpperCase() : '';
  }
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toUpperCase();
}

function resolvePageIdHeader(value: unknown): string {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0].trim() : '';
  }
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim();
}

function normalizeMimeType(value: unknown): string {
  if (Array.isArray(value)) {
    return normalizeMimeType(value[0]);
  }
  if (typeof value !== 'string') {
    return '';
  }
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}
