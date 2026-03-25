export type UserRole = 'host' | 'participant';
export type MeetingStatus = 'idle' | 'active' | 'ended';

export interface User {
  userId: string;
  userName: string;
  role: UserRole;
  joinedAt: number;
  online: boolean;
  lastSeenAt: number;
}

export interface RoomState {
  roomId: string;
  participants: User[];
  hostId: string;
  status: MeetingStatus;
  currentStep: number;
}

export interface SessionCredentials {
  roomId: string;
  userId: string;
  sessionId: string;
}

export interface MeetingContextType extends RoomState {
  myUserId: string;
  myRole: UserRole;
  myName: string;
  sessionId: string;
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;

  // Actions
  createRoom: (userName: string) => Promise<boolean>;
  joinRoom: (roomId: string, userName: string) => Promise<boolean>;
  leaveRoom: () => Promise<boolean>;
  startMeeting: () => Promise<boolean>;
  nextStep: () => Promise<boolean>;
  endMeeting: () => Promise<boolean>;
  clearError: () => void;
}
