export type UserRole = 'host' | 'participant';
export type MeetingStatus = 'active' | 'ended';

export interface User {
  userId: string;
  userName: string;
  role: UserRole;
  joinedAt: number;
  online: boolean;
  lastSeenAt: number;
  avatar?: string;
  ticket?: string;
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
  ticket?: string;
}

export interface MeetingContextType extends RoomState {
  myUserId: string;
  myRole: UserRole;
  myName: string;
  myTicket: string;
  sessionId: string;
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;

  // Actions
  createRoom: (userName: string, roomId: string, password: string, avatar?: string) => Promise<boolean>;
  joinRoom: (roomId: string, userName: string, ticket?: string, avatar?: string) => Promise<boolean>;
  leaveRoom: () => Promise<boolean>;
  endRoom: () => Promise<boolean>;
  nextStep: () => Promise<boolean>;
  prevStep: () => Promise<boolean>;
  endMeeting: () => Promise<boolean>;
  clearError: () => void;
}