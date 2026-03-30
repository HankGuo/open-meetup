import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { randomUUID } from 'crypto';
import multer from 'multer';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './roomManager';
import { emitRoomClosed, registerHandlers } from './handlers';
import { ErrorResponse, SocketIdentity } from './types';
import {
  cleanupTempFile,
  defaultExtByType,
  ensureUploadDirs,
  normalizeExt,
  parseUploadContentType,
  runUploadGarbageCollection,
  UPLOAD_DIR_BY_TYPE,
  UPLOAD_ROOT,
  UPLOAD_TEMP_DIR,
  UploadContentType,
} from './uploadStorage';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const MAX_UPLOAD_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_UPLOAD_FILE_SIZE_MB = 10;
const SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES = 25 * 1024 * 1024;
const ROOM_CLEANUP_INTERVAL_MS = Number(process.env.ROOM_CLEANUP_INTERVAL_MS || 30_000);
const UPLOAD_GC_INTERVAL_MS = Number(process.env.UPLOAD_GC_INTERVAL_MS || 5 * 60_000);
const UPLOAD_GC_MIN_AGE_MS = Number(process.env.UPLOAD_GC_MIN_AGE_MS || 10 * 60_000);

ensureUploadDirs();

const app = express();
app.set('trust proxy', true);
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  maxHttpBufferSize: SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES,
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOAD_ROOT));

const uploader = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => {
      callback(null, UPLOAD_TEMP_DIR);
    },
    filename: (_req, file, callback) => {
      const ext = normalizeExt(file.originalname);
      callback(null, `${Date.now()}-${randomUUID()}${ext}`);
    },
  }),
  limits: {
    fileSize: MAX_UPLOAD_FILE_SIZE_BYTES,
  },
});

const roomManager = new RoomManager();
registerHandlers(io, roomManager);

app.post('/api/uploads', uploader.single('file'), (req, res) => {
  const file = req.file;
  const uploadType = parseUploadContentType(req.body.contentType);
  const identity = parseSocketIdentity(req.body.userId, req.body.sessionId);

  if (!file) {
    res.status(400).json(failurePayload('请选择要上传的文件', 'BAD_REQUEST'));
    return;
  }

  if (!uploadType) {
    cleanupTempFile(file.path);
    res.status(400).json(failurePayload('contentType 仅支持 image/html/markdown', 'BAD_REQUEST'));
    return;
  }

  if (!identity) {
    cleanupTempFile(file.path);
    res.status(400).json(failurePayload('缺少身份信息，请重新进入房间后重试', 'BAD_REQUEST'));
    return;
  }

  const authResult = roomManager.validateHostIdentity(identity);
  if (!authResult.success) {
    cleanupTempFile(file.path);
    res.status(toHttpStatus(authResult.error.code)).json(authResult);
    return;
  }

  const validationError = validateUploadedFile(file, uploadType);
  if (validationError) {
    cleanupTempFile(file.path);
    res.status(400).json(failurePayload(validationError, 'BAD_REQUEST'));
    return;
  }

  const targetExt = normalizeExt(file.originalname) || defaultExtByType(uploadType);
  const targetFileName = `${Date.now()}-${randomUUID()}${targetExt}`;
  const targetPath = path.join(UPLOAD_DIR_BY_TYPE[uploadType], targetFileName);

  try {
    fs.renameSync(file.path, targetPath);
  } catch {
    cleanupTempFile(file.path);
    res.status(500).json(failurePayload('文件保存失败，请稍后重试', 'INTERNAL_ERROR'));
    return;
  }

  const relativeUrl = `/uploads/${uploadType}/${targetFileName}`;
  const publicUrl = `${resolvePublicBaseUrl(req)}${relativeUrl}`;

  res.json({
    success: true,
    data: {
      url: publicUrl,
      contentType: uploadType,
      size: file.size,
    },
  });
});

app.get('/api/room/current', (req, res) => {
  const room = roomManager.getActiveRoom();
  if (!room) {
    res.json({ exists: false });
    return;
  }
  res.json({
    exists: true,
    title: room.title,
    status: room.status,
    phase: room.phase,
    currentStep: room.currentStep,
    totalPages: room.pages.length,
    hostId: room.hostId,
  });
});

app.get('/api/room/ticket-check', (req, res) => {
  const ticket = req.query.ticket as string;
  if (!ticket) {
    res.status(400).json({ valid: false, error: 'Ticket is required' });
    return;
  }
  const room = roomManager.getActiveRoom();
  if (!room) {
    res.json({ valid: false, error: 'No active room' });
    return;
  }
  const normalizedTicket = ticket.trim().toUpperCase();
  for (const participant of room.participants.values()) {
    if (participant.ticket?.toUpperCase() === normalizedTicket) {
      res.json({ valid: true });
      return;
    }
  }
  res.json({ valid: false, error: 'Invalid ticket' });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeRooms: roomManager.getActiveRoomCount(),
    disconnectGraceMs: roomManager.getDisconnectGraceMs(),
  });
});

app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    res.status(413).json(failurePayload(`文件不能超过 ${MAX_UPLOAD_FILE_SIZE_MB}MB`, 'BAD_REQUEST'));
    return;
  }
  if (err instanceof multer.MulterError) {
    res.status(400).json(failurePayload(`上传失败: ${err.message}`, 'BAD_REQUEST'));
    return;
  }
  next(err);
});

server.listen(PORT, HOST, () => {
  console.log(`
🚀 Open Meetup Server running on:
   Local: http://localhost:${PORT}
   Network: http://${HOST}:${PORT}

💡 Connect your Socket.io client to ws://[your-ip]:${PORT}
`);
});

function parseSocketIdentity(userId: unknown, sessionId: unknown): SocketIdentity | null {
  if (typeof userId !== 'string' || typeof sessionId !== 'string') {
    return null;
  }
  if (!userId.trim() || !sessionId.trim()) {
    return null;
  }
  return {
    userId: userId.trim(),
    sessionId: sessionId.trim(),
  };
}

function validateUploadedFile(file: Express.Multer.File, uploadType: UploadContentType): string | null {
  const name = file.originalname.toLowerCase();
  const mime = file.mimetype.toLowerCase();

  if (file.size > MAX_UPLOAD_FILE_SIZE_BYTES) {
    return `文件不能超过 ${MAX_UPLOAD_FILE_SIZE_MB}MB`;
  }

  if (uploadType === 'image') {
    if (!mime.startsWith('image/')) {
      return '仅支持图片文件';
    }
    return null;
  }

  if (uploadType === 'html') {
    const isHtml = name.endsWith('.html') || name.endsWith('.htm') || mime === 'text/html';
    return isHtml ? null : '请上传 .html 或 .htm 文件';
  }

  const isMarkdown =
    name.endsWith('.md') ||
    name.endsWith('.markdown') ||
    mime === 'text/markdown' ||
    mime === 'text/plain';
  return isMarkdown ? null : '请上传 .md 或 .markdown 文件';
}


function resolvePublicBaseUrl(req: express.Request): string {
  const explicit = process.env.PUBLIC_SERVER_URL?.trim();
  if (explicit) {
    return explicit.replace(/\/+$/, '');
  }

  const forwardedProto = req.header('x-forwarded-proto');
  const forwardedHost = req.header('x-forwarded-host');
  const protocol = forwardedProto ? forwardedProto.split(',')[0].trim() : req.protocol;
  const host = forwardedHost || req.get('host');

  if (!host) {
    return `http://localhost:${PORT}`;
  }
  return `${protocol}://${host}`.replace(/\/+$/, '');
}

function failurePayload(message: string, code: ErrorResponse['code']) {
  return {
    success: false,
    error: {
      message,
      code,
    },
  };
}

function toHttpStatus(code: ErrorResponse['code']): number {
  switch (code) {
    case 'BAD_REQUEST':
    case 'INVALID_TICKET':
      return 400;
    case 'NOT_AUTHENTICATED':
    case 'SESSION_EXPIRED':
      return 401;
    case 'NOT_AUTHORIZED':
      return 403;
    case 'ROOM_NOT_FOUND':
      return 404;
    default:
      return 400;
  }
}

setInterval(() => {
  const cleanup = roomManager.cleanupExpired();
  if (cleanup.removedParticipants.length > 0 && cleanup.closedRooms.length === 0) {
    emitStateSync(io, roomManager);
  }
  if (cleanup.closedRooms.length > 0) {
    for (const room of cleanup.closedRooms) {
      emitRoomClosed(io, room.reason);
    }
    console.log(`[Cleanup] Closed ${cleanup.closedRooms.length} room(s) due to expiration`);
  }
}, ROOM_CLEANUP_INTERVAL_MS);

setInterval(() => {
  const gc = runUploadGarbageCollection(roomManager.getActiveRoom(), UPLOAD_GC_MIN_AGE_MS);
  if (gc.deleted > 0 || gc.errors > 0) {
    console.log(
      `[UploadGC] scanned=${gc.scanned}, deleted=${gc.deleted}, retained=${gc.retained}, errors=${gc.errors}`,
    );
  }
}, UPLOAD_GC_INTERVAL_MS);

function emitStateSync(io: Server, roomManager: RoomManager) {
  const snapshot = roomManager.getPublicRoomSnapshot();
  if (!snapshot.success) {
    return;
  }

  io.emit('state:sync', {
    participants: snapshot.data.participants,
    status: snapshot.data.status,
    phase: snapshot.data.phase,
    currentStep: snapshot.data.currentStep,
    hostId: snapshot.data.hostId,
    pages: snapshot.data.pages,
    pageContents: snapshot.data.pageContents,
  });
}
