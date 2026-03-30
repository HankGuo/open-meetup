import fs from 'fs';
import path from 'path';
import { PageContent, Room } from './types';

export const UPLOAD_URL_PREFIX = '/uploads/';
export const UPLOAD_ROOT = path.resolve(__dirname, '..', 'uploads');
export const UPLOAD_TEMP_DIR = path.join(UPLOAD_ROOT, '_tmp');

export const UPLOAD_DIR_BY_TYPE = {
  image: path.join(UPLOAD_ROOT, 'image'),
  html: path.join(UPLOAD_ROOT, 'html'),
  markdown: path.join(UPLOAD_ROOT, 'markdown'),
} as const;

export type UploadContentType = keyof typeof UPLOAD_DIR_BY_TYPE;

export interface UploadGcResult {
  scanned: number;
  deleted: number;
  retained: number;
  errors: number;
}

export function ensureUploadDirs() {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR_BY_TYPE.image, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR_BY_TYPE.html, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR_BY_TYPE.markdown, { recursive: true });
}

export function normalizeExt(fileName: string): string {
  const ext = path.extname(fileName || '').toLowerCase();
  if (!ext || ext.length > 12) {
    return '';
  }
  return ext.replace(/[^a-z0-9.]/g, '');
}

export function parseUploadContentType(input: unknown): UploadContentType | null {
  if (input === 'image' || input === 'html' || input === 'markdown') {
    return input;
  }
  return null;
}

export function defaultExtByType(uploadType: UploadContentType): string {
  if (uploadType === 'image') {
    return '.png';
  }
  if (uploadType === 'html') {
    return '.html';
  }
  return '.md';
}

export function cleanupTempFile(filePath: string) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch {
    // ignore cleanup failure
  }
}

export function extractManagedUploadRelativePath(rawUrl: string | null | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith(UPLOAD_URL_PREFIX)) {
    return normalizeUploadRelativePath(trimmed);
  }

  try {
    const parsed = new URL(trimmed);
    return normalizeUploadRelativePath(parsed.pathname);
  } catch {
    return null;
  }
}

export function resolveUploadAbsolutePath(relativePath: string): string | null {
  if (!relativePath.startsWith(UPLOAD_URL_PREFIX)) {
    return null;
  }

  const relativeFilePath = relativePath.slice(UPLOAD_URL_PREFIX.length);
  if (!relativeFilePath) {
    return null;
  }

  const absolutePath = path.resolve(UPLOAD_ROOT, relativeFilePath);
  const root = path.resolve(UPLOAD_ROOT);
  if (!(absolutePath === root || absolutePath.startsWith(`${root}${path.sep}`))) {
    return null;
  }

  return absolutePath;
}

export function deleteManagedUploadByRelativePath(relativePath: string | null | undefined): boolean {
  if (!relativePath) {
    return false;
  }
  const absolutePath = resolveUploadAbsolutePath(relativePath);
  if (!absolutePath) {
    return false;
  }
  try {
    fs.rmSync(absolutePath, { force: true });
    return true;
  } catch {
    return false;
  }
}

export function runUploadGarbageCollection(room: Room | null, minAgeMs: number): UploadGcResult {
  const now = Date.now();
  const referencedRelativePaths = collectReferencedUploadRelativePaths(room);
  const referencedAbsolutePaths = new Set(
    Array.from(referencedRelativePaths)
      .map((item) => resolveUploadAbsolutePath(item))
      .filter((item): item is string => Boolean(item)),
  );

  const result: UploadGcResult = {
    scanned: 0,
    deleted: 0,
    retained: 0,
    errors: 0,
  };

  for (const dirPath of [UPLOAD_TEMP_DIR, ...Object.values(UPLOAD_DIR_BY_TYPE)]) {
    if (!fs.existsSync(dirPath)) {
      continue;
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) {
        continue;
      }

      const absolutePath = path.join(dirPath, entry.name);
      result.scanned += 1;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(absolutePath);
      } catch {
        result.errors += 1;
        continue;
      }

      const isOldEnough = now - stat.mtimeMs > minAgeMs;
      if (!isOldEnough) {
        result.retained += 1;
        continue;
      }

      const isTempFile = dirPath === UPLOAD_TEMP_DIR;
      const isReferenced = referencedAbsolutePaths.has(absolutePath);
      if (!isTempFile && isReferenced) {
        result.retained += 1;
        continue;
      }

      try {
        fs.rmSync(absolutePath, { force: true });
        result.deleted += 1;
      } catch {
        result.errors += 1;
      }
    }
  }

  return result;
}

function normalizeUploadRelativePath(pathName: string): string | null {
  const normalized = path.posix.normalize(pathName);
  if (!normalized.startsWith(UPLOAD_URL_PREFIX)) {
    return null;
  }
  if (normalized.endsWith('/')) {
    return null;
  }
  const tail = normalized.slice(UPLOAD_URL_PREFIX.length);
  const allowedPrefix = ['image/', 'html/', 'markdown/', '_tmp/'].some((prefix) => tail.startsWith(prefix));
  if (!allowedPrefix) {
    return null;
  }
  return normalized;
}

function collectReferencedUploadRelativePaths(room: Room | null): Set<string> {
  const references = new Set<string>();
  if (!room) {
    return references;
  }

  for (const content of room.pageContents.values()) {
    const contentReferences = collectReferencedPathsFromPageContent(content);
    for (const reference of contentReferences) {
      references.add(reference);
    }
  }

  return references;
}

export function getManagedRelativePathFromContent(content: PageContent | null | undefined): string | null {
  if (!content || content.type === 'canvas') {
    return null;
  }
  return extractManagedUploadRelativePath(content?.content ?? null);
}

function collectReferencedPathsFromPageContent(content: PageContent): Set<string> {
  const references = new Set<string>();

  if (content.type !== 'canvas') {
    const direct = extractManagedUploadRelativePath(content.content);
    if (direct) {
      references.add(direct);
    }
    return references;
  }

  try {
    const parsed = JSON.parse(content.content) as unknown;
    collectStringValues(parsed, references);
  } catch {
    // ignore invalid canvas payload
  }

  return references;
}

function collectStringValues(value: unknown, references: Set<string>) {
  if (typeof value === 'string') {
    const relativePath = extractManagedUploadRelativePath(value);
    if (relativePath) {
      references.add(relativePath);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, references);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) {
      collectStringValues(child, references);
    }
  }
}
