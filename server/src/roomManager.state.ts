import {
  MeetingPageDefinition,
  MeetingPhase,
  MeetingStatus,
  PageContent,
  PublicParticipant,
  Room,
  RoomParticipant,
  RoomStateSync,
} from './types';
import { cloneParticipantWorks } from './roomManager.validation';

export function buildPublicRoomSnapshot(room: Room): {
  title: string;
  status: MeetingStatus;
  phase: MeetingPhase;
  currentStep: number;
  hostId: string;
  participants: PublicParticipant[];
  pages: MeetingPageDefinition[];
  pageContents: Array<[string, PageContent]>;
} {
  return {
    title: room.title,
    status: room.status,
    phase: room.phase,
    currentStep: room.currentStep,
    hostId: room.hostId,
    participants: getPublicParticipants(room),
    pages: room.pages,
    pageContents: Array.from(room.pageContents.entries()),
  };
}

export function toRoomStateSync(room: Room, me: RoomParticipant): RoomStateSync {
  const syncData: RoomStateSync = {
    title: room.title,
    participants: getPublicParticipants(room),
    hostId: room.hostId,
    status: room.status,
    phase: room.phase,
    currentStep: room.currentStep,
    pages: room.pages,
    userId: me.userId,
    userRole: me.role,
    sessionId: me.sessionId,
    ticket: me.ticket,
  };

  if (room.pageContents.size > 0) {
    syncData.pageContents = Array.from(room.pageContents.entries());
  }

  return syncData;
}

function getPublicParticipants(room: Room): PublicParticipant[] {
  return Array.from(room.participants.values())
    .map((participant) => toPublicParticipant(participant))
    .sort((a, b) => {
      if (a.role === b.role) {
        return a.joinedAt - b.joinedAt;
      }
      return a.role === 'host' ? -1 : 1;
    });
}

export function toPublicParticipant(participant: RoomParticipant): PublicParticipant {
  return {
    userId: participant.userId,
    userName: participant.userName,
    role: participant.role,
    joinedAt: participant.joinedAt,
    works: cloneParticipantWorks(participant.works),
  };
}
