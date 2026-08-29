import { Server, Socket } from 'socket.io';
import { RoomManager } from './roomManager';
import { ErrorResponse, MeetingPageDefinition, RoomCloseReason, SocketIdentity, SocketResult } from './types';
import {
  CREATE_PASSWORD_FAILURE_WINDOW_MS,
  CREATE_PASSWORD_LOCKOUT_MS,
  CREATE_PASSWORD_MAX_FAILURES,
  SOCKET_EVENT_RATE_LIMIT_MAX,
  SOCKET_EVENT_RATE_LIMIT_WINDOW_MS,
} from './config';
import {
  checkPasswordAttemptAllowed,
  isRateLimitedByWindow,
  recordPasswordAttemptFailure,
  recordPasswordAttemptSuccess,
  RateLimitWindow,
  PasswordAttemptState,
} from './rateLimit';

type AckFn<T = unknown> = (response: T) => void;
const ACTIVE_ROOM_CHANNEL = 'room:active';

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

interface LayoutImportPayload {
  template: unknown;
}

interface UploadRevertPayload {
  url: string;
}

interface KickPayload {
  userId: string;
}

export function registerHandlers(io: Server, roomManager: RoomManager) {
  /** 单连接事件限流：NAT 场景下多人共享出口 IP，按 socket 维度限制更公平 */
  const socketEventRateState = new Map<string, RateLimitWindow>();
  /** 口令爆破锁定：必须按 IP 维度（攻击者可随意重连换 socket） */
  const createPasswordAttempts = new Map<string, PasswordAttemptState>();

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

    // 连接级事件限流：超限的包直接丢弃，并主动通知客户端一次
    socket.use((event, next) => {
      const limited = isRateLimitedByWindow(
        socketEventRateState,
        socket.id,
        {
          windowMs: SOCKET_EVENT_RATE_LIMIT_WINDOW_MS,
          max: SOCKET_EVENT_RATE_LIMIT_MAX,
          compactThreshold: 10_000,
        },
        Date.now(),
      );
      if (limited) {
        socket.emit('rate:limited', { windowMs: SOCKET_EVENT_RATE_LIMIT_WINDOW_MS });
        next(new Error('rate limited'));
        return;
      }
      next();
    });

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
        const clientIp = getSocketClientIp(socket);
        const verdict = checkPasswordAttemptAllowed(createPasswordAttempts, clientIp, {
          windowMs: CREATE_PASSWORD_FAILURE_WINDOW_MS,
          maxFailures: CREATE_PASSWORD_MAX_FAILURES,
          lockoutMs: CREATE_PASSWORD_LOCKOUT_MS,
        });
        if (!verdict.allowed) {
          ack(callback, {
            success: false,
            error: {
              message: `口令尝试过于频繁，请约 ${Math.ceil(verdict.retryAfterMs / 60_000)} 分钟后再试`,
              code: 'RATE_LIMITED',
            },
          } satisfies SocketResult<unknown>);
          return;
        }

        const result = roomManager.createRoom(
          payload?.userName ?? '',
          payload?.title ?? '',
          payload?.password ?? '',
          socket.id,
          payload?.participantLimit,
        );
        if (!result.success) {
          if (result.error.code === 'INVALID_PASSWORD') {
            recordPasswordAttemptFailure(createPasswordAttempts, clientIp, {
              windowMs: CREATE_PASSWORD_FAILURE_WINDOW_MS,
              maxFailures: CREATE_PASSWORD_MAX_FAILURES,
              lockoutMs: CREATE_PASSWORD_LOCKOUT_MS,
            });
          }
          ack(callback, result);
          return;
        }

        recordPasswordAttemptSuccess(createPasswordAttempts, clientIp);
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
        const result = roomManager.joinRoom(payload?.userName ?? '', socket.id, payload?.ticket);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        setSocketIdentity(socket, {
          userId: result.data.userId,
          sessionId: result.data.sessionId,
        });
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
        broadcastRoomState(io, roomManager);

        ack(callback, result);
      } catch (error) {
        console.error('[Socket] room:reconnect error:', error);
        ack(callback, failure('Failed to reconnect', 'INTERNAL_ERROR'));
      }
    });

    socket.on('room:leave', async (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getAuthorizedSocketIdentity(socket, roomManager);
        if (!identity) {
          ack(callback, failure('Not in a room', 'NOT_AUTHENTICATED'));
          return;
        }

        const result = await roomManager.leaveRoom(identity);
        if (!result.ok) {
          ack(callback, { success: false, error: result.error });
          return;
        }

        clearSocketIdentity(socket);

        if (result.roomClosed) {
          emitRoomClosed(io, result.reason);
          clearActiveRoomChannel(io);
        } else {
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

    socket.on('room:end', async (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getAuthorizedSocketIdentity(socket, roomManager);
        if (!identity) {
          ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
          return;
        }

        const result = await roomManager.forceEndRoom(identity);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        clearSocketIdentity(socket);
        emitRoomClosed(io, 'HOST_ENDED');
        clearActiveRoomChannel(io);

        ack(callback, result);
      } catch (error) {
        console.error('[Socket] room:end error:', error);
        ack(callback, failure('Failed to end room', 'INTERNAL_ERROR'));
      }
    });

    socket.on('room:kick', async (payload: KickPayload, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getAuthorizedSocketIdentity(socket, roomManager);
        if (!identity) {
          ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
          return;
        }

        const result = await roomManager.kickParticipant(identity, payload?.userId ?? '');
        if (!result.success) {
          ack(callback, result);
          return;
        }

        if (result.data.targetSocketId) {
          const targetSocket = io.sockets.sockets.get(result.data.targetSocketId);
          if (targetSocket) {
            clearSocketIdentity(targetSocket);
            targetSocket.emit('room:kicked');
            targetSocket.disconnect(true);
          }
        }

        broadcastRoomState(io, roomManager);
        ack(callback, result);
      } catch (error) {
        console.error('[Socket] room:kick error:', error);
        ack(callback, failure('Failed to kick participant', 'INTERNAL_ERROR'));
      }
    });

    socket.on('control:next', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getAuthorizedSocketIdentity(socket, roomManager);
        if (!identity) {
          ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
          return;
        }

        const result = roomManager.nextStep(identity);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        broadcastRoomState(io, roomManager);
        ack(callback, { success: true, data: null });
      } catch (error) {
        console.error('[Socket] control:next error:', error);
        ack(callback, failure('Failed to switch to next page', 'INTERNAL_ERROR'));
      }
    });

    socket.on('control:prev', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getAuthorizedSocketIdentity(socket, roomManager);
        if (!identity) {
          ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
          return;
        }

        const result = roomManager.prevStep(identity);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        broadcastRoomState(io, roomManager);
        ack(callback, { success: true, data: null });
      } catch (error) {
        console.error('[Socket] control:prev error:', error);
        ack(callback, failure('Failed to switch to previous page', 'INTERNAL_ERROR'));
      }
    });

    socket.on('control:start-live', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getAuthorizedSocketIdentity(socket, roomManager);
        if (!identity) {
          ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
          return;
        }

        const result = roomManager.startLive(identity);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        broadcastRoomState(io, roomManager);
        ack(callback, { success: true, data: null });
      } catch (error) {
        console.error('[Socket] control:start-live error:', error);
        ack(callback, failure('Failed to start live mode', 'INTERNAL_ERROR'));
      }
    });

    socket.on('control:return-setup', (_payload: unknown, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getAuthorizedSocketIdentity(socket, roomManager);
        if (!identity) {
          ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
          return;
        }

        const result = roomManager.returnToSetup(identity);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        broadcastRoomState(io, roomManager);
        ack(callback, { success: true, data: null });
      } catch (error) {
        console.error('[Socket] control:return-setup error:', error);
        ack(callback, failure('Failed to return to setup mode', 'INTERNAL_ERROR'));
      }
    });

    socket.on(
      'pages:update',
      async (payload: PagesUpdatePayload, callback?: AckFn<SocketResult<unknown>>) => {
        try {
          const identity = getAuthorizedSocketIdentity(socket, roomManager);
          if (!identity) {
            ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
            return;
          }

          const result = await roomManager.updatePages(identity, payload?.pages ?? []);
          if (!result.success) {
            ack(callback, result);
            return;
          }

          // 页面结构变更可能连带删除页面内容，低频操作，广播一次全量内容即可
          broadcastRoomState(io, roomManager);
          broadcastContentReset(io, roomManager);
          ack(callback, result);
        } catch (error) {
          console.error('[Socket] pages:update error:', error);
          ack(callback, failure('Failed to update pages', 'INTERNAL_ERROR'));
        }
      },
    );

    socket.on('page:update', (payload: PageUpdatePayload, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getAuthorizedSocketIdentity(socket, roomManager);
        if (!identity) {
          ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
          return;
        }

        const pageId = payload?.pageId ?? '';
        const content = payload.content
          ? {
              type: payload.content.type as 'canvas' | 'image' | 'url' | 'html' | 'markdown',
              content: payload.content.content,
            }
          : null;

        const result = roomManager.updatePageContent(identity, pageId, content);
        if (!result.success) {
          ack(callback, result);
          return;
        }

        broadcastRoomState(io, roomManager);
        broadcastContentEntries(io, [[pageId, content]]);
        ack(callback, result);
      } catch (error) {
        console.error('[Socket] page:update error:', error);
        ack(callback, failure('Failed to update page content', 'INTERNAL_ERROR'));
      }
    });

    socket.on('work:submit', async (payload: WorkSubmitPayload, callback?: AckFn<SocketResult<unknown>>) => {
      try {
        const identity = getAuthorizedSocketIdentity(socket, roomManager);
        if (!identity) {
          ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
          return;
        }

        const result = await roomManager.submitWork(
          identity,
          payload?.pageId ?? '',
          payload?.url ?? '',
          payload?.description ?? '',
        );
        if (!result.success) {
          ack(callback, result);
          return;
        }

        broadcastRoomState(io, roomManager);
        ack(callback, result);
      } catch (error) {
        console.error('[Socket] work:submit error:', error);
        ack(callback, failure('Failed to submit work', 'INTERNAL_ERROR'));
      }
    });

    socket.on(
      'layout:import',
      async (payload: LayoutImportPayload, callback?: AckFn<SocketResult<unknown>>) => {
        try {
          const identity = getAuthorizedSocketIdentity(socket, roomManager);
          if (!identity) {
            ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
            return;
          }

          const result = await roomManager.importLayoutTemplate(identity, payload?.template);
          if (!result.success) {
            ack(callback, result);
            return;
          }

          broadcastRoomState(io, roomManager);
          broadcastContentReset(io, roomManager);
          ack(callback, result);
        } catch (error) {
          console.error('[Socket] layout:import error:', error);
          ack(callback, failure('Failed to import layout template', 'INTERNAL_ERROR'));
        }
      },
    );

    socket.on(
      'upload:revert',
      async (payload: UploadRevertPayload, callback?: AckFn<SocketResult<unknown>>) => {
        try {
          const identity = getAuthorizedSocketIdentity(socket, roomManager);
          if (!identity) {
            ack(callback, failure('Not authenticated', 'NOT_AUTHENTICATED'));
            return;
          }

          const result = await roomManager.revertUpload(identity, payload?.url ?? '');
          ack(callback, result);
        } catch (error) {
          console.error('[Socket] upload:revert error:', error);
          ack(callback, failure('Failed to revert upload', 'INTERNAL_ERROR'));
        }
      },
    );

    socket.on('disconnect', (reason) => {
      roomManager.onSocketDisconnected(socket.id);
      console.log(`[Socket] Client disconnected: ${socket.id}, reason=${reason}`);
    });
  });
}

export function emitRoomClosed(io: Server, reason: RoomCloseReason) {
  io.to(ACTIVE_ROOM_CHANNEL).emit('room:closed', { reason });
}

export function clearActiveRoomChannel(io: Server) {
  const roomSockets = io.sockets.adapter.rooms.get(ACTIVE_ROOM_CHANNEL);
  if (!roomSockets) {
    return;
  }
  for (const socketId of roomSockets) {
    const roomSocket = io.sockets.sockets.get(socketId);
    if (!roomSocket) {
      continue;
    }
    clearSocketIdentity(roomSocket);
  }
}

/** 页面内容增量广播：仅变更的 pageId，避免每次翻页/编辑全量重发所有画布 */
export function broadcastContentEntries(
  io: Server,
  entries: Array<[string, { type: string; content: string } | null]>,
) {
  const payload: Array<[string, { type: string; content: string } | null]> = [];
  for (const [pageId, content] of entries) {
    if (pageId) {
      payload.push([pageId, content]);
    }
  }
  if (payload.length === 0) {
    return;
  }
  io.to(ACTIVE_ROOM_CHANNEL).emit('content:update', { entries: payload });
}

/** 页面结构整体变化（批量改页/导入模板）时广播一次全量内容重置 */
export function broadcastContentReset(io: Server, roomManager: RoomManager) {
  const snapshot = roomManager.getPublicRoomSnapshot();
  if (!snapshot.success) {
    return;
  }
  io.to(ACTIVE_ROOM_CHANNEL).emit('content:reset', {
    pageContents: snapshot.data.pageContents,
  });
}

function getSocketClientIp(socket: Socket): string {
  return socket.handshake.address || socket.conn.remoteAddress || 'unknown';
}

function broadcastRoomState(io: Server, roomManager: RoomManager) {
  pruneActiveRoomChannel(io, roomManager);
  const snapshot = roomManager.getPublicRoomSnapshot();
  if (!snapshot.success) {
    return;
  }

  // state:sync 不再携带 pageContents：内容走 content:update / content:reset 增量通道，
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

function pruneActiveRoomChannel(io: Server, roomManager: RoomManager) {
  const roomSockets = io.sockets.adapter.rooms.get(ACTIVE_ROOM_CHANNEL);
  if (!roomSockets) {
    return;
  }
  for (const socketId of roomSockets) {
    const roomSocket = io.sockets.sockets.get(socketId);
    if (!roomSocket) {
      continue;
    }
    const identity = getSocketIdentity(roomSocket);
    if (!roomManager.isSocketIdentityAuthorized(socketId, identity)) {
      clearSocketIdentity(roomSocket);
    }
  }
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

function getAuthorizedSocketIdentity(socket: Socket, roomManager: RoomManager): SocketIdentity | null {
  const identity = getSocketIdentity(socket);
  if (!identity) {
    return null;
  }
  if (!roomManager.isSocketIdentityAuthorized(socket.id, identity)) {
    clearSocketIdentity(socket);
    return null;
  }
  return identity;
}

function setSocketIdentity(socket: Socket, identity: SocketIdentity) {
  getData(socket).identity = identity;
  socket.join(ACTIVE_ROOM_CHANNEL);
}

function clearSocketIdentity(socket: Socket) {
  getData(socket).identity = undefined;
  socket.leave(ACTIVE_ROOM_CHANNEL);
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

interface SocketData {
  identity?: SocketIdentity;
  authCandidate?: SocketIdentity;
}
