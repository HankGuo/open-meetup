import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './roomManager';
import { emitRoomClosed, registerHandlers } from './handlers';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES = 25 * 1024 * 1024;
const ROOM_CLEANUP_INTERVAL_MS = Number(process.env.ROOM_CLEANUP_INTERVAL_MS || 30_000);

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

const roomManager = new RoomManager();
registerHandlers(io, roomManager);

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
      res.json({
        valid: true,
        identity: {
          role: participant.role,
        },
      });
      return;
    }
  }

  res.json({ valid: false, error: 'Invalid ticket' });
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
    HOST === '0.0.0.0'
      ? `Use your LAN IP: http://<your-ip>:${PORT}`
      : `Use bind host: ${bindUrl}`;

  console.log(`
🚀 Open Meetup Server running on:
   Local: ${localUrl}
   Bind: ${bindUrl}

💡 ${networkHint}
`);
});

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
