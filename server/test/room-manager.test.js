const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { RoomManager } = require('../dist/roomManager.js');
const { MemoryStore } = require('../dist/store.js');

const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads');
const IMAGE_MIME_TYPE = 'image/png';
const FIRST_IMAGE_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2pT5QAAAAASUVORK5CYII=',
  'base64',
);
const SECOND_IMAGE_BUFFER = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAQAAADZc7J/AAAADElEQVR42mP8z8BQDwAFgwJ/lHpmsQAAAABJRU5ErkJggg==',
  'base64',
);

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
    {
      id: 'page-showcase-image-a',
      theme: 3,
      kind: 'showcase',
      title: '图片陈列 1',
      submissionMode: 'image',
      rankingEnabled: true,
    },
    { id: 'page-canvas-b', theme: 1, kind: 'canvas', title: '自由画布 2' },
    { id: 'page-canvas-c', theme: 1, kind: 'canvas', title: '自由画布 3' },
    {
      id: 'page-showcase-url-a',
      theme: 3,
      kind: 'showcase',
      title: '链接陈列 1',
      submissionMode: 'url',
      rankingEnabled: false,
    },
    { id: 'page-canvas-d', theme: 1, kind: 'canvas', title: '自由画布 4' },
  ];
}

async function seedPages(manager, hostIdentity, pages = createPagesForSetup()) {
  const result = await manager.updatePages(hostIdentity, pages);
  assert.equal(result.success, true);
  return pages;
}

async function uploadImageAndGetUrl(manager, ticket, buffer = FIRST_IMAGE_BUFFER) {
  const upload = await manager.uploadImageByTicket(ticket, IMAGE_MIME_TYPE, buffer);
  assert.equal(upload.success, true);
  assert.ok(upload.data.url.startsWith('/uploads/'));
  return upload.data.url;
}

test('new room should start with no preconfigured pages', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  assert.equal(created.data.pages.length, 0);
});

test('host can configure participant limit when creating room', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host', 1);
  assert.equal(created.success, true);

  const firstJoin = manager.joinRoom('Alice', 'socket-a');
  assert.equal(firstJoin.success, true);

  const secondJoin = manager.joinRoom('Bob', 'socket-b');
  assert.equal(secondJoin.success, false);
  assert.equal(secondJoin.error.code, 'ROOM_FULL');
});

test('nextStep should be capped at max page index', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  const hostIdentity = getHostIdentity(created);
  await seedPages(manager, hostIdentity);
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

test('setup phase allows editing pages but live phase blocks editing', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity, [createPagesForSetup()[0]]);
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

test('host can reorder pages during setup and content follows page id', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity, createPagesForSetup().slice(0, 3));
  const [firstPage, secondPage] = pages;
  assert.ok(firstPage && secondPage);

  const contentWrite = manager.updatePageContent(hostIdentity, firstPage.id, {
    type: 'markdown',
    content: 'content-1',
  });
  assert.equal(contentWrite.success, true);

  const reordered = [secondPage, firstPage, ...pages.slice(2)];
  const updatePages = await manager.updatePages(hostIdentity, reordered);
  assert.equal(updatePages.success, true);

  const pageContents = new Map(updatePages.data.pageContents || []);
  assert.equal(pageContents.get(firstPage.id)?.content, 'content-1');
});

test('host can return from live to setup and keep current page index', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  await seedPages(manager, hostIdentity);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  manager.nextStep(hostIdentity);
  manager.nextStep(hostIdentity);

  const returned = manager.returnToSetup(hostIdentity);
  assert.equal(returned.success, true);
  assert.equal(returned.data.phase, 'setup');
  assert.equal(returned.data.currentStep, 2);
});

test('forceEndRoom should close room immediately and prevent host handover', async () => {
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

  const ended = await manager.forceEndRoom(hostIdentity);
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

test('setup phase should allow removing all pages', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  await seedPages(manager, hostIdentity, [createPagesForSetup()[0]]);

  const removed = await manager.updatePages(hostIdentity, []);
  assert.equal(removed.success, true);
  assert.equal(removed.data.pages.length, 0);
});

test('host can import layout template in setup phase', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  await seedPages(manager, hostIdentity, createPagesForSetup().slice(0, 2));

  const importedTemplate = {
    version: 1,
    pages: [
      {
        id: 'import-canvas-1',
        theme: 1,
        kind: 'canvas',
        title: '导入自由画布',
      },
      {
        id: 'import-showcase-1',
        theme: 3,
        kind: 'showcase',
        title: '导入互动页',
        submissionMode: 'url',
        rankingEnabled: true,
      },
    ],
    pageContents: [['import-canvas-1', { type: 'markdown', content: '# imported' }]],
  };

  const imported = await manager.importLayoutTemplate(hostIdentity, importedTemplate);
  assert.equal(imported.success, true);

  const state = manager.getStateByIdentity(hostIdentity);
  assert.equal(state.success, true);
  assert.deepEqual(
    state.data.pages.map((page) => page.id),
    ['import-canvas-1', 'import-showcase-1'],
  );
  const contentMap = new Map(state.data.pageContents || []);
  assert.equal(contentMap.get('import-canvas-1')?.content, '# imported');
});

test('import layout template should be blocked during live phase', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  await seedPages(manager, hostIdentity, [createPagesForSetup()[0]]);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const imported = await manager.importLayoutTemplate(hostIdentity, {
    version: 1,
    pages: [{ id: 'import-canvas-1', theme: 1, kind: 'canvas', title: '导入页' }],
    pageContents: [],
  });
  assert.equal(imported.success, false);
  assert.equal(imported.error.code, 'BAD_REQUEST');
});

test('import layout template should reject invalid page content reference', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  await seedPages(manager, hostIdentity, [createPagesForSetup()[0]]);

  const imported = await manager.importLayoutTemplate(hostIdentity, {
    version: 1,
    pages: [{ id: 'import-canvas-1', theme: 1, kind: 'canvas', title: '导入页' }],
    pageContents: [['unknown-page', { type: 'markdown', content: '# bad' }]],
  });
  assert.equal(imported.success, false);
  assert.equal(imported.error.code, 'BAD_REQUEST');
});

test('ticket join should restore existing participant instead of creating duplicate', async () => {
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

  const snapshot = manager.getPublicRoomSnapshot();
  assert.equal(snapshot.success, true);
  const allParticipantsWithoutTicket = snapshot.data.participants.every(
    (participant) => !('ticket' in participant),
  );
  assert.equal(allParticipantsWithoutTicket, true);
});

test('host ticket should restore host identity', async () => {
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

test('invalid ticket should be rejected', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);

  const result = manager.joinRoom('', 'socket-p', 'TKT-NOT-EXIST');
  assert.equal(result.success, false);
  assert.equal(result.error.code, 'INVALID_TICKET');
});

test('checkTicket should only return valid flag for host and participant tickets', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostTicket = created.data.ticket;
  assert.ok(hostTicket);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);
  const participantTicket = join.data.ticket;
  assert.ok(participantTicket);

  const hostCheck = manager.checkTicket(hostTicket);
  assert.deepEqual(hostCheck, { valid: true });

  const participantCheck = manager.checkTicket(participantTicket);
  assert.deepEqual(participantCheck, { valid: true });

  const invalidCheck = manager.checkTicket('TKT-NOT-EXISTS');
  assert.deepEqual(invalidCheck, { valid: false });
});

test('uploadImageByTicket should be blocked during setup phase', async () => {
  safeCleanupUploadRoot();

  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const upload = await manager.uploadImageByTicket(join.data.ticket, IMAGE_MIME_TYPE, FIRST_IMAGE_BUFFER);
  assert.equal(upload.success, false);
  assert.equal(upload.error.code, 'BAD_REQUEST');

  safeCleanupUploadRoot();
});

test('uploadImageByTicket should reject host ticket and allow participant ticket in live phase', async () => {
  safeCleanupUploadRoot();

  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  await seedPages(manager, hostIdentity);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const hostUpload = await manager.uploadImageByTicket(
    created.data.ticket,
    IMAGE_MIME_TYPE,
    FIRST_IMAGE_BUFFER,
  );
  assert.equal(hostUpload.success, false);
  assert.equal(hostUpload.error.code, 'NOT_AUTHORIZED');

  const participantUpload = await manager.uploadImageByTicket(
    join.data.ticket,
    IMAGE_MIME_TYPE,
    FIRST_IMAGE_BUFFER,
  );
  assert.equal(participantUpload.success, true);
  assert.equal(participantUpload.data.url.startsWith('/uploads/'), true);

  const room = manager.getActiveRoom();
  assert.ok(room);
  const storedPath = path.resolve(__dirname, '..', participantUpload.data.url.slice(1));
  assert.equal(fs.existsSync(storedPath), true);

  const ended = await manager.forceEndRoom(hostIdentity);
  assert.equal(ended.success, true);
  assert.equal(fs.existsSync(storedPath), false);

  safeCleanupUploadRoot();
});

test('isIdentityAuthorized should respect session match and room lifecycle', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);

  assert.equal(manager.isIdentityAuthorized(hostIdentity), true);
  assert.equal(
    manager.isIdentityAuthorized({
      userId: hostIdentity.userId,
      sessionId: 'wrong-session',
    }),
    false,
  );

  const ended = await manager.forceEndRoom(hostIdentity);
  assert.equal(ended.success, true);
  assert.equal(manager.isIdentityAuthorized(hostIdentity), false);
});

test('cleanupExpired should report removed offline participants', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);
  manager.onSocketDisconnected('socket-a');

  const now = Date.now() + manager.getDisconnectGraceMs() + 1;
  const cleanup = await manager.cleanupExpired(now);

  assert.equal(cleanup.closedRooms.length, 0);
  assert.equal(cleanup.removedParticipants.length, 1);
  assert.equal(cleanup.removedParticipants[0].userName, 'Alice');
});

test('participant can submit work and persist url/description fields', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const urlShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'url');
  assert.ok(urlShowcasePage);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = await manager.submitWork(
    participantIdentity,
    urlShowcasePage.id,
    'https://example.com/work',
    '我的 demo 作品',
  );
  assert.equal(submit.success, true);

  const snapshot = manager.getPublicRoomSnapshot();
  assert.equal(snapshot.success, true);

  const alice = snapshot.data.participants.find((participant) => participant.userId === join.data.userId);
  assert.ok(alice);
  assert.equal(alice.works[urlShowcasePage.id].url, 'https://example.com/work');
  assert.equal(alice.works[urlShowcasePage.id].description, '我的 demo 作品');
  assert.ok(typeof alice.works[urlShowcasePage.id].updatedAt === 'number');
});

test('host cannot submit work as participant', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  const hostIdentity = getHostIdentity(created);

  const submit = await manager.submitWork(
    hostIdentity,
    'page-showcase-url-a',
    'https://example.com/work',
    'host try',
  );
  assert.equal(submit.success, false);
  assert.equal(submit.error.code, 'NOT_AUTHORIZED');
});

test('submit work should be blocked during setup phase', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const urlShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'url');
  assert.ok(urlShowcasePage);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);
  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = await manager.submitWork(
    participantIdentity,
    urlShowcasePage.id,
    'https://example.com/work',
    'setup 提交',
  );
  assert.equal(submit.success, false);
  assert.equal(submit.error.code, 'BAD_REQUEST');
});

test('submit work should reject non-http urls on url-mode page', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const urlShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'url');
  assert.ok(urlShowcasePage);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = await manager.submitWork(
    participantIdentity,
    urlShowcasePage.id,
    'javascript:alert(1)',
    'bad',
  );
  assert.equal(submit.success, false);
  assert.equal(submit.error.code, 'BAD_REQUEST');
});

test('submit work should reject non-image payload on image-mode page', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const imageShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'image');
  assert.ok(imageShowcasePage);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = await manager.submitWork(
    participantIdentity,
    imageShowcasePage.id,
    'https://example.com/not-image',
    'bad',
  );
  assert.equal(submit.success, false);
  assert.equal(submit.error.code, 'BAD_REQUEST');
});

test('submissions should be isolated by showcase page id', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const imageShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'image');
  const urlShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'url');
  assert.ok(imageShowcasePage);
  assert.ok(urlShowcasePage);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submitUrl = await manager.submitWork(
    participantIdentity,
    urlShowcasePage.id,
    'https://example.com/work-a',
    'URL 作品',
  );
  assert.equal(submitUrl.success, true);
  const submitImage = await manager.submitWork(
    participantIdentity,
    imageShowcasePage.id,
    await uploadImageAndGetUrl(manager, join.data.ticket),
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

test('image submission should be persisted as upload url and cleaned after room close', async () => {
  safeCleanupUploadRoot();

  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const imageShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'image');
  assert.ok(imageShowcasePage);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);

  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = await manager.submitWork(
    participantIdentity,
    imageShowcasePage.id,
    await uploadImageAndGetUrl(manager, join.data.ticket),
    '图片作品',
  );
  assert.equal(submit.success, true);

  const storedUrl = submit.data.participants.find((participant) => participant.userId === join.data.userId)
    .works[imageShowcasePage.id].url;
  assert.equal(storedUrl.startsWith('/uploads/'), true);
  assert.equal(storedUrl.startsWith('data:image/'), false);

  const storedPath = path.resolve(__dirname, '..', storedUrl.slice(1));
  assert.equal(fs.existsSync(storedPath), true);

  const ended = await manager.forceEndRoom(hostIdentity);
  assert.equal(ended.success, true);
  assert.equal(fs.existsSync(storedPath), false);

  safeCleanupUploadRoot();
});

test('replacing image submission should cleanup previous upload asset', async () => {
  safeCleanupUploadRoot();

  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const imageShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'image');
  assert.ok(imageShowcasePage);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);
  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const firstSubmit = await manager.submitWork(
    participantIdentity,
    imageShowcasePage.id,
    await uploadImageAndGetUrl(manager, join.data.ticket),
    '第一版',
  );
  assert.equal(firstSubmit.success, true);
  const firstStoredUrl = firstSubmit.data.participants.find(
    (participant) => participant.userId === join.data.userId,
  ).works[imageShowcasePage.id].url;
  const firstStoredPath = path.resolve(__dirname, '..', firstStoredUrl.slice(1));
  assert.equal(fs.existsSync(firstStoredPath), true);

  const secondSubmit = await manager.submitWork(
    participantIdentity,
    imageShowcasePage.id,
    await uploadImageAndGetUrl(manager, join.data.ticket, SECOND_IMAGE_BUFFER),
    '第二版',
  );
  assert.equal(secondSubmit.success, true);
  const secondStoredUrl = secondSubmit.data.participants.find(
    (participant) => participant.userId === join.data.userId,
  ).works[imageShowcasePage.id].url;
  const secondStoredPath = path.resolve(__dirname, '..', secondStoredUrl.slice(1));
  assert.equal(fs.existsSync(secondStoredPath), true);
  assert.equal(firstStoredPath === secondStoredPath, false);
  assert.equal(fs.existsSync(firstStoredPath), false);

  const ended = await manager.forceEndRoom(hostIdentity);
  assert.equal(ended.success, true);
  assert.equal(fs.existsSync(secondStoredPath), false);

  safeCleanupUploadRoot();
});

test('removing showcase page should cleanup removed image submissions', async () => {
  safeCleanupUploadRoot();

  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const imageShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'image');
  assert.ok(imageShowcasePage);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);
  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = await manager.submitWork(
    participantIdentity,
    imageShowcasePage.id,
    await uploadImageAndGetUrl(manager, join.data.ticket),
    '图片作品',
  );
  assert.equal(submit.success, true);
  const storedUrl = submit.data.participants.find((participant) => participant.userId === join.data.userId)
    .works[imageShowcasePage.id].url;
  const storedPath = path.resolve(__dirname, '..', storedUrl.slice(1));
  assert.equal(fs.existsSync(storedPath), true);

  const returned = manager.returnToSetup(hostIdentity);
  assert.equal(returned.success, true);
  const updatedPages = pages.filter((page) => page.id !== imageShowcasePage.id);
  const updated = await manager.updatePages(hostIdentity, updatedPages);
  assert.equal(updated.success, true);
  assert.equal(fs.existsSync(storedPath), false);

  safeCleanupUploadRoot();
});

test('participant leave should cleanup uploaded image assets', async () => {
  safeCleanupUploadRoot();

  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const imageShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'image');
  assert.ok(imageShowcasePage);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);
  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = await manager.submitWork(
    participantIdentity,
    imageShowcasePage.id,
    await uploadImageAndGetUrl(manager, join.data.ticket),
    '图片作品',
  );
  assert.equal(submit.success, true);
  const storedUrl = submit.data.participants.find((participant) => participant.userId === join.data.userId)
    .works[imageShowcasePage.id].url;
  const storedPath = path.resolve(__dirname, '..', storedUrl.slice(1));
  assert.equal(fs.existsSync(storedPath), true);

  const leave = await manager.leaveRoom(participantIdentity);
  assert.equal(leave.ok, true);
  assert.equal(fs.existsSync(storedPath), false);

  safeCleanupUploadRoot();
});

test('cleanupExpired should cleanup uploaded image assets for removed offline participants', async () => {
  safeCleanupUploadRoot();

  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const imageShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'image');
  assert.ok(imageShowcasePage);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);
  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = await manager.submitWork(
    participantIdentity,
    imageShowcasePage.id,
    await uploadImageAndGetUrl(manager, join.data.ticket),
    '图片作品',
  );
  assert.equal(submit.success, true);
  const storedUrl = submit.data.participants.find((participant) => participant.userId === join.data.userId)
    .works[imageShowcasePage.id].url;
  const storedPath = path.resolve(__dirname, '..', storedUrl.slice(1));
  assert.equal(fs.existsSync(storedPath), true);

  const disconnected = manager.onSocketDisconnected('socket-a');
  assert.equal(disconnected, true);

  const cleanup = await manager.cleanupExpired(Date.now() + manager.getDisconnectGraceMs() + 1);
  assert.equal(cleanup.removedParticipants.length, 1);
  assert.equal(fs.existsSync(storedPath), false);

  safeCleanupUploadRoot();
});

test('switching showcase mode from image to url should cleanup incompatible uploaded assets', async () => {
  safeCleanupUploadRoot();

  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', '12345678', 'socket-host');
  assert.equal(created.success, true);
  const hostIdentity = getHostIdentity(created);
  const pages = await seedPages(manager, hostIdentity);
  const imageShowcasePage = pages.find((page) => page.kind === 'showcase' && page.submissionMode === 'image');
  assert.ok(imageShowcasePage);
  const started = manager.startLive(hostIdentity);
  assert.equal(started.success, true);

  const join = manager.joinRoom('Alice', 'socket-a');
  assert.equal(join.success, true);
  const participantIdentity = {
    userId: join.data.userId,
    sessionId: join.data.sessionId,
  };

  const submit = await manager.submitWork(
    participantIdentity,
    imageShowcasePage.id,
    await uploadImageAndGetUrl(manager, join.data.ticket),
    '图片作品',
  );
  assert.equal(submit.success, true);
  const storedUrl = submit.data.participants.find((participant) => participant.userId === join.data.userId)
    .works[imageShowcasePage.id].url;
  const storedPath = path.resolve(__dirname, '..', storedUrl.slice(1));
  assert.equal(fs.existsSync(storedPath), true);

  const returned = manager.returnToSetup(hostIdentity);
  assert.equal(returned.success, true);

  const switchedPages = pages.map((page) => {
    if (page.id !== imageShowcasePage.id) {
      return page;
    }
    return {
      ...page,
      submissionMode: 'url',
    };
  });
  const updated = await manager.updatePages(hostIdentity, switchedPages);
  assert.equal(updated.success, true);
  assert.equal(fs.existsSync(storedPath), false);

  safeCleanupUploadRoot();
});

function safeCleanupUploadRoot() {
  try {
    fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true });
  } catch {
    // ignore cleanup failure
  }
}
