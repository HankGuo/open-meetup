const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomManager } = require('../dist/roomManager.js');
const { MemoryStore } = require('../dist/store.js');

function createManager() {
  return new RoomManager(new MemoryStore());
}

function getHostIdentity(createResult) {
  if (!createResult.success) {
    throw new Error(`createRoom failed: ${createResult.error.message}`);
  }
  return {
    userId: createResult.data.userId,
    sessionId: createResult.data.sessionId,
  };
}

function createPagesForSetup() {
  return [
    { id: 'page-canvas-a', theme: 1, kind: 'canvas', title: '自由画布 1' },
    { id: 'page-showcase-image-a', theme: 3, kind: 'showcase', title: '图片陈列 1', submissionMode: 'image', rankingEnabled: true },
    { id: 'page-canvas-b', theme: 1, kind: 'canvas', title: '自由画布 2' },
    { id: 'page-canvas-c', theme: 1, kind: 'canvas', title: '自由画布 3' },
    { id: 'page-showcase-url-a', theme: 3, kind: 'showcase', title: '链接陈列 1', submissionMode: 'url', rankingEnabled: false },
    { id: 'page-canvas-d', theme: 1, kind: 'canvas', title: '自由画布 4' },
  ];
}

function seedPages(manager, hostIdentity, pages = createPagesForSetup()) {
  const result = manager.updatePages(hostIdentity, pages);
  assert.equal(result.success, true);
  return pages;
}

test('new room should start with no preconfigured pages', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  assert.equal(created.data.pages.length, 0);
});

test('host can configure participant limit when creating room', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host', 1);
  assert.equal(created.success, true);

  const firstJoin = manager.joinRoom('Alice', 'socket-a');
  assert.equal(firstJoin.success, true);

  const secondJoin = manager.joinRoom('Bob', 'socket-b');
  assert.equal(secondJoin.success, false);
  assert.equal(secondJoin.error.code, 'ROOM_FULL');
});

test('nextStep should be capped at max page index', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  const hostIdentity = getHostIdentity(created);
  seedPages(manager, hostIdentity);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  for (let i = 0; i < 20; i += 1) {
    const stepResult = manager.nextStep(hostIdentity);
    assert.equal(stepResult.success, true);
  }

  const state = manager.getStateByIdentity(hostIdentity);
  assert.equal(state.success, true);
  assert.equal(state.data.currentStep, 5);
});

test('setup phase allows editing pages but live phase blocks editing', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = seedPages(manager, hostIdentity, [createPagesForSetup()[0]]);
  const pageId = pages[0].id;

  const setupEdit = manager.updatePageContent(hostIdentity, pageId, {
    type: 'markdown',
    content: '# setup edit',
  });
  assert.equal(setupEdit.success, true);

  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const liveEdit = manager.updatePageContent(hostIdentity, pageId, {
    type: 'markdown',
    content: '# live edit',
  });
  assert.equal(liveEdit.success, false);
  assert.equal(liveEdit.error.code, 'BAD_REQUEST');
});

test('host can reorder pages during setup and content follows page id', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = seedPages(manager, hostIdentity, createPagesForSetup().slice(0, 3));
  const [firstPage, secondPage] = pages;
  assert.ok(firstPage && secondPage);

  const contentWrite = manager.updatePageContent(hostIdentity, firstPage.id, {
    type: 'markdown',
    content: 'content-1',
  });
  assert.equal(contentWrite.success, true);

  const reordered = [secondPage, firstPage, ...pages.slice(2)];
  const updatePages = manager.updatePages(hostIdentity, reordered);
  assert.equal(updatePages.success, true);

  const pageContents = new Map(updatePages.data.pageContents || []);
  assert.equal(pageContents.get(firstPage.id)?.content, 'content-1');
});

test('host can return from live to setup and keep current page index', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  seedPages(manager, hostIdentity);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  manager.nextStep(hostIdentity);
  manager.nextStep(hostIdentity);

  const returned = manager.returnToSetup(hostIdentity);
  assert.equal(returned.success, true);
  assert.equal(returned.data.phase, 'setup');
  assert.equal(returned.data.currentStep, 2);
});

test('forceEndRoom should close room immediately and prevent host handover', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);
  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const ended = manager.forceEndRoom(hostIdentity);
  assert.equal(ended.success, true);
  assert.equal(ended.data.closed, true);
  assert.equal(manager.getActiveRoom(), null);

  const participantState = manager.getStateByIdentity(participantIdentity);
  assert.equal(participantState.success, false);
  assert.equal(participantState.error.code, 'NOT_AUTHENTICATED');

  const joinAfterEnd = manager.joinRoom('Bob', 'socket-b');
  assert.equal(joinAfterEnd.success, false);
  assert.equal(joinAfterEnd.error.code, 'ROOM_NOT_FOUND');
});

test('setup phase should allow removing all pages', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  seedPages(manager, hostIdentity, [createPagesForSetup()[0]]);

  const removed = manager.updatePages(hostIdentity, []);
  assert.equal(removed.success, true);
  assert.equal(removed.data.pages.length, 0);
});

test('ticket join should restore existing participant instead of creating duplicate', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);

  const firstJoin = manager.joinRoom('Alice', 'socket-a');
  assert.equal(firstJoin.success, true);
  const firstUserId = firstJoin.data.userId;
  const ticket = firstJoin.data.ticket;
  assert.ok(ticket);

  const disconnected = manager.onSocketDisconnected('socket-a');
  assert.ok(disconnected);

  const secondJoin = manager.joinRoom('', 'socket-b', ticket);
  assert.equal(secondJoin.success, true);
  assert.equal(secondJoin.data.userId, firstUserId);

  const room = manager.getActiveRoom();
  assert.ok(room);
  assert.equal(room.participants.size, 2);
});

test('host ticket should restore host identity', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);

  const hostIdentity = getHostIdentity(created);
  const hostTicket = created.data.ticket;
  assert.ok(hostTicket);
  assert.equal(hostTicket.startsWith('HOST-'), true);

  const disconnected = manager.onSocketDisconnected('socket-host');
  assert.ok(disconnected);

  const rejoined = manager.joinRoom('', 'socket-host-2', hostTicket);
  assert.equal(rejoined.success, true);
  assert.equal(rejoined.data.userId, hostIdentity.userId);
  assert.equal(rejoined.data.userRole, 'host');
});

test('invalid ticket should be rejected', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);

  const result = manager.joinRoom('', 'socket-p', 'TKT-NOT-EXIST');
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'INVALID_TICKET');
});

test('cleanupExpired should report removed offline participants', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);
  manager.onSocketDisconnected('socket-a');

  const now = Date.now() + manager.getDisconnectGraceMs() + 1;
  const cleanup = manager.cleanupExpired(now);

  assert.equal(cleanup.closedRooms.length, 0);
  assert.equal(cleanup.removedParticipants.length, 1);
  assert.equal(cleanup.removedParticipants[0].userName, 'Alice');
});

test('participant can submit work and persist url/description fields', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = seedPages(manager, hostIdentity);
  const urlShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'url');
  assert.ok(urlShowcasePage);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = manager.submitWork(participantIdentity, urlShowcasePage.id, 'https://example.com/work', '我的 demo 作品');
  assert.equal(submit.success, true);

  const snapshot = manager.getPublicRoomSnapshot();
  assert.equal(snapshot.success, true);

  const alice = snapshot.data.participants.find((participant) => participant.userId === join.data.userId);
  assert.ok(alice);
  assert.equal(alice.works[urlShowcasePage.id].url, 'https://example.com/work');
  assert.equal(alice.works[urlShowcasePage.id].description, '我的 demo 作品');
  assert.ok(typeof alice.works[urlShowcasePage.id].updatedAt === 'number');
});

test('host cannot submit work as participant', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  const hostIdentity = getHostIdentity(created);

  const submit = manager.submitWork(hostIdentity, 'page-showcase-url-a', 'https://example.com/work', 'host try');
  assert.equal(submit.success, false);
  assert.equal(submit.error.code, 'NOT_AUTHORIZED');
});

test('submit work should reject non-http urls on url-mode page', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = seedPages(manager, hostIdentity);
  const urlShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'url');
  assert.ok(urlShowcasePage);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = manager.submitWork(participantIdentity, urlShowcasePage.id, 'javascript:alert(1)', 'bad');
  assert.equal(submit.success, false);
  assert.equal(submit.error.code, 'BAD_REQUEST');
});

test('submit work should reject non-image payload on image-mode page', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = seedPages(manager, hostIdentity);
  const imageShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'image');
  assert.ok(imageShowcasePage);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = manager.submitWork(participantIdentity, imageShowcasePage.id, 'https://example.com/not-image', 'bad');
  assert.equal(submit.success, false);
  assert.equal(submit.error.code, 'BAD_REQUEST');
});

test('submissions should be isolated by showcase page id', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = seedPages(manager, hostIdentity);
  const imageShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'image');
  const urlShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'url');
  assert.ok(imageShowcasePage);
  assert.ok(urlShowcasePage);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submitUrl = manager.submitWork(participantIdentity, urlShowcasePage.id, 'https://example.com/work-a', 'URL 作品');
  assert.equal(submitUrl.success, true);
  const submitImage = manager.submitWork(
    participantIdentity,
    imageShowcasePage.id,
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2pT5QAAAAASUVORK5CYII=',
    '图片作品',
  );
  assert.equal(submitImage.success, true);

  const snapshot = manager.getPublicRoomSnapshot();
  assert.equal(snapshot.success, true);
  const alice = snapshot.data.participants.find((participant) => participant.userId === join.data.userId);
  assert.ok(alice);
  assert.equal(alice.works[urlShowcasePage.id].url, 'https://example.com/work-a');
  assert.equal(alice.works[urlShowcasePage.id].description, 'URL 作品');
  assert.equal(alice.works[imageShowcasePage.id].description, '图片作品');
});
