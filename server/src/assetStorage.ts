import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import * as Minio from 'minio';
import {
  ASSET_STORAGE_PROVIDER,
  MINIO_ACCESS_KEY,
  MINIO_BUCKET,
  MINIO_ENDPOINT,
  MINIO_PORT,
  MINIO_REGION,
  MINIO_SECRET_KEY,
  MINIO_USE_SSL,
} from './config';

const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads');
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';

export interface StoredAsset {
  buffer: Buffer;
  contentType: string | null;
}

export interface PutAssetInput {
  roomId: string;
  fileName: string;
  buffer: Buffer;
  contentType?: string;
}

export interface AssetStorage {
  putObject(input: PutAssetInput): Promise<void>;
  getObject(roomId: string, fileName: string): Promise<StoredAsset | null>;
  deleteObject(roomId: string, fileName: string): Promise<void>;
  deleteRoom(roomId: string): Promise<void>;
}

interface MinioClientLike {
  bucketExists(bucketName: string): Promise<boolean>;
  makeBucket(bucketName: string, region: string): Promise<void>;
  putObject(
    bucketName: string,
    objectName: string,
    stream: Buffer | Readable | string,
    size?: number,
    metaData?: Record<string, string>,
  ): Promise<unknown>;
  statObject(bucketName: string, objectName: string): Promise<{ metaData?: Record<string, string> }>;
  getObject(bucketName: string, objectName: string): Promise<Readable>;
  removeObject(bucketName: string, objectName: string): Promise<void>;
  listObjects(bucketName: string, prefix: string, recursive: boolean): Readable;
}

interface MinioAssetStorageOptions {
  endpoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  bucket: string;
  region: string;
  client?: MinioClientLike;
}

export class LocalAssetStorage implements AssetStorage {
  constructor(private readonly uploadRoot: string = UPLOAD_ROOT) {}

  async putObject(input: PutAssetInput): Promise<void> {
    const { roomId, fileName, buffer } = input;
    const roomDir = path.join(this.uploadRoot, roomId);
    const absolutePath = path.join(roomDir, fileName);
    await fs.promises.mkdir(roomDir, { recursive: true });
    await fs.promises.writeFile(absolutePath, buffer);
  }

  async getObject(roomId: string, fileName: string): Promise<StoredAsset | null> {
    const absolutePath = path.join(this.uploadRoot, roomId, fileName);
    try {
      const buffer = await fs.promises.readFile(absolutePath);
      return {
        buffer,
        contentType: resolveContentTypeByFileName(fileName),
      };
    } catch (error) {
      if (isFileNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(roomId: string, fileName: string): Promise<void> {
    const absolutePath = path.join(this.uploadRoot, roomId, fileName);
    try {
      await fs.promises.rm(absolutePath, { force: true });
    } catch (error) {
      if (!isFileNotFound(error)) {
        throw error;
      }
    }

    const roomDir = path.join(this.uploadRoot, roomId);
    try {
      const remaining = await fs.promises.readdir(roomDir);
      if (remaining.length === 0) {
        await fs.promises.rmdir(roomDir);
      }
    } catch (error) {
      if (!isFileNotFound(error)) {
        throw error;
      }
    }
  }

  async deleteRoom(roomId: string): Promise<void> {
    const roomDir = path.join(this.uploadRoot, roomId);
    await fs.promises.rm(roomDir, { recursive: true, force: true });
  }
}

export class MinioAssetStorage implements AssetStorage {
  private readonly client: MinioClientLike;
  private ensureBucketPromise: Promise<void> | null = null;

  constructor(private readonly options: MinioAssetStorageOptions) {
    this.client =
      options.client ||
      new Minio.Client({
        endPoint: options.endpoint,
        port: options.port,
        useSSL: options.useSSL,
        accessKey: options.accessKey,
        secretKey: options.secretKey,
      });
  }

  async putObject(input: PutAssetInput): Promise<void> {
    await this.ensureBucket();
    const objectName = toObjectName(input.roomId, input.fileName);
    const contentType = normalizeContentType(input.contentType);
    await this.client.putObject(this.options.bucket, objectName, input.buffer, input.buffer.byteLength, {
      'Content-Type': contentType,
    });
  }

  async getObject(roomId: string, fileName: string): Promise<StoredAsset | null> {
    await this.ensureBucket();
    const objectName = toObjectName(roomId, fileName);

    try {
      const stat = await this.client.statObject(this.options.bucket, objectName);
      const stream = await this.client.getObject(this.options.bucket, objectName);
      const buffer = await readStreamAsBuffer(stream);
      const contentType = resolveMinioContentType(stat.metaData, fileName);
      return { buffer, contentType };
    } catch (error) {
      if (isObjectNotFoundError(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(roomId: string, fileName: string): Promise<void> {
    await this.ensureBucket();
    const objectName = toObjectName(roomId, fileName);
    try {
      await this.client.removeObject(this.options.bucket, objectName);
    } catch (error) {
      if (!isObjectNotFoundError(error)) {
        throw error;
      }
    }
  }

  async deleteRoom(roomId: string): Promise<void> {
    await this.ensureBucket();
    const prefix = `${roomId}/`;
    const stream = this.client.listObjects(this.options.bucket, prefix, true);
    const objectNames = await collectObjectNamesFromStream(stream);

    if (objectNames.length === 0) {
      return;
    }

    await Promise.all(
      objectNames.map(async (objectName) => {
        try {
          await this.client.removeObject(this.options.bucket, objectName);
        } catch (error) {
          if (!isObjectNotFoundError(error)) {
            throw error;
          }
        }
      }),
    );
  }

  private async ensureBucket(): Promise<void> {
    if (!this.ensureBucketPromise) {
      this.ensureBucketPromise = this.doEnsureBucket().catch((error) => {
        this.ensureBucketPromise = null;
        throw error;
      });
    }
    await this.ensureBucketPromise;
  }

  private async doEnsureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.options.bucket);
    if (!exists) {
      await this.client.makeBucket(this.options.bucket, this.options.region);
    }
  }
}

export function createAssetStorage(): AssetStorage {
  if (ASSET_STORAGE_PROVIDER === 'minio') {
    return new MinioAssetStorage({
      endpoint: MINIO_ENDPOINT,
      port: MINIO_PORT,
      useSSL: MINIO_USE_SSL,
      accessKey: MINIO_ACCESS_KEY,
      secretKey: MINIO_SECRET_KEY,
      bucket: MINIO_BUCKET,
      region: MINIO_REGION,
    });
  }
  return new LocalAssetStorage();
}

async function readStreamAsBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function collectObjectNamesFromStream(stream: Readable): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    const objectNames: string[] = [];
    stream.on('data', (item) => {
      if (item && typeof item === 'object' && typeof (item as { name?: unknown }).name === 'string') {
        objectNames.push((item as { name: string }).name);
      }
    });
    stream.on('end', () => resolve(objectNames));
    stream.on('error', (error) => reject(error));
  });
}

function resolveMinioContentType(metaData: Record<string, string> | undefined, fileName: string): string | null {
  const fromMetadata = metaData?.['content-type'] || metaData?.['Content-Type'];
  if (typeof fromMetadata === 'string' && fromMetadata.trim()) {
    return fromMetadata.trim();
  }
  return resolveContentTypeByFileName(fileName);
}

function resolveContentTypeByFileName(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lower.endsWith('.png')) {
    return 'image/png';
  }
  if (lower.endsWith('.webp')) {
    return 'image/webp';
  }
  if (lower.endsWith('.gif')) {
    return 'image/gif';
  }
  if (lower.endsWith('.svg')) {
    return 'image/svg+xml';
  }
  if (lower.endsWith('.avif')) {
    return 'image/avif';
  }
  if (lower.endsWith('.bmp')) {
    return 'image/bmp';
  }
  return DEFAULT_CONTENT_TYPE;
}

function normalizeContentType(value: string | undefined): string {
  if (typeof value !== 'string') {
    return DEFAULT_CONTENT_TYPE;
  }
  const trimmed = value.trim();
  return trimmed || DEFAULT_CONTENT_TYPE;
}

function toObjectName(roomId: string, fileName: string): string {
  return `${roomId}/${fileName}`;
}

function isFileNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function isObjectNotFoundError(error: unknown): boolean {
  const code = (error as { code?: string } | undefined)?.code;
  return code === 'NoSuchKey' || code === 'NotFound' || code === 'NoSuchObject' || code === 'NoSuchBucket';
}
