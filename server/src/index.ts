import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { RoomManager } from './roomManager';
import { emitRoomClosed, registerHandlers } from './handlers';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST || '0.0.0.0';
const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

app.use(cors());
app.use(express.json());

const roomManager = new RoomManager();
registerHandlers(io, roomManager);

app.get('/api/room/check', (req, res) => {
  const roomId = req.query.roomId as string;
  if (!roomId) {
    res.status(400).json({ exists: false, error: 'Room ID is required' });
    return;
  }
  const normalized = roomId.trim().toUpperCase();
  const room = roomManager.getRoom(normalized);
  if (room) {
    res.json({ exists: true, status: room.status });
  } else {
    res.json({ exists: false });
  }
});

app.get('/api/room/ticket-check', (req, res) => {
  const roomId = req.query.roomId as string;
  const ticket = req.query.ticket as string;
  if (!roomId || !ticket) {
    res.status(400).json({ valid: false, error: 'Room ID and Ticket are required' });
    return;
  }
  const normalizedRoomId = roomId.trim().toUpperCase();
  const room = roomManager.getRoom(normalizedRoomId);
  if (!room) {
    res.json({ valid: false, error: 'Room not found' });
    return;
  }
  const normalizedTicket = ticket.trim().toUpperCase();
  for (const participant of room.participants.values()) {
    if (participant.ticket?.toUpperCase() === normalizedTicket) {
      res.json({ valid: true, userName: participant.userName });
      return;
    }
  }
  res.json({ valid: false, error: 'Invalid ticket' });
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeRooms: roomManager.getActiveRoomCount(),
    disconnectGraceMs: roomManager.getDisconnectGraceMs(),
  });
});

server.listen(PORT, HOST, () => {
  console.log(`
🚀 Open Meetup Server running on:
   Local: http://localhost:${PORT}
   Network: http://${HOST}:${PORT}

💡 Connect your Socket.io client to ws://[your-ip]:${PORT}
`);
});

// 定期清理断线超时用户和失效房间
setInterval(() => {
  const cleanup = roomManager.cleanupExpired();
  if (cleanup.closedRooms.length > 0) {
    for (const room of cleanup.closedRooms) {
      emitRoomClosed(io, room.roomId, room.reason);
    }
    console.log(`[Cleanup] Closed ${cleanup.closedRooms.length} room(s) due to expiration`);
  }
}, 30 * 1000); // 每 30 秒清理一次
