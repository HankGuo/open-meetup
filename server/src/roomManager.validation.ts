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
  ROOM_PARTICIPANT_LIMIT_MAX,
  ROOM_PARTICIPANT_LIMIT_MIN,
} from './config';
import { MAX_MEETING_PAGES } from './meetingConfig';
import { getPageKindConfig, isThemeAllowedForPageKind } from './pageCatalog';

const MAX_WORK_URL_LENGTH = 2_048;
const MAX_WORK_DESCRIPTION_LENGTH = 120;
const MAX_PAGE_TITLE_LENGTH = 64;
export const UPLOAD_URL_PREFIX = '/uploads';

export function sanitizeUserName(userName: string): string {
  if (typeof userName !== 'string') {
    return '';
  }
  return userName.trim().slice(0, 32);
}

export function sanitizeTitle(title: string): string {
  if (typeof title !== 'string') {
    return '';
  }
  return title.trim().slice(0, 64);
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
  return value.trim().slice(0, MAX_PAGE_TITLE_LENGTH);
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
  const type = sanitizePageContentType(rawContent.type);
  if (!type) {
    return null;
  }
  if (typeof rawContent.content !== 'string') {
    return null;
  }
  return {
    type,
    content: rawContent.content,
  };
}

function sanitizePageContentType(value: unknown): PageContent['type'] | null {
  if (
    value === 'canvas' ||
    value === 'image' ||
    value === 'url' ||
    value === 'html' ||
    value === 'markdown'
  ) {
    return value;
  }
  return null;
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
