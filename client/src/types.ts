export type UserRole = 'host' | 'participant';
export type MeetingPhase = 'setup' | 'live';

export interface ParticipantWorkSubmission {
  url: string;
  description: string;
  updatedAt: number;
}

export type ParticipantWorks = Record<string, ParticipantWorkSubmission>;

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

export interface User {
  userId: string;
  userName: string;
  role: UserRole;
  joinedAt: number;
  online: boolean;
  lastSeenAt: number;
  works?: ParticipantWorks;
}

export interface RoomState {
  title: string;
  participants: User[];
  hostId: string;
  phase: MeetingPhase;
  currentStep: number;
  pages: MeetingPageDefinition[];
  pageContents: Map<string, PageContent>;
}

export interface SessionCredentials {
  userId: string;
  sessionId: string;
}

export interface MeetingContextType extends RoomState {
  myUserId: string;
  myRole: UserRole;
  myTicket: string;
  isConnected: boolean;
  isReconnecting: boolean;
  error: string | null;

  // Actions
  createRoom: (userName: string, title: string, password: string, participantLimit: number) => Promise<boolean>;
  joinRoom: (userName: string, ticket?: string) => Promise<boolean>;
  leaveRoom: () => Promise<boolean>;
  endRoom: () => Promise<boolean>;
  startLive: () => Promise<boolean>;
  returnToSetup: () => Promise<boolean>;
  nextStep: () => Promise<boolean>;
  prevStep: () => Promise<boolean>;
  updatePageContent: (pageId: string, content: PageContent | null) => Promise<boolean>;
  updatePages: (pages: MeetingPageDefinition[]) => Promise<boolean>;
  submitMyWork: (pageId: string, url: string, description: string) => Promise<boolean>;
  clearError: () => void;
}
