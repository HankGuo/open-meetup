import { randomUUID } from 'crypto';
import {
  ErrorResponse,
  MeetingStatus,
  PublicParticipant,
  Room,
  RoomCloseReason,
  RoomParticipant,
  RoomStateSync,
  SocketIdentity,
  SocketResult,
} from './types';

const ROOM_ID_LENGTH = 6;
const ROOM_ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_PARTICIPANTS_PER_ROOM = 50;
const DISCONNECT_GRACE_MS = 120_000; // 2 minutes

type AuthContext = { room: Room; participant: RoomParticipant; identity: SocketIdentity };

  type RoomOperationResult = SocketResult<{
  roomId: string;
  status: MeetingStatus;
  currentStep: number;
  hostId: string;
  participants: PublicParticipant[];
}>;

type LeaveResult =
  | {
      ok: true;
      roomId: string;
      leftUser: PublicParticipant;
      roomClosed: false;
    }
  | {
      ok: true;
      roomId: string;
      leftUser: PublicParticipant;
      roomClosed: true;
      reason: RoomCloseReason;
    }
  | {
      ok: false;
      error: ErrorResponse;
    };

interface CleanupResult {
  closedRooms: Array<{ roomId: string; reason: RoomCloseReason }>;
}

export class RoomManager {
  private rooms: Map<string, Room> = new Map();
  private socketToIdentity: Map<string, SocketIdentity> = new Map();

  getActiveRoomCount(): number {
    return this.rooms.size;
  }

  createRoom(hostUserName: string, socketId: string): SocketResult<RoomStateSync> {
    const userName = sanitizeUserName(hostUserName);
    if (!userName) {
      return this.fail('Name is required', 'BAD_REQUEST');
    }

    this.detachSocket(socketId);

    const roomId = this.generateRoomId();
    const now = Date.now();
    const host: RoomParticipant = {
      userId: randomUUID(),
      userName,
      role: 'host',
      joinedAt: now,
      sessionId: randomUUID(),
      socketId,
      online: true,
      lastSeenAt: now,
    };

    const room: Room = {
      roomId,
      hostId: host.userId,
      participants: new Map([[host.userId, host]]),
      status: 'idle',
      currentStep: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.rooms.set(roomId, room);
    this.socketToIdentity.set(socketId, {
      roomId,
      userId: host.userId,
      sessionId: host.sessionId,
    });

    return {
      success: true,
      data: this.toRoomStateSync(room, host),
    };
  }

  joinRoom(roomIdInput: string, userNameInput: string, socketId: string): SocketResult<RoomStateSync> {
    const roomId = normalizeRoomId(roomIdInput);
    const userName = sanitizeUserName(userNameInput);

    if (!roomId || !userName) {
      return this.fail('Invalid room id or user name', 'BAD_REQUEST');
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return this.fail('Room not found', 'ROOM_NOT_FOUND');
    }
    if (room.status === 'ended') {
      return this.fail('Room is closed', 'ROOM_CLOSED');
    }
    if (room.participants.size >= MAX_PARTICIPANTS_PER_ROOM) {
      return this.fail('Room is full', 'ROOM_FULL');
    }

    this.detachSocket(socketId);

    const now = Date.now();
    const participant: RoomParticipant = {
      userId: randomUUID(),
      userName,
      role: 'participant',
      joinedAt: now,
      sessionId: randomUUID(),
      socketId,
      online: true,
      lastSeenAt: now,
    };

    room.participants.set(participant.userId, participant);
    room.updatedAt = now;
    this.socketToIdentity.set(socketId, {
      roomId,
      userId: participant.userId,
      sessionId: participant.sessionId,
    });

    return {
      success: true,
      data: this.toRoomStateSync(room, participant),
    };
  }

  reconnect(identity: SocketIdentity, socketId: string): SocketResult<RoomStateSync> {
    const roomId = normalizeRoomId(identity.roomId);
    if (!roomId || !identity.userId || !identity.sessionId) {
      return this.fail('Invalid reconnect payload', 'BAD_REQUEST');
    }

    const room = this.rooms.get(roomId);
    if (!room) {
      return this.fail('Room not found', 'ROOM_NOT_FOUND');
    }

    const participant = room.participants.get(identity.userId);
    if (!participant) {
      return this.fail('User not found in room', 'USER_NOT_FOUND');
    }
    if (participant.sessionId !== identity.sessionId) {
      return this.fail('Session expired', 'SESSION_EXPIRED');
    }

    // If this user had an old socket mapping, drop it.
    if (participant.socketId && participant.socketId !== socketId) {
      this.socketToIdentity.delete(participant.socketId);
    }

    this.detachSocket(socketId);

    participant.socketId = socketId;
    participant.online = true;
    participant.lastSeenAt = Date.now();
    room.updatedAt = participant.lastSeenAt;

    this.socketToIdentity.set(socketId, {
      roomId,
      userId: participant.userId,
      sessionId: participant.sessionId,
    });

    return {
      success: true,
      data: this.toRoomStateSync(room, participant),
    };
  }

  leaveRoom(identity: SocketIdentity): LeaveResult {
    const auth = this.authorize(identity);
    if (!auth) {
      return { ok: false, error: this.error('Not authenticated', 'NOT_AUTHENTICATED') };
    }

    const { room, participant } = auth;
    const now = Date.now();
    const leftUser = this.toPublicParticipant(participant);

    room.participants.delete(participant.userId);
    room.updatedAt = now;

    if (participant.socketId) {
      this.socketToIdentity.delete(participant.socketId);
    }

    if (participant.role === 'host') {
      this.closeRoom(room.roomId);
      return {
        ok: true,
        roomId: room.roomId,
        leftUser,
        roomClosed: true,
        reason: 'HOST_LEFT',
      };
    }

    if (room.participants.size === 0) {
      this.closeRoom(room.roomId);
      return {
        ok: true,
        roomId: room.roomId,
        leftUser,
        roomClosed: true,
        reason: 'ROOM_EXPIRED',
      };
    }

    return {
      ok: true,
      roomId: room.roomId,
      leftUser,
      roomClosed: false,
    };
  }

  startMeeting(identity: SocketIdentity): RoomOperationResult {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'host') {
      return this.fail('Only host can perform this action', 'NOT_AUTHORIZED');
    }

    auth.room.status = 'active';
    auth.room.currentStep = 1;
    auth.room.updatedAt = Date.now();

    return {
      success: true,
      data: this.buildPublicRoomSnapshot(auth.room),
    };
  }

  nextStep(identity: SocketIdentity): RoomOperationResult {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'host') {
      return this.fail('Only host can perform this action', 'NOT_AUTHORIZED');
    }
    if (auth.room.status !== 'active') {
      return this.fail('Meeting is not active', 'MEETING_NOT_ACTIVE');
    }

    auth.room.currentStep += 1;
    auth.room.updatedAt = Date.now();

    return {
      success: true,
      data: this.buildPublicRoomSnapshot(auth.room),
    };
  }

  endMeeting(identity: SocketIdentity): RoomOperationResult {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'host') {
      return this.fail('Only host can perform this action', 'NOT_AUTHORIZED');
    }

    auth.room.status = 'ended';
    auth.room.updatedAt = Date.now();

    return {
      success: true,
      data: this.buildPublicRoomSnapshot(auth.room),
    };
  }

  getIdentityBySocket(socketId: string): SocketIdentity | null {
    return this.socketToIdentity.get(socketId) ?? null;
  }

  getStateByIdentity(identity: SocketIdentity): SocketResult<RoomStateSync> {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    return {
      success: true,
      data: this.toRoomStateSync(auth.room, auth.participant),
    };
  }

  onSocketDisconnected(socketId: string): { roomId: string; user: PublicParticipant } | null {
    const identity = this.socketToIdentity.get(socketId);
    if (!identity) {
      return null;
    }
    this.socketToIdentity.delete(socketId);

    const room = this.rooms.get(identity.roomId);
    if (!room) {
      return null;
    }
    const participant = room.participants.get(identity.userId);
    if (!participant || participant.sessionId !== identity.sessionId) {
      return null;
    }

    participant.socketId = null;
    participant.online = false;
    participant.lastSeenAt = Date.now();
    room.updatedAt = participant.lastSeenAt;

    return {
      roomId: room.roomId,
      user: this.toPublicParticipant(participant),
    };
  }

  cleanupExpired(now = Date.now()): CleanupResult {
    const closedRooms: Array<{ roomId: string; reason: RoomCloseReason }> = [];

    for (const room of this.rooms.values()) {
      const offlineUsers: RoomParticipant[] = [];
      for (const participant of room.participants.values()) {
        if (!participant.online && now - participant.lastSeenAt > DISCONNECT_GRACE_MS) {
          offlineUsers.push(participant);
        }
      }

      for (const participant of offlineUsers) {
        room.participants.delete(participant.userId);
      }

      if (offlineUsers.length > 0) {
        room.updatedAt = now;
      }

      const hostAlive = room.participants.has(room.hostId);
      if (!hostAlive) {
        closedRooms.push({ roomId: room.roomId, reason: 'HOST_TIMEOUT' });
        this.closeRoom(room.roomId);
        continue;
      }

      if (room.participants.size === 0) {
        closedRooms.push({ roomId: room.roomId, reason: 'ROOM_EXPIRED' });
        this.closeRoom(room.roomId);
      }
    }

    return { closedRooms };
  }

  getDisconnectGraceMs(): number {
    return DISCONNECT_GRACE_MS;
  }

  getPublicRoomSnapshot(roomId: string): SocketResult<{
    roomId: string;
    status: MeetingStatus;
    currentStep: number;
    hostId: string;
    participants: PublicParticipant[];
  }> {
    const room = this.rooms.get(roomId);
    if (!room) {
      return this.fail('Room not found', 'ROOM_NOT_FOUND');
    }
    return {
      success: true,
      data: this.buildPublicRoomSnapshot(room),
    };
  }

  private authorize(identity: SocketIdentity | null | undefined): AuthContext | null {
    if (!identity) {
      return null;
    }
    const room = this.rooms.get(identity.roomId);
    if (!room) {
      return null;
    }
    const participant = room.participants.get(identity.userId);
    if (!participant) {
      return null;
    }
    if (participant.sessionId !== identity.sessionId) {
      return null;
    }
    return { room, participant, identity };
  }

  private closeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) {
      return;
    }

    for (const participant of room.participants.values()) {
      if (participant.socketId) {
        this.socketToIdentity.delete(participant.socketId);
      }
    }

    this.rooms.delete(roomId);
  }

  private detachSocket(socketId: string): void {
    const oldIdentity = this.socketToIdentity.get(socketId);
    if (!oldIdentity) {
      return;
    }
    this.socketToIdentity.delete(socketId);

    const oldRoom = this.rooms.get(oldIdentity.roomId);
    const oldParticipant = oldRoom?.participants.get(oldIdentity.userId);
    if (!oldRoom || !oldParticipant) {
      return;
    }
    if (oldParticipant.sessionId !== oldIdentity.sessionId) {
      return;
    }
    oldParticipant.socketId = null;
    oldParticipant.online = false;
    oldParticipant.lastSeenAt = Date.now();
    oldRoom.updatedAt = oldParticipant.lastSeenAt;
  }

  private buildPublicRoomSnapshot(room: Room): {
    roomId: string;
    status: MeetingStatus;
    currentStep: number;
    hostId: string;
    participants: PublicParticipant[];
  } {
    return {
      roomId: room.roomId,
      status: room.status,
      currentStep: room.currentStep,
      hostId: room.hostId,
      participants: this.getPublicParticipants(room),
    };
  }

  private toRoomStateSync(room: Room, me: RoomParticipant): RoomStateSync {
    return {
      roomId: room.roomId,
      participants: this.getPublicParticipants(room),
      hostId: room.hostId,
      status: room.status,
      currentStep: room.currentStep,
      userId: me.userId,
      userRole: me.role,
      userName: me.userName,
      sessionId: me.sessionId,
    };
  }

  private getPublicParticipants(room: Room): PublicParticipant[] {
    return Array.from(room.participants.values())
      .map((participant) => this.toPublicParticipant(participant))
      .sort((a, b) => {
        if (a.role === b.role) {
          return a.joinedAt - b.joinedAt;
        }
        return a.role === 'host' ? -1 : 1;
      });
  }

  private toPublicParticipant(participant: RoomParticipant): PublicParticipant {
    return {
      userId: participant.userId,
      userName: participant.userName,
      role: participant.role,
      joinedAt: participant.joinedAt,
      online: participant.online,
      lastSeenAt: participant.lastSeenAt,
    };
  }

  private generateRoomId(): string {
    let roomId = '';
    do {
      roomId = Array.from({ length: ROOM_ID_LENGTH }, () => {
        const index = Math.floor(Math.random() * ROOM_ID_CHARS.length);
        return ROOM_ID_CHARS[index];
      }).join('');
    } while (this.rooms.has(roomId));
    return roomId;
  }

  private fail<T>(message: string, code: ErrorResponse['code']): SocketResult<T> {
    return {
      success: false,
      error: this.error(message, code),
    };
  }

  private error(message: string, code: ErrorResponse['code']): ErrorResponse {
    return { message, code };
  }
}

function sanitizeUserName(userName: string): string {
  if (typeof userName !== 'string') {
    return '';
  }
  return userName.trim().slice(0, 32);
}

function normalizeRoomId(roomId: string): string {
  if (typeof roomId !== 'string') {
    return '';
  }
  const normalized = roomId.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    return '';
  }
  return normalized;
}
