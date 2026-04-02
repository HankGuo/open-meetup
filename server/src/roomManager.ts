import { randomUUID } from 'crypto';
import path from 'path';
import {
  ErrorResponse,
  MeetingStatus,
  MeetingPageDefinition,
  MeetingPageKind,
  MeetingPageTheme,
  MeetingPhase,
  ParticipantWorks,
  PageSubmissionMode,
  PageContent,
  PublicParticipant,
  Room,
  RoomCloseReason,
  RoomParticipant,
  RoomStateSync,
  SocketIdentity,
  SocketResult,
} from './types';
import {
  DEFAULT_PARTICIPANTS_PER_ROOM,
  HOST_PASSWORD,
  ROOM_PARTICIPANT_LIMIT_MAX,
  ROOM_PARTICIPANT_LIMIT_MIN,
} from './config';
import { MemoryStore, RoomStore } from './store';
import { createDefaultMeetingPages, MAX_MEETING_PAGES } from './meetingConfig';
import { AssetStorage, createAssetStorage } from './assetStorage';

const DISCONNECT_GRACE_MS = 120_000;
const PARTICIPANT_TICKET_PREFIX = 'TKT-';
const PARTICIPANT_TICKET_RANDOM_LENGTH = 12;
const HOST_TICKET_RANDOM_LENGTH = 12;
const MAX_WORK_URL_LENGTH = 2_048;
const MAX_IMAGE_DATA_URL_LENGTH = 4_000_000;
const MAX_IMAGE_UPLOAD_BYTES = 2_000_000;
const MAX_WORK_DESCRIPTION_LENGTH = 120;
const MAX_PAGE_TITLE_LENGTH = 64;
const UPLOAD_URL_PREFIX = '/uploads';

type AuthContext = { room: Room; participant: RoomParticipant };

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
  private readonly assetStorage: AssetStorage;

  constructor(store?: RoomStore, assetStorage?: AssetStorage) {
    this.store = store ?? new MemoryStore();
    this.assetStorage = assetStorage ?? createAssetStorage();
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
    participantLimitInput?: unknown,
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
    const participantLimit = sanitizeParticipantLimit(participantLimitInput);
    if (participantLimit == null) {
      return this.fail(
        `Participant limit must be between ${ROOM_PARTICIPANT_LIMIT_MIN} and ${ROOM_PARTICIPANT_LIMIT_MAX}`,
        'BAD_REQUEST',
      );
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
      ticket: this.generateHostTicket(),
    };

    const activeRoom: Room = {
      id: randomUUID(),
      title: roomTitle,
      participantLimit,
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
    if (getParticipantAudienceCount(room) >= room.participantLimit) {
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

  async leaveRoom(identity: SocketIdentity): Promise<LeaveResult> {
    const auth = this.authorize(identity);
    if (!auth) {
      return { ok: false, error: this.error('Not authenticated', 'NOT_AUTHENTICATED') };
    }

    const { room, participant } = auth;
    const now = Date.now();
    const removedUploadUrls = this.collectManagedUploadUrlsFromParticipantWorks(participant.works, room.id);

    room.participants.delete(participant.userId);
    room.updatedAt = now;

    if (participant.socketId) {
      this.socketToIdentity.delete(participant.socketId);
    }

    if (participant.role === 'host') {
      await this.closeRoom();
      return {
        ok: true,
        roomClosed: true,
        reason: 'HOST_LEFT',
      };
    }

    if (room.participants.size === 0) {
      await this.closeRoom();
      return {
        ok: true,
        roomClosed: true,
        reason: 'ROOM_EXPIRED',
      };
    }

    await this.cleanupUploadUrls(room, removedUploadUrls);
    this.store.saveRoom(room);

    return {
      ok: true,
      roomClosed: false,
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
      return this.fail('Room is not active', 'ROOM_NOT_ACTIVE');
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
      return this.fail('Room is not active', 'ROOM_NOT_ACTIVE');
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

  async updatePages(identity: SocketIdentity, pagesInput: MeetingPageDefinition[]): Promise<SocketResult<RoomStateSync>> {
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

    const validShowcaseIds = new Set(
      normalizedPages.filter((page) => page.kind === 'showcase').map((page) => page.id),
    );
    const showcaseModeByPageId = new Map(
      normalizedPages
        .filter((page) => page.kind === 'showcase')
        .map((page) => [page.id, page.submissionMode ?? 'url'] as const),
    );
    const removedUploadUrls = new Set<string>();
    for (const participant of auth.room.participants.values()) {
      if (!participant.works) {
        continue;
      }
      for (const submissionPageId of Object.keys(participant.works)) {
        const submission = participant.works[submissionPageId];
        const mode = showcaseModeByPageId.get(submissionPageId);
        if (!validShowcaseIds.has(submissionPageId) || !mode || !isValidSubmissionForMode(submission, mode)) {
          const managedUpload = this.normalizeManagedUploadUrlForRoom(submission?.url, auth.room.id);
          if (managedUpload) {
            removedUploadUrls.add(managedUpload);
          }
          delete participant.works[submissionPageId];
        }
      }
      if (Object.keys(participant.works).length === 0) {
        delete participant.works;
      }
    }
    await this.cleanupUploadUrls(auth.room, removedUploadUrls);

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

  async forceEndRoom(identity: SocketIdentity): Promise<SocketResult<{ closed: boolean }>> {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'host') {
      return this.fail('Only host can perform this action', 'NOT_AUTHORIZED');
    }

    await this.closeRoom();

    return {
      success: true,
      data: { closed: true },
    };
  }

  async submitWork(
    identity: SocketIdentity,
    pageIdInput: string,
    workUrlInput: string,
    workDescriptionInput: string,
  ): Promise<WorkSubmitResult> {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'participant') {
      return this.fail('Only participant can submit work', 'NOT_AUTHORIZED');
    }
    if (auth.room.phase !== 'live') {
      return this.fail('仅播放阶段允许提交互动内容', 'BAD_REQUEST');
    }

    const pageId = sanitizePageId(pageIdInput);
    if (!pageId) {
      return this.fail('页面 ID 无效', 'BAD_REQUEST');
    }

    const targetPage = auth.room.pages.find((page) => page.id === pageId);
    if (!targetPage || targetPage.kind !== 'showcase') {
      return this.fail('当前页面不支持提交内容', 'BAD_REQUEST');
    }

    const workDescription = sanitizeWorkDescription(workDescriptionInput);
    if (!workDescription) {
      return this.fail('请填写一句话作品描述（最多 120 字）', 'BAD_REQUEST');
    }

    const submissionMode = targetPage.submissionMode ?? 'url';
    const workUrl =
      submissionMode === 'image'
        ? await this.persistImageSubmission(auth.room, workUrlInput)
        : sanitizeHttpWorkUrl(workUrlInput);
    if (!workUrl) {
      return this.fail(
        submissionMode === 'image' ? '请上传有效图片后再提交' : '请填写有效的 http/https 作品链接',
        'BAD_REQUEST',
      );
    }
    const previousSubmission = auth.participant.works?.[pageId];

    const now = Date.now();
    auth.participant.works = auth.participant.works ?? {};
    auth.participant.works[pageId] = {
      url: workUrl,
      description: workDescription,
      updatedAt: now,
    };
    if (previousSubmission && previousSubmission.url !== workUrl) {
      await this.cleanupUploadUrls(auth.room, [previousSubmission.url]);
    }
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
    return {
      success: true,
      data: this.toRoomStateSync(auth.room, auth.participant),
    };
  }

  onSocketDisconnected(socketId: string): boolean {
    const identity = this.socketToIdentity.get(socketId);
    this.socketToIdentity.delete(socketId);

    const room = this.getActiveRoom();
    if (!room || !identity) {
      return false;
    }
    const participant = room.participants.get(identity.userId);
    if (!participant || participant.sessionId !== identity.sessionId) {
      return false;
    }

    participant.socketId = null;
    participant.online = false;
    participant.lastSeenAt = Date.now();
    room.updatedAt = participant.lastSeenAt;
    this.store.saveRoom(room);

    return true;
  }

  async cleanupExpired(now = Date.now()): Promise<CleanupResult> {
    const closedRooms: Array<{ reason: RoomCloseReason }> = [];
    const removedParticipants: PublicParticipant[] = [];
    const removedUploadUrls = new Set<string>();

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
      for (const uploadUrl of this.collectManagedUploadUrlsFromParticipantWorks(participant.works, room.id)) {
        removedUploadUrls.add(uploadUrl);
      }
      room.participants.delete(participant.userId);
    }

    if (offlineUsers.length > 0) {
      await this.cleanupUploadUrls(room, removedUploadUrls);
      room.updatedAt = now;
      this.store.saveRoom(room);
    }

    const hostAlive = room.participants.has(room.hostId);
    if (!hostAlive) {
      closedRooms.push({ reason: 'HOST_TIMEOUT' });
      await this.closeRoom();
    } else if (room.participants.size === 0) {
      closedRooms.push({ reason: 'ROOM_EXPIRED' });
      await this.closeRoom();
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

  checkTicket(ticketInput: string): { valid: boolean } {
    const room = this.getActiveRoom();
    if (!room) {
      return { valid: false };
    }
    const normalizedTicket = normalizeTicket(ticketInput);
    if (!normalizedTicket) {
      return { valid: false };
    }
    const participant = this.findParticipantByTicket(room, normalizedTicket);
    if (!participant) {
      return { valid: false };
    }
    return { valid: true };
  }

  isIdentityAuthorized(identity: SocketIdentity | null | undefined): boolean {
    return this.authorize(identity) != null;
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
    return { room, participant };
  }

  private async closeRoom(): Promise<void> {
    const room = this.getActiveRoom();
    for (const [socketId, id] of this.socketToIdentity.entries()) {
      if (room?.participants.has(id.userId)) {
        this.socketToIdentity.delete(socketId);
      }
    }
    await this.removeRoomUploads(room?.id);
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

  private generateHostTicket(): string {
    return 'HOST-' + randomUUID().replace(/-/g, '').slice(0, HOST_TICKET_RANDOM_LENGTH).toUpperCase();
  }

  private async persistImageSubmission(room: Room, rawInput: string): Promise<string | null> {
    const parsed = parseBase64ImageDataUrl(rawInput);
    if (!parsed || parsed.byteLength > MAX_IMAGE_UPLOAD_BYTES) {
      return null;
    }

    const extension = resolveImageExtensionByMime(parsed.mimeType);
    if (!extension) {
      return null;
    }

    const fileName = `${Date.now().toString(36)}-${randomUUID().replace(/-/g, '').slice(0, 10)}${extension}`;

    try {
      await this.assetStorage.putObject({
        roomId: room.id,
        fileName,
        buffer: parsed.buffer,
        contentType: parsed.mimeType,
      });
    } catch {
      return null;
    }

    return `${UPLOAD_URL_PREFIX}/${room.id}/${fileName}`;
  }

  private async removeRoomUploads(roomId: string | undefined): Promise<void> {
    if (!roomId) {
      return;
    }
    try {
      await this.assetStorage.deleteRoom(roomId);
    } catch {
      // 忽略清理失败，避免影响房间关闭流程
    }
  }

  private async cleanupUploadUrls(room: Room, uploadUrls: Iterable<string>): Promise<void> {
    const candidates = new Set<string>();
    for (const uploadUrl of uploadUrls) {
      const normalized = this.normalizeManagedUploadUrlForRoom(uploadUrl, room.id);
      if (normalized) {
        candidates.add(normalized);
      }
    }

    for (const uploadUrl of candidates) {
      if (this.isManagedUploadUrlStillReferenced(room, uploadUrl)) {
        continue;
      }
      await this.removeManagedUploadByUrl(uploadUrl);
    }
  }

  private isManagedUploadUrlStillReferenced(room: Room, normalizedUploadUrl: string): boolean {
    for (const participant of room.participants.values()) {
      if (!participant.works) {
        continue;
      }
      for (const submission of Object.values(participant.works)) {
        const normalized = this.normalizeManagedUploadUrlForRoom(submission?.url, room.id);
        if (normalized === normalizedUploadUrl) {
          return true;
        }
      }
    }
    return false;
  }

  private collectManagedUploadUrlsFromParticipantWorks(
    works: ParticipantWorks | undefined,
    roomId: string,
  ): string[] {
    if (!works) {
      return [];
    }
    const uploadUrls: string[] = [];
    for (const submission of Object.values(works)) {
      const normalized = this.normalizeManagedUploadUrlForRoom(submission?.url, roomId);
      if (normalized) {
        uploadUrls.push(normalized);
      }
    }
    return uploadUrls;
  }

  private normalizeManagedUploadUrlForRoom(uploadUrl: string | undefined, roomId: string): string | null {
    if (typeof uploadUrl !== 'string') {
      return null;
    }
    const normalized = sanitizeManagedUploadUrl(uploadUrl);
    if (!normalized) {
      return null;
    }
    const prefix = `${UPLOAD_URL_PREFIX}/${roomId}/`;
    if (!normalized.startsWith(prefix)) {
      return null;
    }
    return normalized;
  }

  private async removeManagedUploadByUrl(uploadUrl: string): Promise<void> {
    const normalized = normalizeManagedUploadPath(uploadUrl);
    if (!normalized) {
      return;
    }
    const segments = normalized.slice(`${UPLOAD_URL_PREFIX}/`.length).split('/');
    if (segments.length !== 2) {
      return;
    }
    const [roomId, fileName] = segments;
    if (!roomId || !fileName) {
      return;
    }

    try {
      await this.assetStorage.deleteObject(roomId, fileName);
    } catch {
      // 忽略删除失败，避免影响主流程
    }
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
      sessionId: me.sessionId,
      ticket: me.ticket,
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
      works: cloneParticipantWorks(participant.works),
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

function sanitizeParticipantLimit(value: unknown): number | null {
  if (value == null) {
    return DEFAULT_PARTICIPANTS_PER_ROOM;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(value);
  if (normalized < ROOM_PARTICIPANT_LIMIT_MIN || normalized > ROOM_PARTICIPANT_LIMIT_MAX) {
    return null;
  }
  return normalized;
}

function getParticipantAudienceCount(room: Room): number {
  let count = 0;
  for (const participant of room.participants.values()) {
    if (participant.role === 'participant') {
      count += 1;
    }
  }
  return count;
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
  if (value === 'canvas' || value === 'showcase') {
    return value;
  }
  return null;
}

function sanitizePageTheme(value: unknown): MeetingPageTheme | null {
  if (value === 1 || value === 3) {
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

    if (kind === 'canvas' && theme !== 1) {
      return null;
    }
    if (kind === 'showcase' && theme !== 3) {
      return null;
    }

    seenIds.add(id);
    if (kind === 'showcase') {
      const submissionMode = sanitizePageSubmissionMode(rawPage.submissionMode);
      const rankingEnabled = sanitizePageRankingEnabled(rawPage.rankingEnabled);
      if (!submissionMode || rankingEnabled == null) {
        return null;
      }
      pages.push({
        id,
        kind,
        theme,
        title,
        submissionMode,
        rankingEnabled,
      });
      continue;
    }
    pages.push({
      id,
      kind,
      theme,
      title,
    });
  }

  return pages;
}

function sanitizePageSubmissionMode(value: unknown): PageSubmissionMode | null {
  if (value == null) {
    return 'url';
  }
  if (value === 'url' || value === 'image') {
    return value;
  }
  return null;
}

function sanitizePageRankingEnabled(value: unknown): boolean | null {
  if (value == null) {
    return true;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

function normalizeTicket(ticket: string): string {
  if (typeof ticket !== 'string') {
    return '';
  }
  return ticket.trim().toUpperCase();
}

function sanitizeHttpWorkUrl(input: string): string {
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

function sanitizeImageWorkUrl(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return '';
  }

  if (isBase64ImageDataUrl(trimmed)) {
    return trimmed;
  }

  const managedUpload = sanitizeManagedUploadUrl(trimmed);
  if (managedUpload) {
    return managedUpload;
  }

  const normalizedHttpUrl = sanitizeHttpWorkUrl(trimmed);
  if (normalizedHttpUrl && hasKnownImageExtension(normalizedHttpUrl)) {
    return normalizedHttpUrl;
  }

  return '';
}

function isBase64ImageDataUrl(value: string): boolean {
  return /^data:image\/[a-zA-Z0-9.+-]+;base64,[a-zA-Z0-9+/=\s]+$/.test(value);
}

function sanitizeManagedUploadUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith(`${UPLOAD_URL_PREFIX}/`)) {
    return normalizeManagedUploadPath(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    return normalizeManagedUploadPath(parsed.pathname);
  } catch {
    return '';
  }
}

function normalizeManagedUploadPath(pathValue: string): string {
  const normalized = path.posix.normalize(pathValue);
  const prefix = `${UPLOAD_URL_PREFIX}/`;
  if (!normalized.startsWith(prefix)) {
    return '';
  }

  const tail = normalized.slice(prefix.length);
  const segments = tail.split('/');
  if (segments.length !== 2) {
    return '';
  }

  const [roomId, fileName] = segments;
  if (!isSafePathSegment(roomId) || !isSafePathSegment(fileName) || !hasKnownImageExtension(fileName)) {
    return '';
  }

  return `${UPLOAD_URL_PREFIX}/${roomId}/${fileName}`;
}

function isSafePathSegment(value: string): boolean {
  return /^[a-zA-Z0-9._-]+$/.test(value);
}

function hasKnownImageExtension(value: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(value);
}

function parseBase64ImageDataUrl(input: string): { mimeType: string; buffer: Buffer; byteLength: number } | null {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_IMAGE_DATA_URL_LENGTH) {
    return null;
  }

  const matched = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([a-zA-Z0-9+/=\s]+)$/.exec(trimmed);
  if (!matched) {
    return null;
  }

  const mimeType = matched[1].toLowerCase();
  const rawBase64 = matched[2].replace(/\s+/g, '');
  if (!rawBase64) {
    return null;
  }

  try {
    const buffer = Buffer.from(rawBase64, 'base64');
    if (buffer.length === 0) {
      return null;
    }
    return {
      mimeType,
      buffer,
      byteLength: buffer.length,
    };
  } catch {
    return null;
  }
}

function resolveImageExtensionByMime(mimeType: string): string | null {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return '.jpg';
  }
  if (mimeType === 'image/png') {
    return '.png';
  }
  if (mimeType === 'image/webp') {
    return '.webp';
  }
  if (mimeType === 'image/gif') {
    return '.gif';
  }
  if (mimeType === 'image/svg+xml') {
    return '.svg';
  }
  if (mimeType === 'image/avif') {
    return '.avif';
  }
  if (mimeType === 'image/bmp') {
    return '.bmp';
  }
  return null;
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

function isValidSubmissionForMode(
  submission: ParticipantWorks[string] | undefined,
  mode: PageSubmissionMode,
): boolean {
  if (!submission) {
    return false;
  }
  const validDescription = sanitizeWorkDescription(submission.description);
  if (!validDescription) {
    return false;
  }
  const validUrl = mode === 'image' ? sanitizeImageWorkUrl(submission.url) : sanitizeHttpWorkUrl(submission.url);
  if (!validUrl) {
    return false;
  }
  return typeof submission.updatedAt === 'number' && Number.isFinite(submission.updatedAt);
}

function cloneParticipantWorks(works: ParticipantWorks | undefined): ParticipantWorks | undefined {
  if (!works) {
    return undefined;
  }

  const entries = Object.entries(works);
  if (entries.length === 0) {
    return undefined;
  }

  const cloned: ParticipantWorks = {};
  for (const [pageId, submission] of entries) {
    if (!pageId || !submission) {
      continue;
    }
    cloned[pageId] = {
      url: submission.url,
      description: submission.description,
      updatedAt: submission.updatedAt,
    };
  }

  return Object.keys(cloned).length > 0 ? cloned : undefined;
}
