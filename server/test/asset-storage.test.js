const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { LocalAssetStorage } = require('../dist/assetStorage.js');

const TMP_ROOT = path.resolve(__dirname, '__tmp__');

test('LocalAssetStorage should put/get/delete object', async () => {
  const uploadRoot = path.join(TMP_ROOT, `local-${Date.now()}-a`);
  const storage = new LocalAssetStorage(uploadRoot);
  const roomId = 'room-local-a';
  const fileName = 'demo.png';
  const payload = Buffer.from('hello-local-storage');

  await storage.putObject({
    roomId,
    fileName,
    buffer: payload,
    contentType: 'image/png',
  });

  const loaded = await storage.getObject(roomId, fileName);
  assert.ok(loaded);
  assert.equal(loaded.contentType, 'image/png');
  assert.equal(loaded.buffer.toString(), payload.toString());

  await storage.deleteObject(roomId, fileName);
  const deleted = await storage.getObject(roomId, fileName);
  assert.equal(deleted, null);

  await safeRm(uploadRoot);
});

test('LocalAssetStorage should delete all room assets by room id', async () => {
  const uploadRoot = path.join(TMP_ROOT, `local-${Date.now()}-b`);
  const storage = new LocalAssetStorage(uploadRoot);
  const roomId = 'room-local-b';

  await storage.putObject({
    roomId,
    fileName: 'one.png',
    buffer: Buffer.from('one'),
    contentType: 'image/png',
  });
  await storage.putObject({
    roomId,
    fileName: 'two.jpg',
    buffer: Buffer.from('two'),
    contentType: 'image/jpeg',
  });

  await storage.deleteRoom(roomId);

  const one = await storage.getObject(roomId, 'one.png');
  const two = await storage.getObject(roomId, 'two.jpg');
  assert.equal(one, null);
  assert.equal(two, null);

  await safeRm(uploadRoot);
});

test('LocalAssetStorage should reject path traversal and invalid file names', async () => {
  const uploadRoot = path.join(TMP_ROOT, `local-${Date.now()}-c`);
  const storage = new LocalAssetStorage(uploadRoot);

  await assert.rejects(
    () =>
      storage.putObject({
        roomId: '../escape',
        fileName: 'demo.png',
        buffer: Buffer.from('x'),
      }),
    /Invalid upload path/,
  );

  await assert.rejects(
    () =>
      storage.putObject({
        roomId: 'room-local-c',
        fileName: '../evil.png',
        buffer: Buffer.from('x'),
      }),
    /Invalid upload path/,
  );

  const byTraversal = await storage.getObject('../escape', 'demo.png');
  assert.equal(byTraversal, null);

  const byBadExt = await storage.getObject('room-local-c', 'evil.txt');
  assert.equal(byBadExt, null);

  await safeRm(uploadRoot);
});

async function safeRm(targetPath) {
  await fs.promises.rm(targetPath, { recursive: true, force: true });
}
