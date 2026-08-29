import { randomUUID } from 'crypto';
import { AssetStorage } from './assetStorage';
import {
  ALLOW_SVG_UPLOAD,
  MAX_IMAGE_UPLOAD_BYTES as CONFIG_IMAGE_UPLOAD_MAX_BYTES,
  MAX_ROOM_ASSETS_BYTES,
} from './config';
import { ParticipantWorks, Room } from './types';
import {
  isValidSubmissionForMode,
  normalizeImageMimeType,
  normalizeManagedUploadPath,
  resolveImageExtensionByMime,
  sanitizeManagedUploadUrl,
  sniffImageMimeFromBuffer,
  UPLOAD_URL_PREFIX,
} from './roomManager.validation';

export const MAX_IMAGE_UPLOAD_BYTES = CONFIG_IMAGE_UPLOAD_MAX_BYTES;

export async function persistImageUpload(
  assetStorage: AssetStorage,
  room: Room,
  mimeTypeInput: string,
  bufferInput: Buffer,
): Promise<string | null> {
  if (
    !Buffer.isBuffer(bufferInput) ||
    bufferInput.length === 0 ||
    bufferInput.length > MAX_IMAGE_UPLOAD_BYTES
  ) {
    return null;
  }

  const mimeType = normalizeImageMimeType(mimeTypeInput);
  // 按魔数核实真实类型；Content-Type 头可以被任意伪造
  const sniffedMime = sniffImageMimeFromBuffer(bufferInput);
  if (!sniffedMime || !mimeType.startsWith('image/')) {
    return null;
  }
  if (sniffedMime === 'image/svg+xml') {
    // SVG 可内嵌脚本且会被浏览器按文档渲染，默认禁止；声明类型与真实类型不一致时同样拒绝
    if (!ALLOW_SVG_UPLOAD || mimeType !== 'image/svg+xml') {
      return null;
    }
  } else if (sniffedMime !== mimeType && !(sniffedMime === 'image/jpeg' && mimeType === 'image/jpg')) {
    return null;
  }

  const extension = resolveImageExtensionByMime(sniffedMime);
  if (!extension) {
    return null;
  }

  // 上传前检查房间资产配额，防止持续上传写满主持人磁盘
  try {
    const usedBytes = await assetStorage.getRoomSizeBytes(room.id);
    if (usedBytes + bufferInput.length > MAX_ROOM_ASSETS_BYTES) {
      return null;
    }
  } catch {
    return null;
  }

  const fileName = `${Date.now().toString(36)}-${randomUUID().replace(/-/g, '').slice(0, 10)}${extension}`;
  try {
    await assetStorage.putObject({
      roomId: room.id,
      fileName,
      buffer: bufferInput,
      contentType: sniffedMime,
    });
  } catch {
    return null;
  }

  return `${UPLOAD_URL_PREFIX}/${room.id}/${fileName}`;
}

export async function removeRoomUploads(
  assetStorage: AssetStorage,
  roomId: string | undefined,
): Promise<void> {
  if (!roomId) {
    return;
  }
  try {
    await assetStorage.deleteRoom(roomId);
  } catch {}
}

export async function cleanupUploadUrls(
  assetStorage: AssetStorage,
  room: Room,
  uploadUrls: Iterable<string>,
): Promise<void> {
  const candidates = new Set<string>();
  for (const uploadUrl of uploadUrls) {
    const normalized = normalizeManagedUploadUrlForRoom(uploadUrl, room.id);
    if (normalized) {
      candidates.add(normalized);
    }
  }

  for (const uploadUrl of candidates) {
    if (isManagedUploadUrlStillReferenced(room, uploadUrl)) {
      continue;
    }
    await removeManagedUploadByUrl(assetStorage, uploadUrl);
  }
}

export async function applyPagesConfiguration(
  assetStorage: AssetStorage,
  room: Room,
  normalizedPages: Array<Room['pages'][number]>,
): Promise<void> {
  room.pages = normalizedPages;

  const validIds = new Set(normalizedPages.map((page) => page.id));
  for (const pageId of Array.from(room.pageContents.keys())) {
    if (!validIds.has(pageId)) {
      room.pageContents.delete(pageId);
    }
  }

  const validShowcaseIds = new Set(
    normalizedPages.filter((page) => page.kind === 'showcase').map((page) => page.id),
  );
  const showcaseModeByPageId = new Map(
    normalizedPages
      .filter((page) => page.kind === 'showcase')
      .map((page) => [page.id, page.submissionMode ?? 'url'] as const),
  );

  const removedUploadUrls = new Set<string>();
  for (const participant of room.participants.values()) {
    if (!participant.works) {
      continue;
    }
    for (const submissionPageId of Object.keys(participant.works)) {
      const submission = participant.works[submissionPageId];
      const mode = showcaseModeByPageId.get(submissionPageId);
      if (
        !validShowcaseIds.has(submissionPageId) ||
        !mode ||
        !isValidSubmissionForMode(submission, mode, room.id)
      ) {
        const managedUpload = normalizeManagedUploadUrlForRoom(submission?.url, room.id);
        if (managedUpload) {
          removedUploadUrls.add(managedUpload);
        }
        delete participant.works[submissionPageId];
      }
    }
    if (Object.keys(participant.works).length === 0) {
      delete participant.works;
    }
  }

  await cleanupUploadUrls(assetStorage, room, removedUploadUrls);

  const maxStepIndex = Math.max(0, normalizedPages.length - 1);
  if (room.currentStep > maxStepIndex) {
    room.currentStep = maxStepIndex;
  }
}

export function collectManagedUploadUrlsFromParticipantWorks(
  works: ParticipantWorks | undefined,
  roomId: string,
): string[] {
  if (!works) {
    return [];
  }
  const uploadUrls: string[] = [];
  for (const submission of Object.values(works)) {
    const normalized = normalizeManagedUploadUrlForRoom(submission?.url, roomId);
    if (normalized) {
      uploadUrls.push(normalized);
    }
  }
  return uploadUrls;
}

export function normalizeManagedUploadUrlForRoom(
  uploadUrl: string | undefined,
  roomId: string,
): string | null {
  if (typeof uploadUrl !== 'string') {
    return null;
  }
  const normalized = sanitizeManagedUploadUrl(uploadUrl);
  if (!normalized) {
    return null;
  }
  const prefix = `${UPLOAD_URL_PREFIX}/${roomId}/`;
  if (!normalized.startsWith(prefix)) {
    return null;
  }
  return normalized;
}

function isManagedUploadUrlStillReferenced(room: Room, normalizedUploadUrl: string): boolean {
  for (const participant of room.participants.values()) {
    if (!participant.works) {
      continue;
    }
    for (const submission of Object.values(participant.works)) {
      const normalized = normalizeManagedUploadUrlForRoom(submission?.url, room.id);
      if (normalized === normalizedUploadUrl) {
        return true;
      }
    }
  }
  return false;
}

async function removeManagedUploadByUrl(assetStorage: AssetStorage, uploadUrl: string): Promise<void> {
  const normalized = normalizeManagedUploadPath(uploadUrl);
  if (!normalized) {
    return;
  }
  const segments = normalized.slice(`${UPLOAD_URL_PREFIX}/`.length).split('/');
  if (segments.length !== 2) {
    return;
  }
  const [roomId, fileName] = segments;
  if (!roomId || !fileName) {
    return;
  }
  try {
    await assetStorage.deleteObject(roomId, fileName);
  } catch {}
}
