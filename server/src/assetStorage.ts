import fs from 'fs';
import path from 'path';

const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads');
const DEFAULT_CONTENT_TYPE = 'application/octet-stream';
const SAFE_ROOM_ID_REGEX = /^[a-zA-Z0-9_-]{1,128}$/;
const SAFE_FILE_NAME_REGEX = /^[a-zA-Z0-9_-]{1,128}\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i;

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

export class LocalAssetStorage implements AssetStorage {
  private readonly normalizedUploadRoot: string;

  constructor(private readonly uploadRoot: string = UPLOAD_ROOT) {
    this.normalizedUploadRoot = path.resolve(uploadRoot);
  }

  async putObject(input: PutAssetInput): Promise<void> {
    const { roomId, fileName, buffer } = input;
    const resolved = resolveSafeObjectPath(this.normalizedUploadRoot, roomId, fileName);
    if (!resolved) {
      throw new Error('Invalid upload path');
    }
    await fs.promises.mkdir(resolved.roomDir, { recursive: true });
    await fs.promises.writeFile(resolved.filePath, buffer);
  }

  async getObject(roomId: string, fileName: string): Promise<StoredAsset | null> {
    const resolved = resolveSafeObjectPath(this.normalizedUploadRoot, roomId, fileName);
    if (!resolved) {
      return null;
    }
    try {
      const buffer = await fs.promises.readFile(resolved.filePath);
      return {
        buffer,
        contentType: resolveContentTypeByFileName(resolved.fileName),
      };
    } catch (error) {
      if (isFileNotFound(error)) {
        return null;
      }
      throw error;
    }
  }

  async deleteObject(roomId: string, fileName: string): Promise<void> {
    const resolved = resolveSafeObjectPath(this.normalizedUploadRoot, roomId, fileName);
    if (!resolved) {
      return;
    }
    try {
      await fs.promises.rm(resolved.filePath, { force: true });
    } catch (error) {
      if (!isFileNotFound(error)) {
        throw error;
      }
    }

    try {
      const remaining = await fs.promises.readdir(resolved.roomDir);
      if (remaining.length === 0) {
        await fs.promises.rmdir(resolved.roomDir);
      }
    } catch (error) {
      if (!isFileNotFound(error)) {
        throw error;
      }
    }
  }

  async deleteRoom(roomId: string): Promise<void> {
    const safeRoomId = sanitizeRoomId(roomId);
    if (!safeRoomId) {
      return;
    }
    const roomDir = path.resolve(this.normalizedUploadRoot, safeRoomId);
    if (!isSubPath(this.normalizedUploadRoot, roomDir)) {
      return;
    }
    await fs.promises.rm(roomDir, { recursive: true, force: true });
  }
}

export function createAssetStorage(): AssetStorage {
  return new LocalAssetStorage();
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

function isFileNotFound(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT';
}

function sanitizeRoomId(value: string): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (!SAFE_ROOM_ID_REGEX.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function sanitizeFileName(value: string): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (!SAFE_FILE_NAME_REGEX.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function resolveSafeObjectPath(
  uploadRoot: string,
  roomIdInput: string,
  fileNameInput: string,
): { roomId: string; fileName: string; roomDir: string; filePath: string } | null {
  const roomId = sanitizeRoomId(roomIdInput);
  const fileName = sanitizeFileName(fileNameInput);
  if (!roomId || !fileName) {
    return null;
  }

  const roomDir = path.resolve(uploadRoot, roomId);
  const filePath = path.resolve(roomDir, fileName);
  if (!isSubPath(uploadRoot, roomDir)) {
    return null;
  }
  if (!isSubPath(roomDir, filePath)) {
    return null;
  }
  if (path.dirname(filePath) !== roomDir) {
    return null;
  }

  return { roomId, fileName, roomDir, filePath };
}

function isSubPath(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  if (relative === '') {
    return true;
  }
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}
