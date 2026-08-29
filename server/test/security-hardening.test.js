const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

// config 模块在加载时读取环境变量，必须在 require dist 之前设置
process.env.MAX_ROOM_ASSETS_BYTES = String(2 * 1024 * 1024);
process.env.HOST_PASSWORD = 'test-host-password';

const { RoomManager } = require('../dist/roomManager.js');
const { MemoryStore } = require('../dist/store.js');
const { LocalAssetStorage } = require('../dist/assetStorage.js');
const {
  isRateLimitedByWindow,
  checkPasswordAttemptAllowed,
  recordPasswordAttemptFailure,
  recordPasswordAttemptSuccess,
} = require('../dist/rateLimit.js');
const {
  sniffImageMimeFromBuffer,
  isPageContentSizeValid,
  isUserNameTaken,
} = require('../dist/roomManager.validation.js');
const { verifyHostPassword } = require('../dist/config.js');

const TMP_ROOT = path.resolve(__dirname, '__tmp-security__');

const HOST_PASSWORD = 'test-host-password';
// 带 PNG 魔数头的最小图片（1x1 PNG）
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2pT5QAAAAASUVORK5CYII=',
  'base64',
);
const SVG_BODY = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const FAKE_PNG = Buffer.from('this is definitely not a png but claims to be one');

function createManager() {
  const uploadRoot = path.join(TMP_ROOT, `sec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  return new RoomManager(new MemoryStore(), new LocalAssetStorage(uploadRoot));
}

function getHostIdentity(createResult) {
  assert.equal(createResult.success, true, `createRoom failed: ${createResult.error?.message}`);
  return {
    userId: createResult.data.userId,
    sessionId: createResult.data.sessionId,
  };
}

async function seedImageShowcaseLiveRoom(manager) {
  const created = manager.createRoom('Host', 'Sec Demo', HOST_PASSWORD, 'socket-host');
  const host = getHostIdentity(created);
  const pages = [
    {
      id: 'page-showcase-img',
      theme: 3,
      kind: 'showcase',
      title: '图片互动页',
      submissionMode: 'image',
      rankingEnabled: true,
    },
  ];
  const setup = await manager.updatePages(host, pages);
  assert.equal(setup.success, true);
  const live = manager.startLive(host);
  assert.equal(live.success, true);
  const joined = manager.joinRoom('Alice', 'socket-a');
  assert.equal(joined.success, true);
  return { host, participant: joined.data, pageId: pages[0].id };
}

// ---------------------------------------------------------------------------
// 口令
// ---------------------------------------------------------------------------

test('createRoom rejects wrong password and accepts correct password', () => {
  const manager = createManager();
  const wrong = manager.createRoom('Host', 'Demo', 'not-the-password', 'socket-1');
  assert.equal(wrong.success, false);
  assert.equal(wrong.error.code, 'INVALID_PASSWORD');

  const right = manager.createRoom('Host', 'Demo', HOST_PASSWORD, 'socket-1');
  assert.equal(right.success, true);
});

test('verifyHostPassword handles unicode without throwing', () => {
  assert.equal(verifyHostPassword('密码密码密码'), false);
  assert.equal(verifyHostPassword(HOST_PASSWORD), HOST_PASSWORD === 'test-host-password');
});

// ---------------------------------------------------------------------------
// 昵称
// ---------------------------------------------------------------------------

test('joinRoom rejects duplicate nickname (case-insensitive)', () => {
  const manager = createManager();
  manager.createRoom('Host', 'Demo', HOST_PASSWORD, 'socket-host');
  const first = manager.joinRoom('Alice', 'socket-a');
  assert.equal(first.success, true);

  const dup = manager.joinRoom('alice', 'socket-b');
  assert.equal(dup.success, false);
  assert.equal(dup.error.code, 'BAD_REQUEST');

  const other = manager.joinRoom('Bob', 'socket-b');
  assert.equal(other.success, true);
});

test('sanitizeUserName strips control characters', () => {
  const { sanitizeUserName } = require('../dist/roomManager.validation.js');
  assert.equal(sanitizeUserName('Al\u0000ice\n'), 'Alice');
  assert.equal(sanitizeUserName('  Bob\u007f '), 'Bob');
});

test('isUserNameTaken is case-insensitive and ignores missing names', () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', HOST_PASSWORD, 'socket-host');
  const room = manager.getActiveRoom();
  assert.equal(isUserNameTaken(room, 'HOST'), true);
  assert.equal(isUserNameTaken(room, 'nobody'), false);
  assert.equal(created.success, true);
});

// ---------------------------------------------------------------------------
// 页面内容校验
// ---------------------------------------------------------------------------

test('updatePageContent rejects invalid type and oversized content', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', HOST_PASSWORD, 'socket-host');
  const host = getHostIdentity(created);
  await manager.updatePages(host, [{ id: 'page-a', theme: 1, kind: 'canvas', title: '画布' }]);

  const badType = manager.updatePageContent(host, 'page-a', { type: 'script', content: 'x' });
  assert.equal(badType.success, false);

  const oversizedText = manager.updatePageContent(host, 'page-a', {
    type: 'url',
    content: 'x'.repeat(65_000),
  });
  assert.equal(oversizedText.success, false);

  const oversizedCanvas = manager.updatePageContent(host, 'page-a', {
    type: 'canvas',
    content: 'x'.repeat(8_100_000),
  });
  assert.equal(oversizedCanvas.success, false);

  const ok = manager.updatePageContent(host, 'page-a', { type: 'canvas', content: '{"a":1}' });
  assert.equal(ok.success, true);
});

test('isPageContentSizeValid boundaries', () => {
  assert.equal(isPageContentSizeValid({ type: 'canvas', content: 'x'.repeat(8_000_000) }), true);
  assert.equal(isPageContentSizeValid({ type: 'canvas', content: 'x'.repeat(8_000_001) }), false);
  assert.equal(isPageContentSizeValid({ type: 'url', content: 'https://ok.com' }), true);
  assert.equal(isPageContentSizeValid({ type: 'url', content: 'x'.repeat(64_001) }), false);
});

// ---------------------------------------------------------------------------
// 踢人
// ---------------------------------------------------------------------------

test('host can kick participant; participant works and uploads are cleaned', async () => {
  const manager = createManager();
  const { host, participant, pageId } = await seedImageShowcaseLiveRoom(manager);

  const upload = await manager.uploadImageByTicket(participant.ticket, 'image/png', PNG_1PX, pageId);
  assert.equal(upload.success, true, `upload failed: ${upload.error?.message}`);
  const submit = await manager.submitWork(
    { userId: participant.userId, sessionId: participant.sessionId },
    pageId,
    upload.data.url,
    'my work',
  );
  assert.equal(submit.success, true);

  const fileName = upload.data.url.split('/').pop();
  const roomId = upload.data.url.split('/')[2];
  const stored = await manager['assetStorage'].getObject(roomId, fileName);
  assert.ok(stored, 'uploaded file should exist before kick');

  const kick = await manager.kickParticipant(host, participant.userId);
  assert.equal(kick.success, true);

  const room = manager.getActiveRoom();
  assert.equal(room.participants.has(participant.userId), false);

  const afterKick = await manager['assetStorage'].getObject(roomId, fileName);
  assert.equal(afterKick, null, 'uploaded file should be removed after kick');
});

test('participant cannot kick and host cannot be kicked', async () => {
  const manager = createManager();
  const { host, participant } = await seedImageShowcaseLiveRoom(manager);

  const notAllowed = await manager.kickParticipant(
    { userId: participant.userId, sessionId: participant.sessionId },
    participant.userId,
  );
  assert.equal(notAllowed.success, false);

  const hostKick = await manager.kickParticipant(host, host.userId);
  assert.equal(hostKick.success, false);
});

// ---------------------------------------------------------------------------
// 图片上传安全
// ---------------------------------------------------------------------------

test('upload rejects fake png (magic bytes mismatch)', async () => {
  const manager = createManager();
  const { participant, pageId } = await seedImageShowcaseLiveRoom(manager);
  const result = await manager.uploadImageByTicket(participant.ticket, 'image/png', FAKE_PNG, pageId);
  assert.equal(result.success, false);
});

test('upload rejects SVG by default', async () => {
  const manager = createManager();
  const { participant, pageId } = await seedImageShowcaseLiveRoom(manager);
  const result = await manager.uploadImageByTicket(participant.ticket, 'image/svg+xml', SVG_BODY, pageId);
  assert.equal(result.success, false);
});

test('upload accepts real png', async () => {
  const manager = createManager();
  const { participant, pageId } = await seedImageShowcaseLiveRoom(manager);
  const result = await manager.uploadImageByTicket(participant.ticket, 'image/png', PNG_1PX, pageId);
  assert.equal(result.success, true, `upload failed: ${result.error?.message}`);
});

test('upload enforces per-room asset quota', async () => {
  // 当前进程配额为 2MB：先上传一张 1.6MB“图片”（PNG 头 + 填充），再上传超过剩余配额的图片应被拒绝
  const manager = createManager();
  const { participant, pageId } = await seedImageShowcaseLiveRoom(manager);

  const bigPng = Buffer.concat([PNG_1PX, Buffer.alloc(1_600_000, 7)]);
  const first = await manager.uploadImageByTicket(participant.ticket, 'image/png', bigPng, pageId);
  assert.equal(first.success, true, `first upload failed: ${first.error?.message}`);

  const second = await manager.uploadImageByTicket(participant.ticket, 'image/png', bigPng, pageId);
  assert.equal(second.success, false, 'second upload should exceed quota');
});

// ---------------------------------------------------------------------------
// 魔数嗅探
// ---------------------------------------------------------------------------

test('sniffImageMimeFromBuffer detects formats', () => {
  assert.equal(sniffImageMimeFromBuffer(PNG_1PX), 'image/png');
  assert.equal(
    sniffImageMimeFromBuffer(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])),
    'image/jpeg',
  );
  assert.equal(sniffImageMimeFromBuffer(Buffer.from('GIF89a....')), 'image/gif');
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP')]);
  assert.equal(sniffImageMimeFromBuffer(webp), 'image/webp');
  assert.equal(sniffImageMimeFromBuffer(SVG_BODY), 'image/svg+xml');
  assert.equal(sniffImageMimeFromBuffer(FAKE_PNG), null);
  assert.equal(sniffImageMimeFromBuffer(Buffer.alloc(0)), null);
});

// ---------------------------------------------------------------------------
// 限流器（注入时钟）
// ---------------------------------------------------------------------------

test('isRateLimitedByWindow blocks after max events and resets on new window', () => {
  const state = new Map();
  let now = 1_000;
  const options = { windowMs: 10_000, max: 3 };

  assert.equal(isRateLimitedByWindow(state, 'k', options, now), false);
  assert.equal(isRateLimitedByWindow(state, 'k', options, now + 1), false);
  assert.equal(isRateLimitedByWindow(state, 'k', options, now + 2), false);
  assert.equal(isRateLimitedByWindow(state, 'k', options, now + 3), true);

  now = 11_500; // 新窗口
  assert.equal(isRateLimitedByWindow(state, 'k', options, now), false);
});

test('password attempt limiter locks after repeated failures and clears on success', () => {
  const state = new Map();
  const options = { windowMs: 300_000, maxFailures: 3, lockoutMs: 300_000 };
  let now = 1_000;

  for (let i = 0; i < 3; i += 1) {
    assert.equal(checkPasswordAttemptAllowed(state, 'ip', options, now).allowed, true);
    recordPasswordAttemptFailure(state, 'ip', options, now);
  }
  assert.equal(checkPasswordAttemptAllowed(state, 'ip', options, now).allowed, false);

  now = 301_500; // 锁定过期
  assert.equal(checkPasswordAttemptAllowed(state, 'ip', options, now).allowed, true);

  recordPasswordAttemptSuccess(state, 'ip');
  assert.equal(state.has('ip'), false);
});

// ---------------------------------------------------------------------------
// 身份抢占防护
// ---------------------------------------------------------------------------

test('ticket join from a second live socket is rejected (no ghost tab hijack)', async () => {
  const manager = createManager();
  const created = manager.createRoom('Host', 'Demo', HOST_PASSWORD, 'socket-host-1');
  assert.equal(created.success, true);
  const hostTicket = created.data.ticket;

  // 模拟"先开的标签页"：host 身份绑定在 socket-host-1 上且在线
  const hijack = manager.joinRoom('', 'socket-host-2', hostTicket);
  assert.equal(hijack.success, false);
  assert.equal(hijack.error.code, 'SESSION_ACTIVE');

  // 旧连接断开后可以重新加入
  manager.onSocketDisconnected('socket-host-1');
  const rejoin = manager.joinRoom('', 'socket-host-2', hostTicket);
  assert.equal(rejoin.success, true, `rejoin failed: ${rejoin.error?.message}`);
});

test('participant ticket cannot be used from a second live socket either', () => {
  const manager = createManager();
  manager.createRoom('Host', 'Demo', HOST_PASSWORD, 'socket-host');
  const joined = manager.joinRoom('Alice', 'socket-a');
  assert.equal(joined.success, true);

  const secondTab = manager.joinRoom('', 'socket-b', joined.data.ticket);
  assert.equal(secondTab.success, false);
  assert.equal(secondTab.error.code, 'SESSION_ACTIVE');
});
