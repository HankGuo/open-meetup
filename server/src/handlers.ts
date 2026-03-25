import { Server, Socket } from 'socket.io';
import { RoomManager } from './roomManager';
import { ErrorResponse, RoomCloseReason, SocketIdentity, SocketResult } from './types';

type AckFn<T = unknown> = (response: T) => void;

interface SocketData {
  identity?: SocketIdentity;
  authCandidate?: SocketIdentity;
}

interface CreateRoomPayload {
  userName: string;
}

interface JoinRoomPayload {
  roomId: string;
  userName: string;
}

interface ReconnectPayload {
  roomId: string;
  userId: string;
  sessionId: string;
}

export function registerHandlers(io: Server, roomManager: RoomManager) {
  io.use((socket, next) => {
    const auth = socket.handshake.auth as Partial<ReconnectPayload> | undefined;
    if (auth && typeof auth === 'object') {
      const roomId = typeof auth.roomId === 'string' ? auth.roomId : '';
      const userId = typeof auth.userId === 'string' ? auth.userId : '';
      const sessionId = typeof auth.sessionId === 'string' ? auth.sessionId : '';
      if (roomId && userId && sessionId) {
        getData(socket).authCandidate = { roomId, userId, sessionId };
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    // Auto resume from handshake auth if provided.
    const authCandidate = getData(socket).authCandidate;
    if (authCandidate) {
      const reconnectResult = roomManager.reconnect(authCandidate, socket.id);
      if (reconnectResult.success) {
        const syncData = reconnectResult.data;
        setSocketIdentity(socket, {
          roomId: syncData.roomId,
          userId: syncData.userId,
          sessionId: syncData.sessionId,
        });
        socket.join(syncData.roomId);
        socket.emit('session:restored', { success: true, data: syncData });
        broadcastRoomState(io, roomManager, syncData.roomId);
      } else {
        socket.emit('session:restored', { success: false, error: reconnectResult.error });
      }
    }

    socket.on('room:create', (payload: CreateRoomPayload, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const result = roomManager.createRoom(payload?.userName ?? '', socket.id);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        setSocketIdentity(socket, {
          roomId: result.data.roomId,
          userId: result.data.userId,
          sessionId: result.data.sessionId,
        });
        socket.join(result.data.roomId);

        ack(callback, result);
      } catch (error) {
        console.error('[Socket] room:create error:', error);
        ack(callback, failure('Failed to create room', 'INTERNAL_ERROR'));
      }
    });

    socket.on('room:join', (payload: JoinRoomPayload, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const result = roomManager.joinRoom(payload?.roomId ?? '', payload?.userName ?? '', socket.id);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        setSocketIdentity(socket, {
          roomId: result.data.roomId,
          userId: result.data.userId,
          sessionId: result.data.sessionId,
        });
        socket.join(result.data.roomId);

        const me = result.data.participants.find((participant) => participant.userId === result.data.userId);
        if (me) {
          socket.to(result.data.roomId).emit('room:user-joined', { user: me });
        }
        broadcastRoomState(io, roomManager, result.data.roomId);

        ack(callback, result);
      } catch (error) {
        console.error('[Socket] room:join error:', error);
        ack(callback, failure('Failed to join room', 'INTERNAL_ERROR'));
      }
    });

    socket.on('room:reconnect', (payload: ReconnectPayload, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity: SocketIdentity = {
          roomId: payload?.roomId ?? '',
          userId: payload?.userId ?? '',
          sessionId: payload?.sessionId ?? '',
        };

        const result = roomManager.reconnect(identity, socket.id);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        setSocketIdentity(socket, {
          roomId: result.data.roomId,
          userId: result.data.userId,
          sessionId: result.data.sessionId,
        });
        socket.join(result.data.roomId);

        const me = result.data.participants.find((participant) => participant.userId === result.data.userId);
        if (me) {
          socket.to(result.data.roomId).emit('room:user-online', { user: me });
        }
        broadcastRoomState(io, roomManager, result.data.roomId);

        ack(callback, result);
      } catch (error) {
        console.error('[Socket] room:reconnect error:', error);
        ack(callback, failure('Failed to reconnect', 'INTERNAL_ERROR'));
      }
    });

    socket.on('room:leave', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getSocketIdentity(socket);
        if (!identity) {
          ack(callback, failure('Not in a room', 'NOT_AUTHENTICATED'));
          return;
        }

        const result = roomManager.leaveRoom(identity);
        if (!result.ok) {
          ack(callback, { success: false, error: result.error });
          return;
        }

        clearSocketIdentity(socket);
        socket.leave(result.roomId);

        if (result.roomClosed) {
          io.to(result.roomId).emit('room:closed', { reason: result.reason });
          io.in(result.roomId).socketsLeave(result.roomId);
        } else {
          socket.to(result.roomId).emit('room:user-left', { user: result.leftUser });
          broadcastRoomState(io, roomManager, result.roomId);
        }

        ack(callback, {
          success: true,
          data: { roomClosed: result.roomClosed, reason: result.roomClosed ? result.reason : undefined },
        });
      } catch (error) {
        console.error('[Socket] room:leave error:', error);
        ack(callback, failure('Failed to leave room', 'INTERNAL_ERROR'));
      }
    });

    socket.on('control:start', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      const identity = getSocketIdentity(socket);
      if (!identity) {
        ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
        return;
      }

      const result = roomManager.startMeeting(identity);
      if (!result.success) {
        ack(callback, result);
        return;
      }

      io.to(result.data.roomId).emit('control:started', {
        status: result.data.status,
        currentStep: result.data.currentStep,
      });
      broadcastRoomState(io, roomManager, result.data.roomId);
      ack(callback, { success: true, data: null });
    });

    socket.on('control:next', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      const identity = getSocketIdentity(socket);
      if (!identity) {
        ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
        return;
      }

      const result = roomManager.nextStep(identity);
      if (!result.success) {
        ack(callback, result);
        return;
      }

      io.to(result.data.roomId).emit('control:next', {
        currentStep: result.data.currentStep,
      });
      broadcastRoomState(io, roomManager, result.data.roomId);
      ack(callback, { success: true, data: null });
    });

    socket.on('control:end', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      const identity = getSocketIdentity(socket);
      if (!identity) {
        ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
        return;
      }

      const result = roomManager.endMeeting(identity);
      if (!result.success) {
        ack(callback, result);
        return;
      }

      io.to(result.data.roomId).emit('control:ended', {
        status: result.data.status,
      });
      broadcastRoomState(io, roomManager, result.data.roomId);
      ack(callback, { success: true, data: null });
    });

    socket.on('state:sync-request', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      const identity = getSocketIdentity(socket);
      if (!identity) {
        ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
        return;
      }
      ack(callback, roomManager.getStateByIdentity(identity));
    });

    socket.on('disconnect', (reason) => {
      const disconnected = roomManager.onSocketDisconnected(socket.id);
      console.log(`[Socket] Client disconnected: ${socket.id}, reason=${reason}`);

      if (!disconnected) {
        return;
      }

      socket.to(disconnected.roomId).emit('room:user-offline', { user: disconnected.user });
      broadcastRoomState(io, roomManager, disconnected.roomId);
    });
  });
}

export function emitRoomClosed(io: Server, roomId: string, reason: RoomCloseReason) {
  io.to(roomId).emit('room:closed', { reason });
  io.in(roomId).socketsLeave(roomId);
}

function getData(socket: Socket): SocketData {
  return socket.data as SocketData;
}

function getSocketIdentity(socket: Socket): SocketIdentity | null {
  const identity = getData(socket).identity;
  if (!identity) {
    return null;
  }
  if (!identity.roomId || !identity.userId || !identity.sessionId) {
    return null;
  }
  return identity;
}

function setSocketIdentity(socket: Socket, identity: SocketIdentity) {
  getData(socket).identity = identity;
}

function clearSocketIdentity(socket: Socket) {
  getData(socket).identity = undefined;
}

function ack<T>(callback: AckFn<T> | undefined, payload: T) {
  if (typeof callback === 'function') {
    callback(payload);
  }
}

function failure(message: string, code: ErrorResponse['code']): SocketResult<never> {
  return {
    success: false,
    error: { message, code },
  };
}

function broadcastRoomState(io: Server, roomManager: RoomManager, roomId: string) {
  const snapshot = roomManager.getPublicRoomSnapshot(roomId);
  if (!snapshot.success) {
    return;
  }

  io.to(roomId).emit('state:sync', {
    roomId: snapshot.data.roomId,
    participants: snapshot.data.participants,
    status: snapshot.data.status,
    currentStep: snapshot.data.currentStep,
    hostId: snapshot.data.hostId,
  });
}
