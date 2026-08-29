import path from 'path';
import {
  MeetingPageDefinition,
  MeetingPageKind,
  MeetingPageTheme,
  PageContent,
  PageSubmissionMode,
  ParticipantWorks,
  Room,
} from './types';
import {
  DEFAULT_PARTICIPANTS_PER_ROOM,
  MAX_PAGE_CONTENT_CANVAS_BYTES,
  MAX_PAGE_CONTENT_TEXT_BYTES,
  ROOM_PARTICIPANT_LIMIT_MAX,
  ROOM_PARTICIPANT_LIMIT_MIN,
} from './config';
import { MAX_MEETING_PAGES } from './meetingConfig';
import { getPageKindConfig, isThemeAllowedForPageKind } from './pageCatalog';

const MAX_WORK_URL_LENGTH = 2_048;
const MAX_WORK_DESCRIPTION_LENGTH = 120;
const MAX_PAGE_TITLE_LENGTH = 64;
export const UPLOAD_URL_PREFIX = '/uploads';

/** 控制字符混入昵称/标题会影响展示与日志，直接剔除 */
const CONTROL_CHARS = new Set(
  Array.from({ length: 32 }, (_, i) => String.fromCharCode(i)).concat(['\u007F']),
);

function stripControlChars(value: string): string {
  return Array.from(value)
    .filter((char) => !CONTROL_CHARS.has(char))
    .join('');
}

export function sanitizeUserName(userName: string): string {
  if (typeof userName !== 'string') {
    return '';
  }
  return stripControlChars(userName).trim().slice(0, 32);
}

export function sanitizeTitle(title: string): string {
  if (typeof title !== 'string') {
    return '';
  }
  return stripControlChars(title).trim().slice(0, 64);
}

/** 昵称重复会让主持人与其他参与者无法辨识提交者，直接拒绝 */
export function isUserNameTaken(room: Room, userName: string): boolean {
  const normalized = userName.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  for (const participant of room.participants.values()) {
    if (participant.userName.trim().toLowerCase() === normalized) {
      return true;
    }
  }
  return false;
}

export function sanitizeParticipantLimit(value: unknown): number | null {
  if (value == null) {
    return DEFAULT_PARTICIPANTS_PER_ROOM;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }
  const normalized = Math.floor(value);
  if (normalized < ROOM_PARTICIPANT_LIMIT_MIN || normalized > ROOM_PARTICIPANT_LIMIT_MAX) {
    return null;
  }
  return normalized;
}

export function getParticipantAudienceCount(room: Room): number {
  let count = 0;
  for (const participant of room.participants.values()) {
    if (participant.role === 'participant') {
      count += 1;
    }
  }
  return count;
}

export function sanitizePageId(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed.slice(0, 120);
}

function sanitizePageKind(value: unknown): MeetingPageKind | null {
  return getPageKindConfig(value)?.kind ?? null;
}

function sanitizePageTheme(value: unknown): MeetingPageTheme | null {
  if (value === 1 || value === 3) {
    return value;
  }
  return null;
}

function sanitizePageTitle(value: unknown): string {
  if (typeof value !== 'string') {
    return '';
  }
  return stripControlChars(value).trim().slice(0, MAX_PAGE_TITLE_LENGTH);
}

/** 单页内容按类型限制字节量，防止画布/文本内容把内存与广播带宽打爆 */
export function isPageContentSizeValid(content: PageContent): boolean {
  const byteLength = Buffer.byteLength(content.content, 'utf8');
  if (content.type === 'canvas') {
    return byteLength <= MAX_PAGE_CONTENT_CANVAS_BYTES;
  }
  return byteLength <= MAX_PAGE_CONTENT_TEXT_BYTES;
}

export function isPageContentTypeValid(type: unknown): type is PageContent['type'] {
  return type === 'canvas' || type === 'image' || type === 'url' || type === 'html' || type === 'markdown';
}

export function sanitizePagesInput(value: unknown): MeetingPageDefinition[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const seenIds = new Set<string>();
  const pages: MeetingPageDefinition[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') {
      return null;
    }

    const rawPage = raw as Record<string, unknown>;
    const id = sanitizePageId(rawPage.id);
    const kind = sanitizePageKind(rawPage.kind);
    const theme = sanitizePageTheme(rawPage.theme);
    const title = sanitizePageTitle(rawPage.title);

    if (!id || !kind || !theme || !title || seenIds.has(id)) {
      return null;
    }

    if (!isThemeAllowedForPageKind(kind, theme)) {
      return null;
    }

    seenIds.add(id);
    if (kind === 'showcase') {
      const submissionMode = sanitizePageSubmissionMode(rawPage.submissionMode);
      const rankingEnabled = sanitizePageRankingEnabled(rawPage.rankingEnabled);
      if (!submissionMode || rankingEnabled == null) {
        return null;
      }
      pages.push({
        id,
        kind,
        theme,
        title,
        submissionMode,
        rankingEnabled,
      });
      continue;
    }
    pages.push({
      id,
      kind,
      theme,
      title,
    });
  }

  return pages;
}

export function sanitizeLayoutTemplateInput(
  value: unknown,
): { pages: MeetingPageDefinition[]; pageContents: Map<string, PageContent> } | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const rawTemplate = value as Record<string, unknown>;
  if (rawTemplate.version !== 1) {
    return null;
  }

  const pages = sanitizePagesInput(rawTemplate.pages);
  if (!pages) {
    return null;
  }
  if (pages.length > MAX_MEETING_PAGES) {
    return null;
  }

  const validPageIds = new Set(pages.map((page) => page.id));
  const pageContents = sanitizeTemplatePageContents(rawTemplate.pageContents, validPageIds);
  if (!pageContents) {
    return null;
  }

  return { pages, pageContents };
}

function sanitizeTemplatePageContents(
  value: unknown,
  validPageIds: Set<string>,
): Map<string, PageContent> | null {
  if (value == null) {
    return new Map();
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const map = new Map<string, PageContent>();
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) {
      return null;
    }

    const pageId = sanitizePageId(entry[0]);
    if (!pageId || !validPageIds.has(pageId)) {
      return null;
    }

    const content = sanitizePageContent(entry[1]);
    if (!content) {
      return null;
    }
    map.set(pageId, content);
  }

  return map;
}

function sanitizePageContent(value: unknown): PageContent | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const rawContent = value as Record<string, unknown>;
  const type = rawContent.type;
  if (!isPageContentTypeValid(type)) {
    return null;
  }
  if (typeof rawContent.content !== 'string') {
    return null;
  }
  const content: PageContent = { type, content: rawContent.content };
  if (!isPageContentSizeValid(content)) {
    return null;
  }
  return content;
}

function sanitizePageSubmissionMode(value: unknown): PageSubmissionMode | null {
  if (value == null) {
    return 'url';
  }
  if (value === 'url' || value === 'image') {
    return value;
  }
  return null;
}

function sanitizePageRankingEnabled(value: unknown): boolean | null {
  if (value == null) {
    return true;
  }
  if (typeof value === 'boolean') {
    return value;
  }
  return null;
}

export function normalizeTicket(ticket: string): string {
  if (typeof ticket !== 'string') {
    return '';
  }
  return ticket.trim().toUpperCase();
}

export function sanitizeHttpWorkUrl(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_WORK_URL_LENGTH) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.toString();
  } catch {
    return '';
  }
}

export function sanitizeManagedUploadUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith(`${UPLOAD_URL_PREFIX}/`)) {
    return normalizeManagedUploadPath(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    return normalizeManagedUploadPath(parsed.pathname);
  } catch {
    return '';
  }
}

export function normalizeManagedUploadPath(pathValue: string): string {
  const normalized = path.posix.normalize(pathValue);
  const prefix = `${UPLOAD_URL_PREFIX}/`;
  if (!normalized.startsWith(prefix)) {
    return '';
  }

  const tail = normalized.slice(prefix.length);
  const segments = tail.split('/');
  if (segments.length !== 2) {
    return '';
  }

  const [roomId, fileName] = segments;
  if (!isSafeRoomId(roomId) || !isSafeFileName(fileName) || !hasKnownImageExtension(fileName)) {
    return '';
  }

  return `${UPLOAD_URL_PREFIX}/${roomId}/${fileName}`;
}

function isSafeRoomId(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

function isSafeFileName(value: string): boolean {
  return /^[a-zA-Z0-9_-]{1,128}\.[a-zA-Z0-9]+$/.test(value);
}

function hasKnownImageExtension(value: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|avif|bmp)$/i.test(value);
}

export function resolveImageExtensionByMime(mimeType: string): string | null {
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
    return '.jpg';
  }
  if (mimeType === 'image/png') {
    return '.png';
  }
  if (mimeType === 'image/webp') {
    return '.webp';
  }
  if (mimeType === 'image/gif') {
    return '.gif';
  }
  if (mimeType === 'image/svg+xml') {
    return '.svg';
  }
  if (mimeType === 'image/avif') {
    return '.avif';
  }
  if (mimeType === 'image/bmp') {
    return '.bmp';
  }
  return null;
}

export function normalizeImageMimeType(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  return input.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

export type SniffedImageMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/gif'
  | 'image/webp'
  | 'image/avif'
  | 'image/bmp'
  | 'image/svg+xml'
  | null;

/**
 * 按文件头魔数识别图片真实类型，不信任 Content-Type 头。
 * 识别不出（含伪装成图片的其他数据）时返回 null。
 */
export function sniffImageMimeFromBuffer(buffer: Buffer): SniffedImageMime {
  // 最短的合法图片头是 GIF（6 字节）；更短的数据不可能构成任何受支持格式
  if (!Buffer.isBuffer(buffer) || buffer.length < 6) {
    return null;
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  // GIF: GIF87a / GIF89a
  if (buffer.slice(0, 3).toString('ascii') === 'GIF') {
    return 'image/gif';
  }
  // WEBP: RIFF....WEBP
  if (buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  // AVIF / HEIC 家族：ftyp 盒
  if (buffer.slice(4, 8).toString('ascii') === 'ftyp') {
    const brand = buffer.slice(8, 12).toString('ascii');
    if (brand.startsWith('avi')) {
      return 'image/avif';
    }
    return null;
  }
  // BMP: 42 4D
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) {
    return 'image/bmp';
  }
  // SVG：XML 声明或 <svg 标签（允许前置空白）
  const head = buffer.slice(0, Math.min(buffer.length, 256)).toString('utf8').trimStart().toLowerCase();
  if (head.startsWith('<?xml') || head.startsWith('<svg')) {
    return 'image/svg+xml';
  }
  return null;
}

export function sanitizeWorkDescription(input: string): string {
  if (typeof input !== 'string') {
    return '';
  }
  const trimmed = input.trim();
  if (!trimmed || trimmed.length > MAX_WORK_DESCRIPTION_LENGTH) {
    return '';
  }
  return trimmed;
}

export function isValidSubmissionForMode(
  submission: ParticipantWorks[string] | undefined,
  mode: PageSubmissionMode,
  roomId: string,
): boolean {
  if (!submission) {
    return false;
  }
  const validDescription = sanitizeWorkDescription(submission.description);
  if (!validDescription) {
    return false;
  }
  const validUrl =
    mode === 'image'
      ? validateManagedUploadSubmissionUrl(submission.url, roomId)
      : sanitizeHttpWorkUrl(submission.url);
  if (!validUrl) {
    return false;
  }
  return typeof submission.updatedAt === 'number' && Number.isFinite(submission.updatedAt);
}

function validateManagedUploadSubmissionUrl(url: string, roomId: string): string {
  const normalized = sanitizeManagedUploadUrl(url);
  if (!normalized) {
    return '';
  }
  const roomPrefix = `${UPLOAD_URL_PREFIX}/${roomId}/`;
  if (!normalized.startsWith(roomPrefix)) {
    return '';
  }
  return normalized;
}

export function cloneParticipantWorks(works: ParticipantWorks | undefined): ParticipantWorks | undefined {
  if (!works) {
    return undefined;
  }

  const entries = Object.entries(works);
  if (entries.length === 0) {
    return undefined;
  }

  const cloned: ParticipantWorks = {};
  for (const [pageId, submission] of entries) {
    if (!pageId || !submission) {
      continue;
    }
    cloned[pageId] = {
      url: submission.url,
      description: submission.description,
      updatedAt: submission.updatedAt,
    };
  }

  return Object.keys(cloned).length > 0 ? cloned : undefined;
}
