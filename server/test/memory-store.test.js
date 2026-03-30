const test = require('node:test');
const assert = require('node:assert/strict');
const { MemoryStore } = require('../dist/store.js');

function buildRoom() {
  const now = Date.now();
  return {
    title: 'Demo Room',
    hostId: 'host-1',
    participants: new Map([
      [
        'host-1',
        {
          userId: 'host-1',
          userName: 'Host',
          role: 'host',
          joinedAt: now,
          sessionId: 'session-host',
          socketId: 'socket-host',
          online: true,
          lastSeenAt: now,
          avatar: undefined,
          ticket: 'HOST-AAAA1111',
        },
      ],
    ]),
    status: 'active',
    phase: 'setup',
    currentStep: 0,
    createdAt: now,
    updatedAt: now,
    pages: [
      {
        id: 'page-1',
        theme: 1,
        kind: 'canvas',
        title: '自由画布 A',
      },
    ],
    pageContents: new Map(),
  };
}

test('MemoryStore save/load/clear lifecycle', () => {
  const store = new MemoryStore();
  const room = buildRoom();

  assert.equal(store.loadRoom(), null);
  store.saveRoom(room);
  assert.equal(store.loadRoom(), room);
  store.clearAll();
  assert.equal(store.loadRoom(), null);
});
