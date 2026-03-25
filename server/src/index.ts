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
