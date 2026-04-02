const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const { LocalAssetStorage, MinioAssetStorage } = require('../dist/assetStorage.js');

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

test('MinioAssetStorage should ensure bucket once and handle put/get/delete', async () => {
  const calls = {
    bucketExists: 0,
    makeBucket: 0,
    putObject: 0,
    statObject: 0,
    getObject: 0,
    removeObject: 0,
  };

  const mockClient = {
    async bucketExists(bucketName) {
      calls.bucketExists += 1;
      assert.equal(bucketName, 'assets');
      return false;
    },
    async makeBucket(bucketName, region) {
      calls.makeBucket += 1;
      assert.equal(bucketName, 'assets');
      assert.equal(region, 'us-east-1');
    },
    async putObject(bucketName, objectName, content, size, metadata) {
      calls.putObject += 1;
      assert.equal(bucketName, 'assets');
      assert.equal(objectName, 'room-minio-a/demo.webp');
      assert.equal(size, 5);
      assert.equal(metadata['Content-Type'], 'image/webp');
      assert.equal(Buffer.from(content).toString(), 'hello');
    },
    async statObject(bucketName, objectName) {
      calls.statObject += 1;
      assert.equal(bucketName, 'assets');
      assert.equal(objectName, 'room-minio-a/demo.webp');
      return { metaData: { 'content-type': 'image/webp' } };
    },
    async getObject(bucketName, objectName) {
      calls.getObject += 1;
      assert.equal(bucketName, 'assets');
      assert.equal(objectName, 'room-minio-a/demo.webp');
      return Readable.from([Buffer.from('hello')]);
    },
    async removeObject(bucketName, objectName) {
      calls.removeObject += 1;
      assert.equal(bucketName, 'assets');
      assert.equal(objectName, 'room-minio-a/demo.webp');
    },
    listObjects() {
      return Readable.from([], { objectMode: true });
    },
  };

  const storage = new MinioAssetStorage({
    endpoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'minio',
    secretKey: 'minio123',
    bucket: 'assets',
    region: 'us-east-1',
    client: mockClient,
  });

  await storage.putObject({
    roomId: 'room-minio-a',
    fileName: 'demo.webp',
    buffer: Buffer.from('hello'),
    contentType: 'image/webp',
  });

  const loaded = await storage.getObject('room-minio-a', 'demo.webp');
  assert.ok(loaded);
  assert.equal(loaded.contentType, 'image/webp');
  assert.equal(loaded.buffer.toString(), 'hello');

  await storage.deleteObject('room-minio-a', 'demo.webp');

  assert.equal(calls.bucketExists, 1);
  assert.equal(calls.makeBucket, 1);
  assert.equal(calls.putObject, 1);
  assert.equal(calls.statObject, 1);
  assert.equal(calls.getObject, 1);
  assert.equal(calls.removeObject, 1);
});

test('MinioAssetStorage deleteRoom should remove all objects under room prefix', async () => {
  const removed = [];
  const mockClient = {
    async bucketExists() {
      return true;
    },
    async makeBucket() {},
    async putObject() {},
    async statObject() {
      return { metaData: { 'content-type': 'image/png' } };
    },
    async getObject() {
      return Readable.from([Buffer.from('x')]);
    },
    async removeObject(_bucketName, objectName) {
      removed.push(objectName);
    },
    listObjects(_bucketName, prefix) {
      assert.equal(prefix, 'room-minio-b/');
      return Readable.from(
        [
          { name: 'room-minio-b/one.png' },
          { name: 'room-minio-b/two.png' },
        ],
        { objectMode: true },
      );
    },
  };

  const storage = new MinioAssetStorage({
    endpoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'minio',
    secretKey: 'minio123',
    bucket: 'assets',
    region: 'us-east-1',
    client: mockClient,
  });

  await storage.deleteRoom('room-minio-b');
  assert.deepEqual(removed.sort(), ['room-minio-b/one.png', 'room-minio-b/two.png']);
});

test('MinioAssetStorage getObject should return null when object does not exist', async () => {
  const mockClient = {
    async bucketExists() {
      return true;
    },
    async makeBucket() {},
    async putObject() {},
    async statObject() {
      const err = new Error('not found');
      err.code = 'NoSuchKey';
      throw err;
    },
    async getObject() {
      return Readable.from([]);
    },
    async removeObject() {},
    listObjects() {
      return Readable.from([], { objectMode: true });
    },
  };

  const storage = new MinioAssetStorage({
    endpoint: 'localhost',
    port: 9000,
    useSSL: false,
    accessKey: 'minio',
    secretKey: 'minio123',
    bucket: 'assets',
    region: 'us-east-1',
    client: mockClient,
  });

  const loaded = await storage.getObject('room-minio-c', 'missing.png');
  assert.equal(loaded, null);
});

async function safeRm(targetPath) {
  await fs.promises.rm(targetPath, { recursive: true, force: true });
}
