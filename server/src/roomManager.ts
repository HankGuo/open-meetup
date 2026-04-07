import { randomUUID } from 'crypto';
import {
  ErrorResponse,
  MeetingStatus,
  MeetingPageDefinition,
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
import {
  DISCONNECT_GRACE_MS,
  HOST_PASSWORD,
  ROOM_PARTICIPANT_LIMIT_MAX,
  ROOM_PARTICIPANT_LIMIT_MIN,
} from './config';
import { MemoryStore, RoomStore } from './store';
import { createDefaultMeetingPages, MAX_MEETING_PAGES } from './meetingConfig';
import { AssetStorage, createAssetStorage } from './assetStorage';
import {
  getParticipantAudienceCount,
  normalizeTicket,
  sanitizeHttpWorkUrl,
  sanitizeLayoutTemplateInput,
  sanitizePageId,
  sanitizePagesInput,
  sanitizeParticipantLimit,
  sanitizeTitle,
  sanitizeUserName,
  sanitizeWorkDescription,
} from './roomManager.validation';
import { buildPublicRoomSnapshot, toPublicParticipant, toRoomStateSync } from './roomManager.state';
import {
  applyPagesConfiguration,
  cleanupUploadUrls,
  collectManagedUploadUrlsFromParticipantWorks,
  normalizeManagedUploadUrlForRoom,
  persistImageUpload,
  removeRoomUploads,
} from './roomManager.uploads';

const PARTICIPANT_TICKET_PREFIX = 'TKT-';
const PARTICIPANT_TICKET_RANDOM_LENGTH = 12;
const HOST_TICKET_RANDOM_LENGTH = 12;
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
      data: toRoomStateSync(activeRoom, host),
    };
  }

  joinRoom(userNameInput: string, socketId: string, ticket?: string): SocketResult<RoomStateSync> {
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
        data: toRoomStateSync(room, participant),
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
      data: toRoomStateSync(room, participant),
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
      data: toRoomStateSync(room, participant),
    };
  }

  async leaveRoom(identity: SocketIdentity): Promise<LeaveResult> {
    const auth = this.authorize(identity);
    if (!auth) {
      return { ok: false, error: this.error('Not authenticated', 'NOT_AUTHENTICATED') };
    }

    const { room, participant } = auth;
    const now = Date.now();
    const removedUploadUrls = collectManagedUploadUrlsFromParticipantWorks(participant.works, room.id);

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

    await cleanupUploadUrls(this.assetStorage, room, removedUploadUrls);
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
      data: buildPublicRoomSnapshot(auth.room),
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
      data: buildPublicRoomSnapshot(auth.room),
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
      data: buildPublicRoomSnapshot(auth.room),
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
      data: buildPublicRoomSnapshot(auth.room),
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
      data: toRoomStateSync(auth.room, auth.participant),
    };
  }

  async updatePages(
    identity: SocketIdentity,
    pagesInput: MeetingPageDefinition[],
  ): Promise<SocketResult<RoomStateSync>> {
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

    await applyPagesConfiguration(this.assetStorage, auth.room, normalizedPages);

    auth.room.updatedAt = Date.now();
    this.store.saveRoom(auth.room);

    return {
      success: true,
      data: toRoomStateSync(auth.room, auth.participant),
    };
  }

  async importLayoutTemplate(
    identity: SocketIdentity,
    templateInput: unknown,
  ): Promise<SocketResult<RoomStateSync>> {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'host') {
      return this.fail('Only host can perform this action', 'NOT_AUTHORIZED');
    }
    if (auth.room.phase !== 'setup') {
      return this.fail('播放阶段不允许导入编排模板', 'BAD_REQUEST');
    }

    const normalizedTemplate = sanitizeLayoutTemplateInput(templateInput);
    if (!normalizedTemplate) {
      return this.fail('编排模板格式不合法', 'BAD_REQUEST');
    }

    await applyPagesConfiguration(this.assetStorage, auth.room, normalizedTemplate.pages);

    auth.room.pageContents = normalizedTemplate.pageContents;
    auth.room.updatedAt = Date.now();
    this.store.saveRoom(auth.room);

    return {
      success: true,
      data: toRoomStateSync(auth.room, auth.participant),
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
        ? normalizeManagedUploadUrlForRoom(workUrlInput, auth.room.id)
        : sanitizeHttpWorkUrl(workUrlInput);
    if (!workUrl) {
      return this.fail(
        submissionMode === 'image' ? '请先上传图片后再提交' : '请填写有效的 http/https 作品链接',
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
      await cleanupUploadUrls(this.assetStorage, auth.room, [previousSubmission.url]);
    }
    auth.room.updatedAt = now;
    this.store.saveRoom(auth.room);

    return {
      success: true,
      data: toRoomStateSync(auth.room, auth.participant),
    };
  }

  async uploadImageByTicket(
    ticketInput: string,
    mimeTypeInput: string,
    bufferInput: Buffer,
    pageIdInput: string,
  ): Promise<SocketResult<{ url: string }>> {
    const room = this.getActiveRoom();
    if (!room) {
      return this.fail('Room not found', 'ROOM_NOT_FOUND');
    }
    if (room.status !== 'active') {
      return this.fail('Room is not active', 'ROOM_NOT_ACTIVE');
    }
    if (room.phase !== 'live') {
      return this.fail('仅播放阶段允许上传互动内容', 'BAD_REQUEST');
    }

    const ticket = normalizeTicket(ticketInput);
    if (!ticket) {
      return this.fail('Invalid ticket', 'INVALID_TICKET');
    }

    const participant = this.findParticipantByTicket(room, ticket);
    if (!participant) {
      return this.fail('Invalid ticket', 'INVALID_TICKET');
    }
    if (participant.role !== 'participant') {
      return this.fail('Only participant can upload image', 'NOT_AUTHORIZED');
    }

    const pageId = sanitizePageId(pageIdInput);
    if (!pageId) {
      return this.fail('页面 ID 无效', 'BAD_REQUEST');
    }

    const targetPage = room.pages.find((page) => page.id === pageId);
    if (!targetPage || targetPage.kind !== 'showcase' || (targetPage.submissionMode ?? 'url') !== 'image') {
      return this.fail('当前页面未开启图片提交', 'BAD_REQUEST');
    }
    const currentPageId = room.pages[room.currentStep]?.id ?? '';
    if (currentPageId !== targetPage.id) {
      return this.fail('仅当前互动页允许上传图片', 'BAD_REQUEST');
    }

    const uploadUrl = await persistImageUpload(this.assetStorage, room, mimeTypeInput, bufferInput);
    if (!uploadUrl) {
      return this.fail('请上传有效图片后再提交', 'BAD_REQUEST');
    }

    return {
      success: true,
      data: { url: uploadUrl },
    };
  }

  async revertUpload(
    identity: SocketIdentity,
    uploadUrlInput: string,
  ): Promise<SocketResult<{ reverted: boolean }>> {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    if (auth.participant.role !== 'participant') {
      return this.fail('Only participant can revert upload', 'NOT_AUTHORIZED');
    }
    if (auth.room.status !== 'active') {
      return this.fail('Room is not active', 'ROOM_NOT_ACTIVE');
    }

    const uploadUrl = normalizeManagedUploadUrlForRoom(uploadUrlInput, auth.room.id);
    if (!uploadUrl) {
      return this.fail('上传地址无效', 'BAD_REQUEST');
    }

    await cleanupUploadUrls(this.assetStorage, auth.room, [uploadUrl]);
    auth.room.updatedAt = Date.now();
    this.store.saveRoom(auth.room);

    return {
      success: true,
      data: { reverted: true },
    };
  }

  getStateByIdentity(identity: SocketIdentity): SocketResult<RoomStateSync> {
    const auth = this.authorize(identity);
    if (!auth) {
      return this.fail('Not authenticated', 'NOT_AUTHENTICATED');
    }
    return {
      success: true,
      data: toRoomStateSync(auth.room, auth.participant),
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
      removedParticipants.push(toPublicParticipant(participant));
      for (const uploadUrl of collectManagedUploadUrlsFromParticipantWorks(participant.works, room.id)) {
        removedUploadUrls.add(uploadUrl);
      }
      room.participants.delete(participant.userId);
    }

    if (offlineUsers.length > 0) {
      await cleanupUploadUrls(this.assetStorage, room, removedUploadUrls);
      room.updatedAt = now;
      this.store.saveRoom(room);
    }

    const hostAlive = room.participants.has(room.hostId);
    if (!hostAlive) {
      closedRooms.push({ reason: 'HOST_TIMEOUT' });
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
      data: buildPublicRoomSnapshot(room),
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

  isSocketIdentityAuthorized(socketId: string, identity: SocketIdentity | null | undefined): boolean {
    return this.authorizeBySocket(socketId, identity) != null;
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

  private authorizeBySocket(
    socketId: string,
    identity: SocketIdentity | null | undefined,
  ): AuthContext | null {
    if (!socketId || !identity) {
      return null;
    }

    const mappedIdentity = this.socketToIdentity.get(socketId);
    if (!mappedIdentity) {
      return null;
    }
    if (mappedIdentity.userId !== identity.userId || mappedIdentity.sessionId !== identity.sessionId) {
      return null;
    }

    const auth = this.authorize(identity);
    if (!auth) {
      return null;
    }
    if (auth.participant.socketId !== socketId || !auth.participant.online) {
      return null;
    }
    return auth;
  }

  private async closeRoom(): Promise<void> {
    const room = this.getActiveRoom();
    for (const [socketId, id] of this.socketToIdentity.entries()) {
      if (room?.participants.has(id.userId)) {
        this.socketToIdentity.delete(socketId);
      }
    }
    await removeRoomUploads(this.assetStorage, room?.id);
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
        PARTICIPANT_TICKET_PREFIX +
        randomUUID().replace(/-/g, '').slice(0, PARTICIPANT_TICKET_RANDOM_LENGTH).toUpperCase();
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
