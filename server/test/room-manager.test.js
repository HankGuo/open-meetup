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
    { id: 'page-intro-a', theme: 2, kind: 'selfIntro', title: '名牌广场 1' },
    { id: 'page-canvas-b', theme: 1, kind: 'canvas', title: '自由画布 2' },
    { id: 'page-canvas-c', theme: 1, kind: 'canvas', title: '自由画布 3' },
    { id: 'page-showcase-a', theme: 3, kind: 'showcase', title: '作品陈列 1' },
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

  const secondJoin = manager.joinRoom('', 'socket-b', undefined, ticket);
  assert.equal(secondJoin.success, true);
  assert.equal(secondJoin.data.userId, firstUserId);

  const room = manager.getActiveRoom();
  assert.ok(room);
  assert.equal(room.participants.size, 2);
});

test('invalid ticket should be rejected', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);

  const result = manager.joinRoom('', 'socket-p', undefined, 'TKT-NOT-EXIST');
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

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = manager.submitWork(participantIdentity, 'https://example.com/work', '我的 demo 作品');
  assert.equal(submit.success, true);
  assert.equal(submit.data.workUrl, 'https://example.com/work');
  assert.equal(submit.data.workDescription, '我的 demo 作品');
  assert.ok(typeof submit.data.workUpdatedAt === 'number');

  const snapshot = manager.getPublicRoomSnapshot();
  assert.equal(snapshot.success, true);

  const alice = snapshot.data.participants.find((participant) => participant.userId === join.data.userId);
  assert.ok(alice);
  assert.equal(alice.workUrl, 'https://example.com/work');
  assert.equal(alice.workDescription, '我的 demo 作品');
});

test('host cannot submit work as participant', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  const hostIdentity = getHostIdentity(created);

  const submit = manager.submitWork(hostIdentity, 'https://example.com/work', 'host try');
  assert.equal(submit.success, false);
  assert.equal(submit.error.code, 'NOT_AUTHORIZED');
});

test('submit work should reject non-http urls', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = manager.submitWork(participantIdentity, 'javascript:alert(1)', 'bad');
  assert.equal(submit.success, false);
  assert.equal(submit.error.code, 'BAD_REQUEST');
});
