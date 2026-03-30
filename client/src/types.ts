export type UserRole = 'host' | 'participant';
export type MeetingStatus = 'active' | 'ended';
export type MeetingPhase = 'setup' | 'live';

export interface PageContent {
  type: 'canvas' | 'image' | 'url' | 'html' | 'markdown';
  content: string;
}

export type MeetingPageTheme = 1 | 2 | 3;
export type MeetingPageKind = 'canvas' | 'selfIntro' | 'showcase';

export interface MeetingPageDefinition {
  id: string;
  theme: MeetingPageTheme;
  kind: MeetingPageKind;
  title: string;
}

export interface User {
  userId: string;
  userName: string;
  role: UserRole;
  joinedAt: number;
  online: boolean;
  lastSeenAt: number;
  avatar?: string;
  ticket?: string;
  workUrl?: string;
  workDescription?: string;
  workUpdatedAt?: number;
}

export interface RoomState {
  title: string;
  participants: User[];
  hostId: string;
  status: MeetingStatus;
  phase: MeetingPhase;
  currentStep: number;
  pages: MeetingPageDefinition[];
  pageContents: Map<string, PageContent>;
}

export interface SessionCredentials {
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
  createRoom: (userName: string, title: string, password: string) => Promise<boolean>;
  joinRoom: (userName: string, ticket?: string, avatar?: string) => Promise<boolean>;
  leaveRoom: () => Promise<boolean>;
  endRoom: () => Promise<boolean>;
  startLive: () => Promise<boolean>;
  returnToSetup: () => Promise<boolean>;
  nextStep: () => Promise<boolean>;
  prevStep: () => Promise<boolean>;
  endMeeting: () => Promise<boolean>;
  updatePageContent: (pageId: string, content: PageContent | null) => Promise<boolean>;
  updatePages: (pages: MeetingPageDefinition[]) => Promise<boolean>;
  submitMyWork: (url: string, description: string) => Promise<boolean>;
  clearError: () => void;
}
