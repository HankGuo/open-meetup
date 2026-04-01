import { randomUUID } from 'crypto';
import {
  ErrorResponse,
  MeetingStatus,
  MeetingPageDefinition,
  MeetingPageKind,
  MeetingPageTheme,
  MeetingPhase,
  PageContent,
  PublicParticipant,
  Room,
  RoomCloseReason,
  RoomParticipant,
  RoomStateSync,
  SocketIdentity,
  SocketResult,
} from './types';
import { HOST_PASSWORD } from './config';
import { MemoryStore, RoomStore } from './store';
import { createDefaultMeetingPages, MAX_MEETING_PAGES } from './meetingConfig';

const MAX_PARTICIPANTS_PER_ROOM = 50;
const DISCONNECT_GRACE_MS = 120_000;
const PARTICIPANT_TICKET_PREFIX = 'TKT-';
const PARTICIPANT_TICKET_RANDOM_LENGTH = 8;
const MAX_WORK_URL_LENGTH = 500;
const MAX_WORK_DESCRIPTION_LENGTH = 120;
const MAX_PAGE_TITLE_LENGTH = 64;

type AuthContext = { room: Room; participant: RoomParticipant; identity: SocketIdentity };

type RoomOperationResult = SocketResult<{
  status: MeetingStatus;
  phase: MeetingPhase;
  currentStep: number;
  hostId: string;
  participants: PublicParticipant[];
  pages: MeetingPageDefinition[];
  pageContents: Array<[string, PageContent]>;
}>;

type WorkSubmitResult = SocketResult<RoomStateSync>;

type LeaveResult =
  | {
      ok: true;
      roomClosed: false;
      leftUser: PublicParticipant;
    }
  | {
      ok: true;
      roomClosed: true;
      reason: RoomCloseReason;
    }
  | {
      ok: false;
      error: ErrorResponse;
    };

interface CleanupResult {
  closedRooms: Array<{ reason: RoomCloseReason }>;
  removedParticipants: PublicParticipant[];
}

export class RoomManager {
  private socketToIdentity: Map<string, SocketIdentity> = new Map();
  private readonly store: RoomStore;

  constructor(store: RoomStore = new MemoryStore()) {
    this.store = store;
  }

  getActiveRoomCount(): number {
    return this.getActiveRoom() ? 1 : 0;
  }

  getActiveRoom(): Room | null {
    return this.store.loadRoom();
  }

  createRoom(
    hostUserName: string,
    title: string,
    password: string,
    socketId: string,
    avatar?: string,
  ): SocketResult<RoomStateSync> {
    const existingRoom = this.getActiveRoom();
    if (existingRoom) {
      return this.fail('A room already exists. Please end the current room first.', 'ROOM_EXISTS');
    }

    const userName = sanitizeUserName(hostUserName);
    const roomTitle = sanitizeTitle(title);
    if (!userName) {
      return this.fail('Name is required', 'BAD_REQUEST');
    }
    if (!roomTitle) {
      return this.fail('Title is required', 'BAD_REQUEST');
    }

    if (password !== HOST_PASSWORD) {
      return this.fail('Invalid password', 'INVALID_PASSWORD');
    }

    this.detachSocket(socketId);

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
      avatar,
      ticket: 'HOST-' + randomUUID().substring(0, 8).toUpperCase(),
    };

    const activeRoom: Room = {
      title: roomTitle,
      hostId: host.userId,
      participants: new Map([[host.userId, host]]),
      status: 'active',
      phase: 'setup',
      currentStep: 0,
      createdAt: now,
      updatedAt: now,
      pages: createDefaultMeetingPages(),
      pageContents: new Map(),
    };

    this.socketToIdentity.set(socketId, {
      userId: host.userId,
      sessionId: host.sessionId,
    });

    this.store.saveRoom(activeRoom);

    return {
      success: true,
      data: this.toRoomStateSync(activeRoom, host),
    };
  }

  joinRoom(
    userNameInput: string,
    socketId: string,
    avatar?: string,
    ticket?: string,
  ): SocketResult<RoomStateSync> {
    const room = this.getActiveRoom();
    if (!room) {
      return this.fail('Room not found', 'ROOM_NOT_FOUND');
    }
    if (room.status === 'ended') {
      return this.fail('Room is closed', 'ROOM_CLOSED');
    }

    this.detachSocket(socketId);

    const requestedTicket = typeof ticket === 'string' ? normalizeTicket(ticket) : '';
    if (ticket != null && !requestedTicket) {
      return this.fail('Invalid ticket', 'INVALID_TICKET');
    }

    if (requestedTicket) {
      const participant = this.findParticipantByTicket(room, requestedTicket);
      if (!participant) {
        return this.fail('Invalid ticket', 'INVALID_TICKET');
      }

      if (participant.socketId && participant.socketId !== socketId) {
        this.socketToIdentity.delete(participant.socketId);
      }

      const now = Date.now();
      participant.socketId = socketId;
      participant.online = true;
      participant.lastSeenAt = now;
      if (avatar && avatar.trim()) {
        participant.avatar = avatar;
      }
      room.updatedAt = now;

      this.socketToIdentity.set(socketId, {
        userId: participant.userId,
        sessionId: participant.sessionId,
      });

      this.store.saveRoom(room);

      return {
        success: true,
        data: this.toRoomStateSync(room, participant),
      };
    }

    const userName = sanitizeUserName(userNameInput);
    if (!userName) {
      return this.fail('Invalid user name', 'BAD_REQUEST');
    }
    if (room.participants.size >= MAX_PARTICIPANTS_PER_ROOM) {
      return this.fail('Room is full', 'ROOM_FULL');
    }

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
      avatar,
      ticket: this.generateParticipantTicket(room),
    };

    room.participants.set(participant.userId, participant);
    room.updatedAt = now;
    this.socketToIdentity.set(socketId, {
      userId: participant.userId,
      sessionId: participant.sessionId,
    });

    this.store.saveRoom(room);

    return {
      success: true,
      data: this.toRoomStateSync(room, participant),
    };
  }

  reconnect(identity: SocketIdentity, socketId: string): SocketResult<RoomStateSync> {
    if (!identity.userId || !identity.sessionId) {
      return this.fail('Invalid reconnect payload', 'BAD_REQUEST');
    }

    const room = this.getActiveRoom();
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

    if (participant.socketId && participant.socketId !== socketId) {
      this.socketToIdentity.delete(participant.socketId);
    }

    this.detachSocket(socketId);

    participant.socketId = socketId;
    participant.online = true;
    participant.lastSeenAt = Date.now();
    room.updatedAt = participant.lastSeenAt;

    this.socketToIdentity.set(socketId, {
      userId: participant.userId,
      sessionId: participant.sessionId,
    });

    this.store.saveRoom(room);

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
      this.closeRoom();
      return {
        ok: true,
        roomClosed: true,
        reason: 'HOST_LEFT',
      };
    }

    if (room.participants.size === 0) {
      this.closeRoom();
      return {
        ok: true,
        roomClosed: true,
        reason: 'ROOM_EXPIRED',
      };
    }

    this.store.saveRoom(room);

    return {
      ok: true,
      roomClosed: false,
      leftUser,
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
    if (auth.room.phase !== 'live') {
      return this.fail('请先开始播放后再切换页面', 'BAD_REQUEST');
    }

    const maxStepIndex = Math.max(0, auth.room.pages.length - 1);
    if (auth.room.currentStep < maxStepIndex) {
      auth.room.currentStep += 1;
      auth.room.updatedAt = Date.now();
      this.store.saveRoom(auth.room);
    }

    return {
      success: true,
      data: this.buildPublicRoomSnapshot(auth.room),
    };
  }

  prevStep(identity: SocketIdentity): RoomOperationResult {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'host') {
      return this.fail('Only host can perform this action', 'NOT_AUTHORIZED');
    }
    if (auth.room.phase !== 'live') {
      return this.fail('请先开始播放后再切换页面', 'BAD_REQUEST');
    }

    if (auth.room.currentStep > 0) {
      auth.room.currentStep -= 1;
      auth.room.updatedAt = Date.now();
      this.store.saveRoom(auth.room);
    }

    return {
      success: true,
      data: this.buildPublicRoomSnapshot(auth.room),
    };
  }

  startLive(identity: SocketIdentity): RoomOperationResult {
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
    if (auth.room.pages.length === 0) {
      return this.fail('至少保留一个页面后再开始', 'BAD_REQUEST');
    }

    auth.room.phase = 'live';
    auth.room.currentStep = 0;
    auth.room.updatedAt = Date.now();
    this.store.saveRoom(auth.room);

    return {
      success: true,
      data: this.buildPublicRoomSnapshot(auth.room),
    };
  }

  returnToSetup(identity: SocketIdentity): RoomOperationResult {
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

    auth.room.phase = 'setup';
    const maxStepIndex = Math.max(0, auth.room.pages.length - 1);
    if (auth.room.currentStep > maxStepIndex) {
      auth.room.currentStep = maxStepIndex;
    }
    auth.room.updatedAt = Date.now();
    this.store.saveRoom(auth.room);

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
    this.store.saveRoom(auth.room);

    return {
      success: true,
      data: this.buildPublicRoomSnapshot(auth.room),
    };
  }

  validateHostIdentity(identity: SocketIdentity): SocketResult<null> {
    if (!identity.userId || !identity.sessionId) {
      return this.fail('Missing identity', 'BAD_REQUEST');
    }

    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'host') {
      return this.fail('Only host can perform this action', 'NOT_AUTHORIZED');
    }

    return {
      success: true,
      data: null,
    };
  }

  updatePageContent(
    identity: SocketIdentity,
    pageId: string,
    content: PageContent | null,
  ): SocketResult<RoomStateSync> {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'host') {
      return this.fail('Only host can perform this action', 'NOT_AUTHORIZED');
    }
    if (auth.room.phase !== 'setup') {
      return this.fail('播放阶段不允许编辑页面内容', 'BAD_REQUEST');
    }

    const normalizedPageId = sanitizePageId(pageId);
    if (!normalizedPageId) {
      return this.fail('页面 ID 无效', 'BAD_REQUEST');
    }
    if (!auth.room.pages.some((page) => page.id === normalizedPageId)) {
      return this.fail('页面不存在', 'BAD_REQUEST');
    }

    if (content === null) {
      auth.room.pageContents.delete(normalizedPageId);
    } else {
      auth.room.pageContents.set(normalizedPageId, content);
    }
    auth.room.updatedAt = Date.now();
    this.store.saveRoom(auth.room);

    return {
      success: true,
      data: this.toRoomStateSync(auth.room, auth.participant),
    };
  }

  updatePages(identity: SocketIdentity, pagesInput: MeetingPageDefinition[]): SocketResult<RoomStateSync> {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'host') {
      return this.fail('Only host can perform this action', 'NOT_AUTHORIZED');
    }
    if (auth.room.phase !== 'setup') {
      return this.fail('播放阶段不允许调整页面', 'BAD_REQUEST');
    }

    const normalizedPages = sanitizePagesInput(pagesInput);
    if (!normalizedPages) {
      return this.fail('页面配置不合法', 'BAD_REQUEST');
    }
    if (normalizedPages.length > MAX_MEETING_PAGES) {
      return this.fail(`页面数量不能超过 ${MAX_MEETING_PAGES} 个`, 'BAD_REQUEST');
    }

    auth.room.pages = normalizedPages;

    const validIds = new Set(normalizedPages.map((page) => page.id));
    for (const pageId of Array.from(auth.room.pageContents.keys())) {
      if (!validIds.has(pageId)) {
        auth.room.pageContents.delete(pageId);
      }
    }

    const maxStepIndex = Math.max(0, normalizedPages.length - 1);
    if (auth.room.currentStep > maxStepIndex) {
      auth.room.currentStep = maxStepIndex;
    }

    auth.room.updatedAt = Date.now();
    this.store.saveRoom(auth.room);

    return {
      success: true,
      data: this.toRoomStateSync(auth.room, auth.participant),
    };
  }

  forceEndRoom(identity: SocketIdentity): SocketResult<{ closed: boolean }> {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'host') {
      return this.fail('Only host can perform this action', 'NOT_AUTHORIZED');
    }

    this.closeRoom();

    return {
      success: true,
      data: { closed: true },
    };
  }

  submitWork(identity: SocketIdentity, workUrlInput: string, workDescriptionInput: string): WorkSubmitResult {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'participant') {
      return this.fail('Only participant can submit work', 'NOT_AUTHORIZED');
    }

    const workUrl = sanitizeWorkUrl(workUrlInput);
    if (!workUrl) {
      return this.fail('请填写有效的 http/https 作品链接', 'BAD_REQUEST');
    }

    const workDescription = sanitizeWorkDescription(workDescriptionInput);
    if (!workDescription) {
      return this.fail('请填写一句话作品描述（最多 120 字）', 'BAD_REQUEST');
    }

    const now = Date.now();
    auth.participant.workUrl = workUrl;
    auth.participant.workDescription = workDescription;
    auth.participant.workUpdatedAt = now;
    auth.room.updatedAt = now;
    this.store.saveRoom(auth.room);

    return {
      success: true,
      data: this.toRoomStateSync(auth.room, auth.participant),
    };
  }

  getStateByIdentity(identity: SocketIdentity): SocketResult<RoomStateSync> {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    const room = this.getActiveRoom();
    return {
      success: true,
      data: this.toRoomStateSync(room!, auth.participant),
    };
  }

  onSocketDisconnected(socketId: string): { user: PublicParticipant } | null {
    const identity = this.socketToIdentity.get(socketId);
    this.socketToIdentity.delete(socketId);

    const room = this.getActiveRoom();
    if (!room || !identity) {
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
    this.store.saveRoom(room);

    return {
      user: this.toPublicParticipant(participant),
    };
  }

  cleanupExpired(now = Date.now()): CleanupResult {
    const closedRooms: Array<{ reason: RoomCloseReason }> = [];
    const removedParticipants: PublicParticipant[] = [];

    const room = this.getActiveRoom();
    if (!room) {
      return { closedRooms, removedParticipants };
    }

    const offlineUsers: RoomParticipant[] = [];
    for (const participant of room.participants.values()) {
      if (!participant.online && now - participant.lastSeenAt > DISCONNECT_GRACE_MS) {
        offlineUsers.push(participant);
      }
    }

    for (const participant of offlineUsers) {
      removedParticipants.push(this.toPublicParticipant(participant));
      room.participants.delete(participant.userId);
    }

    if (offlineUsers.length > 0) {
      room.updatedAt = now;
      this.store.saveRoom(room);
    }

    const hostAlive = room.participants.has(room.hostId);
    if (!hostAlive) {
      closedRooms.push({ reason: 'HOST_TIMEOUT' });
      this.closeRoom();
    } else if (room.participants.size === 0) {
      closedRooms.push({ reason: 'ROOM_EXPIRED' });
      this.closeRoom();
    }

    return { closedRooms, removedParticipants };
  }

  getDisconnectGraceMs(): number {
    return DISCONNECT_GRACE_MS;
  }

  getPublicRoomSnapshot(): SocketResult<{
    status: MeetingStatus;
    phase: MeetingPhase;
    currentStep: number;
    hostId: string;
    participants: PublicParticipant[];
    pages: MeetingPageDefinition[];
    pageContents: Array<[string, PageContent]>;
  }> {
    const room = this.getActiveRoom();
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
    const room = this.getActiveRoom();
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

  private closeRoom(): void {
    for (const [socketId, id] of this.socketToIdentity.entries()) {
      const room = this.getActiveRoom();
      if (room?.participants.has(id.userId)) {
        this.socketToIdentity.delete(socketId);
      }
    }
    this.store.clearAll();
  }

  private detachSocket(socketId: string): void {
    const oldIdentity = this.socketToIdentity.get(socketId);
    if (!oldIdentity) {
      return;
    }
    this.socketToIdentity.delete(socketId);

    const room = this.getActiveRoom();
    if (!room) {
      return;
    }
    const oldParticipant = room.participants.get(oldIdentity.userId);
    if (!oldParticipant || oldParticipant.sessionId !== oldIdentity.sessionId) {
      return;
    }
    oldParticipant.socketId = null;
    oldParticipant.online = false;
    oldParticipant.lastSeenAt = Date.now();
    room.updatedAt = oldParticipant.lastSeenAt;
    this.store.saveRoom(room);
  }

  private findParticipantByTicket(room: Room, ticket: string): RoomParticipant | null {
    const normalized = normalizeTicket(ticket);
    if (!normalized) {
      return null;
    }

    for (const participant of room.participants.values()) {
      if (normalizeTicket(participant.ticket ?? '') === normalized) {
        return participant;
      }
    }
    return null;
  }

  private generateParticipantTicket(room: Room): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const candidate =
        PARTICIPANT_TICKET_PREFIX + randomUUID().replace(/-/g, '').slice(0, PARTICIPANT_TICKET_RANDOM_LENGTH).toUpperCase();
      if (!this.findParticipantByTicket(room, candidate)) {
        return candidate;
      }
    }

    return (
      PARTICIPANT_TICKET_PREFIX +
      `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
        .slice(0, PARTICIPANT_TICKET_RANDOM_LENGTH)
        .toUpperCase()
    );
  }

  private buildPublicRoomSnapshot(room: Room): {
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
      participants: this.getPublicParticipants(room),
      pages: room.pages,
      pageContents: Array.from(room.pageContents.entries()),
    };
  }

  private toRoomStateSync(room: Room, me: RoomParticipant): RoomStateSync {
    const syncData: RoomStateSync = {
      title: room.title,
      participants: this.getPublicParticipants(room),
      hostId: room.hostId,
      status: room.status,
      phase: room.phase,
      currentStep: room.currentStep,
      pages: room.pages,
      userId: me.userId,
      userRole: me.role,
      userName: me.userName,
      sessionId: me.sessionId,
      avatar: me.avatar,
      ticket: me.ticket,
      workUrl: me.workUrl,
      workDescription: me.workDescription,
      workUpdatedAt: me.workUpdatedAt,
    };

    if (room.pageContents.size > 0) {
      syncData.pageContents = Array.from(room.pageContents.entries());
    }

    return syncData;
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
      avatar: participant.avatar,
      ticket: participant.ticket,
      workUrl: participant.workUrl,
      workDescription: participant.workDescription,
      workUpdatedAt: participant.workUpdatedAt,
    };
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

function sanitizeTitle(title: string): string {
  if (typeof title !== 'string') {
    return '';
  }
  return title.trim().slice(0, 64);
}

function sanitizePageId(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.slice(0, 120);
}

function sanitizePageKind(value: unknown): MeetingPageKind | null {
  if (value === 'canvas' || value === 'selfIntro' || value === 'showcase') {
    return value;
  }
  return null;
}

function sanitizePageTheme(value: unknown): MeetingPageTheme | null {
  if (value === 1 || value === 2 || value === 3) {
    return value;
  }
  return null;
}

function sanitizePageTitle(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().slice(0, MAX_PAGE_TITLE_LENGTH);
}

function sanitizePagesInput(value: unknown): MeetingPageDefinition[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const seenIds = new Set<string>();
  const pages: MeetingPageDefinition[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const rawPage = raw as Record<string, unknown>;
    const id = sanitizePageId(rawPage.id);
    const kind = sanitizePageKind(rawPage.kind);
    const theme = sanitizePageTheme(rawPage.theme);
    const title = sanitizePageTitle(rawPage.title);

    if (!id || !kind || !theme || !title || seenIds.has(id)) {
      return null;
    }

    seenIds.add(id);
    pages.push({
      id,
      kind,
      theme,
      title,
    });
  }

  return pages;
}

function normalizeTicket(ticket: string): string {
  if (typeof ticket !== 'string') {
    return '';
  }
  return ticket.trim().toUpperCase();
}

function sanitizeWorkUrl(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_WORK_URL_LENGTH) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

function sanitizeWorkDescription(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_WORK_DESCRIPTION_LENGTH) {
    return '';
  }
  return trimmed;
}
