export type UserRole = 'host' | 'participant';
export type MeetingStatus = 'active' | 'ended';

export type RoomCloseReason = 'HOST_LEFT' | 'HOST_TIMEOUT' | 'ROOM_EXPIRED';

export interface RoomParticipant {
  userId: string;
  userName: string;
  role: UserRole;
  joinedAt: number;
  sessionId: string;
  socketId: string | null;
  online: boolean;
  lastSeenAt: number;
  avatar?: string;
  ticket?: string;
}

export interface PublicParticipant {
  userId: string;
  userName: string;
  role: UserRole;
  joinedAt: number;
  online: boolean;
  lastSeenAt: number;
  avatar?: string;
  ticket?: string;
}

export interface Room {
  roomId: string;
  hostId: string;
  participants: Map<string, RoomParticipant>;
  status: MeetingStatus;
  currentStep: number;
  createdAt: number;
  updatedAt: number;
}

export interface RoomStateSync {
  roomId: string;
  participants: PublicParticipant[];
  hostId: string;
  status: MeetingStatus;
  currentStep: number;
  userId: string;
  userRole: UserRole;
  userName: string;
  sessionId: string;
  avatar?: string;
  ticket?: string;
}

export interface SocketIdentity {
  roomId: string;
  userId: string;
  sessionId: string;
}

export interface ErrorResponse {
  message: string;
  code:
    | 'BAD_REQUEST'
    | 'INVALID_PASSWORD'
    | 'ROOM_EXISTS'
    | 'ROOM_NOT_FOUND'
    | 'ROOM_CLOSED'
    | 'ROOM_FULL'
    | 'NOT_AUTHENTICATED'
    | 'NOT_AUTHORIZED'
    | 'SESSION_EXPIRED'
    | 'MEETING_NOT_ACTIVE'
    | 'USER_NOT_FOUND'
    | 'INTERNAL_ERROR';
}

export type SocketResult<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorResponse };