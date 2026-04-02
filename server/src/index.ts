import express, { Request } from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './roomManager';
import { clearActiveRoomChannel, emitRoomClosed, registerHandlers } from './handlers';
import { IS_PRODUCTION } from './config';
import { createAssetStorage } from './assetStorage';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES = 25 * 1024 * 1024;
const IMAGE_UPLOAD_MAX_BYTES = 2_000_000;
const ROOM_CLEANUP_INTERVAL_MS = Number(process.env.ROOM_CLEANUP_INTERVAL_MS || 30_000);
const TICKET_CHECK_RATE_LIMIT_WINDOW_MS = 60_000;
const TICKET_CHECK_RATE_LIMIT_MAX_REQUESTS = Number(process.env.TICKET_CHECK_RATE_LIMIT_MAX_REQUESTS || 60);
const TRUST_PROXY = parseTrustProxySetting(process.env.TRUST_PROXY);
const CORS_ALLOW_ORIGIN = resolveCorsOriginSetting(process.env.CORS_ALLOW_ORIGIN);
const ACTIVE_ROOM_CHANNEL = 'room:active';

const app = express();
app.set('trust proxy', TRUST_PROXY);
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: CORS_ALLOW_ORIGIN,
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES,
});

app.use(
  cors({
    origin: CORS_ALLOW_ORIGIN,
  }),
);
app.use(express.json());

app.post(
  '/api/uploads/image',
  express.raw({ type: () => true, limit: IMAGE_UPLOAD_MAX_BYTES }),
  async (req, res) => {
    const ticket = resolveTicketHeader(req.headers['x-open-meetup-ticket']);
    if (!ticket) {
      res.status(400).json({ error: 'Ticket is required.' });
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
      const result = await roomManager.uploadImageByTicket(ticket, mimeType, buffer);
      if (!result.success) {
        const statusCode = result.error.code === 'NOT_AUTHORIZED' ? 403 : 400;
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
const ticketCheckRateState = new Map<string, { windowStart: number; count: number }>();

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

app.get('/api/room/ticket-check', (req, res) => {
  const rateLimitKey = getTicketCheckRateLimitKey(req);
  if (isRateLimited(ticketCheckRateState, rateLimitKey)) {
    res.status(429).json({ valid: false, error: 'Too many requests. Please retry later.' });
    return;
  }

  const ticket = typeof req.query.ticket === 'string' ? req.query.ticket : '';
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
  });
});

server.listen(PORT, HOST, () => {
  const bindUrl = `http://${HOST}:${PORT}`;
  const localUrl = `http://localhost:${PORT}`;
  const networkHint =
    HOST === '0.0.0.0' ? `Use your LAN IP: http://<your-ip>:${PORT}` : `Use bind host: ${bindUrl}`;

  console.log(`
🚀 Open Meetup Server running on:
   Local: ${localUrl}
   Bind: ${bindUrl}

💡 ${networkHint}
`);
});

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

  io.to(ACTIVE_ROOM_CHANNEL).emit('state:sync', {
    participants: snapshot.data.participants,
    status: snapshot.data.status,
    phase: snapshot.data.phase,
    currentStep: snapshot.data.currentStep,
    hostId: snapshot.data.hostId,
    pages: snapshot.data.pages,
    pageContents: snapshot.data.pageContents,
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
      !roomManager.isIdentityAuthorized({ userId: identity.userId, sessionId: identity.sessionId })
    ) {
      roomSocket.data.identity = undefined;
      roomSocket.leave(ACTIVE_ROOM_CHANNEL);
    }
  }
}

function isRateLimited(
  state: Map<string, { windowStart: number; count: number }>,
  key: string,
  now = Date.now(),
): boolean {
  const existing = state.get(key);
  if (!existing || now - existing.windowStart > TICKET_CHECK_RATE_LIMIT_WINDOW_MS) {
    state.set(key, { windowStart: now, count: 1 });
    compactRateLimiterState(state, now);
    return false;
  }

  existing.count += 1;
  if (existing.count > TICKET_CHECK_RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }
  return false;
}

function compactRateLimiterState(
  state: Map<string, { windowStart: number; count: number }>,
  now = Date.now(),
): void {
  if (state.size <= 5000) {
    return;
  }
  for (const [key, value] of state.entries()) {
    if (now - value.windowStart > TICKET_CHECK_RATE_LIMIT_WINDOW_MS * 2) {
      state.delete(key);
    }
  }
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

function resolveCorsOriginSetting(rawValue: string | undefined): true | string[] {
  const normalized = rawValue?.trim() ?? '';
  if (!normalized) {
    if (IS_PRODUCTION) {
      throw new Error('[Config] CORS_ALLOW_ORIGIN is required in production environment.');
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

function getTicketCheckRateLimitKey(req: Request): string {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const userAgent =
    typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 120) : 'unknown';
  return `${ip}:${userAgent}`;
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

function normalizeMimeType(value: unknown): string {
  if (Array.isArray(value)) {
    return normalizeMimeType(value[0]);
  }
  if (typeof value !== 'string') {
    return '';
  }
  return value.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}
