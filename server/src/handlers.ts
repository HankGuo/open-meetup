import { Server, Socket } from 'socket.io';
import { RoomManager } from './roomManager';
import { ErrorResponse, MeetingPageDefinition, RoomCloseReason, SocketIdentity, SocketResult } from './types';

type AckFn<T = unknown> = (response: T) => void;

interface CreateRoomPayload {
  userName: string;
  title: string;
  password: string;
  participantLimit?: number;
}

interface JoinRoomPayload {
  userName: string;
  ticket?: string;
}

interface ReconnectPayload {
  userId: string;
  sessionId: string;
}

interface WorkSubmitPayload {
  pageId: string;
  url: string;
  description: string;
}

interface PageUpdatePayload {
  pageId: string;
  content: { type: string; content: string } | null;
}

interface PagesUpdatePayload {
  pages: MeetingPageDefinition[];
}

export function registerHandlers(io: Server, roomManager: RoomManager) {
  io.use((socket, next) => {
    const auth = socket.handshake.auth as Partial<ReconnectPayload> | undefined;
    if (auth && typeof auth === 'object') {
      const userId = typeof auth.userId === 'string' ? auth.userId : '';
      const sessionId = typeof auth.sessionId === 'string' ? auth.sessionId : '';
      if (userId && sessionId) {
        getData(socket).authCandidate = { userId, sessionId };
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    console.log(`[Socket] Client connected: ${socket.id}`);

    const authCandidate = getData(socket).authCandidate;
    if (authCandidate) {
      const reconnectResult = roomManager.reconnect(authCandidate, socket.id);
      if (reconnectResult.success) {
        const syncData = reconnectResult.data;
        setSocketIdentity(socket, {
          userId: syncData.userId,
          sessionId: syncData.sessionId,
        });
        broadcastRoomState(io, roomManager);
      }
    }

    socket.on('room:create', (payload: CreateRoomPayload, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const result = roomManager.createRoom(
          payload?.userName ?? '',
          payload?.title ?? '',
          payload?.password ?? '',
          socket.id,
          payload?.participantLimit,
        );
        if (!result.success) {
          ack(callback, result);
          return;
        }

        setSocketIdentity(socket, {
          userId: result.data.userId,
          sessionId: result.data.sessionId,
        });

        ack(callback, result);
      } catch (error) {
        console.error('[Socket] room:create error:', error);
        ack(callback, failure('Failed to create room', 'INTERNAL_ERROR'));
      }
    });

    socket.on('room:join', (payload: JoinRoomPayload, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const result = roomManager.joinRoom(
          payload?.userName ?? '',
          socket.id,
          payload?.ticket,
        );
        if (!result.success) {
          ack(callback, result);
          return;
        }

        setSocketIdentity(socket, {
          userId: result.data.userId,
          sessionId: result.data.sessionId,
        });

        const me = result.data.participants.find((participant) => participant.userId === result.data.userId);
        if (me) {
          socket.broadcast.emit('room:user-joined', { user: me });
        }
        broadcastRoomState(io, roomManager);

        ack(callback, result);
      } catch (error) {
        console.error('[Socket] room:join error:', error);
        ack(callback, failure('Failed to join room', 'INTERNAL_ERROR'));
      }
    });

    socket.on('room:reconnect', (payload: ReconnectPayload, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity: SocketIdentity = {
          userId: payload?.userId ?? '',
          sessionId: payload?.sessionId ?? '',
        };

        const result = roomManager.reconnect(identity, socket.id);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        setSocketIdentity(socket, {
          userId: result.data.userId,
          sessionId: result.data.sessionId,
        });

        const me = result.data.participants.find((participant) => participant.userId === result.data.userId);
        if (me) {
          socket.broadcast.emit('room:user-online', { user: me });
        }
        broadcastRoomState(io, roomManager);

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

        if (result.roomClosed) {
          io.emit('room:closed', { reason: result.reason });
        } else {
          socket.broadcast.emit('room:user-left', { user: result.leftUser });
          broadcastRoomState(io, roomManager);
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

    socket.on('room:end', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getSocketIdentity(socket);
        if (!identity) {
          ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
          return;
        }

        const result = roomManager.forceEndRoom(identity);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        clearSocketIdentity(socket);
        io.emit('room:closed', { reason: 'HOST_ENDED' });

        ack(callback, result);
      } catch (error) {
        console.error('[Socket] room:end error:', error);
        ack(callback, failure('Failed to end room', 'INTERNAL_ERROR'));
      }
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

      io.emit('control:next', {
        currentStep: result.data.currentStep,
      });
      broadcastRoomState(io, roomManager);
      ack(callback, { success: true, data: null });
    });

    socket.on('control:prev', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      const identity = getSocketIdentity(socket);
      if (!identity) {
        ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
        return;
      }

      const result = roomManager.prevStep(identity);
      if (!result.success) {
        ack(callback, result);
        return;
      }

      io.emit('control:prev', {
        currentStep: result.data.currentStep,
      });
      broadcastRoomState(io, roomManager);
      ack(callback, { success: true, data: null });
    });

    socket.on('control:start-live', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      const identity = getSocketIdentity(socket);
      if (!identity) {
        ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
        return;
      }

      const result = roomManager.startLive(identity);
      if (!result.success) {
        ack(callback, result);
        return;
      }

      io.emit('control:start-live', {
        phase: result.data.phase,
        currentStep: result.data.currentStep,
      });
      broadcastRoomState(io, roomManager);
      ack(callback, { success: true, data: null });
    });

    socket.on('control:return-setup', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      const identity = getSocketIdentity(socket);
      if (!identity) {
        ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
        return;
      }

      const result = roomManager.returnToSetup(identity);
      if (!result.success) {
        ack(callback, result);
        return;
      }

      io.emit('control:return-setup', {
        phase: result.data.phase,
        currentStep: result.data.currentStep,
      });
      broadcastRoomState(io, roomManager);
      ack(callback, { success: true, data: null });
    });

    socket.on('pages:update', (payload: PagesUpdatePayload, callback?: AckFn<SocketResult<unknown>>) => {
      const identity = getSocketIdentity(socket);
      if (!identity) {
        ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
        return;
      }

      const result = roomManager.updatePages(identity, payload?.pages ?? []);
      if (!result.success) {
        ack(callback, result);
        return;
      }

      io.emit('state:sync', {
        participants: result.data.participants,
        status: result.data.status,
        phase: result.data.phase,
        currentStep: result.data.currentStep,
        hostId: result.data.hostId,
        pages: result.data.pages,
        pageContents: result.data.pageContents,
      });
      ack(callback, result);
    });

    socket.on('page:update', (payload: PageUpdatePayload, callback?: AckFn<SocketResult<unknown>>) => {
      const identity = getSocketIdentity(socket);
      if (!identity) {
        ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
        return;
      }

      const pageId = payload?.pageId ?? '';
      const content = payload.content
        ? { type: payload.content.type as 'canvas' | 'image' | 'url' | 'html' | 'markdown', content: payload.content.content }
        : null;

      const result = roomManager.updatePageContent(identity, pageId, content);
      if (!result.success) {
        ack(callback, result);
        return;
      }

      io.emit('state:sync', {
        participants: result.data.participants,
        status: result.data.status,
        phase: result.data.phase,
        currentStep: result.data.currentStep,
        hostId: result.data.hostId,
        pages: result.data.pages,
        pageContents: result.data.pageContents,
      });
      ack(callback, result);
    });

    socket.on('work:submit', (payload: WorkSubmitPayload, callback?: AckFn<SocketResult<unknown>>) => {
      const identity = getSocketIdentity(socket);
      if (!identity) {
        ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
        return;
      }

      const result = roomManager.submitWork(identity, payload?.pageId ?? '', payload?.url ?? '', payload?.description ?? '');
      if (!result.success) {
        ack(callback, result);
        return;
      }

      broadcastRoomState(io, roomManager);
      ack(callback, result);
    });

    socket.on('disconnect', (reason) => {
      const disconnected = roomManager.onSocketDisconnected(socket.id);
      console.log(`[Socket] Client disconnected: ${socket.id}, reason=${reason}`);

      if (!disconnected) {
        return;
      }

      socket.broadcast.emit('room:user-offline', { user: disconnected.user });
      broadcastRoomState(io, roomManager);
    });
  });
}

export function emitRoomClosed(io: Server, reason: RoomCloseReason) {
  io.emit('room:closed', { reason });
}

function getData(socket: Socket): SocketData {
  return socket.data as SocketData;
}

function getSocketIdentity(socket: Socket): SocketIdentity | null {
  const identity = getData(socket).identity;
  if (!identity) {
    return null;
  }
  if (!identity.userId || !identity.sessionId) {
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

function broadcastRoomState(io: Server, roomManager: RoomManager) {
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

interface SocketData {
  identity?: SocketIdentity;
  authCandidate?: SocketIdentity;
}
