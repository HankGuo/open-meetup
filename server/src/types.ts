export type UserRole = 'host' | 'participant';
export type MeetingStatus = 'active' | 'ended';
export type MeetingPhase = 'setup' | 'live';

export type RoomCloseReason = 'HOST_LEFT' | 'HOST_ENDED' | 'HOST_TIMEOUT' | 'ROOM_EXPIRED';

export interface ParticipantWorkSubmission {
  url: string;
  description: string;
  updatedAt: number;
}

export type ParticipantWorks = Record<string, ParticipantWorkSubmission>;

export interface RoomParticipant {
  userId: string;
  userName: string;
  role: UserRole;
  joinedAt: number;
  sessionId: string;
  socketId: string | null;
  online: boolean;
  lastSeenAt: number;
  ticket?: string;
  works?: ParticipantWorks;
}

export interface PublicParticipant {
  userId: string;
  userName: string;
  role: UserRole;
  joinedAt: number;
  online: boolean;
  lastSeenAt: number;
  works?: ParticipantWorks;
}

export interface PageContent {
  type: 'canvas' | 'image' | 'url' | 'html' | 'markdown';
  content: string;
}

export type MeetingPageTheme = 1 | 3;
export type PageSubmissionMode = 'url' | 'image';
export type MeetingPageKind = 'canvas' | 'showcase';

export interface MeetingPageDefinition {
  id: string;
  theme: MeetingPageTheme;
  kind: MeetingPageKind;
  title: string;
  submissionMode?: PageSubmissionMode;
  rankingEnabled?: boolean;
}

export interface Room {
  id: string;
  title: string;
  participantLimit: number;
  hostId: string;
  participants: Map<string, RoomParticipant>;
  status: MeetingStatus;
  phase: MeetingPhase;
  currentStep: number;
  createdAt: number;
  updatedAt: number;
  pages: MeetingPageDefinition[];
  pageContents: Map<string, PageContent>;
}

export interface RoomStateSync {
  title: string;
  participants: PublicParticipant[];
  hostId: string;
  status: MeetingStatus;
  phase: MeetingPhase;
  currentStep: number;
  pages: MeetingPageDefinition[];
  userId: string;
  userRole: UserRole;
  sessionId: string;
  ticket?: string;
  pageContents?: Array<[string, PageContent]>;
}

export interface SocketIdentity {
  userId: string;
  sessionId: string;
}

export interface ErrorResponse {
  message: string;
  code:
    | 'BAD_REQUEST'
    | 'INVALID_TICKET'
    | 'INVALID_PASSWORD'
    | 'ROOM_EXISTS'
    | 'ROOM_NOT_FOUND'
    | 'ROOM_CLOSED'
    | 'ROOM_FULL'
    | 'NOT_AUTHENTICATED'
    | 'NOT_AUTHORIZED'
    | 'SESSION_EXPIRED'
    | 'ROOM_NOT_ACTIVE'
    | 'USER_NOT_FOUND'
    | 'INTERNAL_ERROR';
}

export type SocketResult<T> =
  | { success: true; data: T }
  | { success: false; error: ErrorResponse };
