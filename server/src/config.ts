export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const HOST_PASSWORD_ENV = process.env.HOST_PASSWORD;
export const HOST_PASSWORD = HOST_PASSWORD_ENV || '12345678';

if (IS_PRODUCTION && !HOST_PASSWORD_ENV) {
  throw new Error('[Config] HOST_PASSWORD is required in production environment.');
}

export const ROOM_PARTICIPANT_LIMIT_MIN = 1;
export const ROOM_PARTICIPANT_LIMIT_MAX = 500;
const DEFAULT_MAX_PARTICIPANTS_PER_ROOM = 50;

function parsePositiveIntEnv(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  const normalized = Math.floor(parsed);
  if (normalized < min || normalized > max) {
    return fallback;
  }
  return normalized;
}

export const DEFAULT_PARTICIPANTS_PER_ROOM = parsePositiveIntEnv(
  process.env.MAX_PARTICIPANTS_PER_ROOM,
  DEFAULT_MAX_PARTICIPANTS_PER_ROOM,
  ROOM_PARTICIPANT_LIMIT_MIN,
  ROOM_PARTICIPANT_LIMIT_MAX,
);

export type AssetStorageProvider = 'local' | 'minio';

function parseAssetStorageProvider(rawValue: string | undefined): AssetStorageProvider {
  const normalized = rawValue?.trim().toLowerCase();
  if (normalized === 'minio') {
    return 'minio';
  }
  return 'local';
}

export const ASSET_STORAGE_PROVIDER = parseAssetStorageProvider(process.env.ASSET_STORAGE_PROVIDER);

function parsePortEnv(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return fallback;
  }
  return parsed;
}

function parseBooleanEnv(value: string | undefined, fallback = false): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') {
    return true;
  }
  if (normalized === 'false' || normalized === '0') {
    return false;
  }
  return fallback;
}

export const MINIO_ENDPOINT = process.env.MINIO_ENDPOINT?.trim() || '';
export const MINIO_PORT = parsePortEnv(process.env.MINIO_PORT, 9000);
export const MINIO_USE_SSL = parseBooleanEnv(process.env.MINIO_USE_SSL, false);
export const MINIO_ACCESS_KEY = process.env.MINIO_ACCESS_KEY?.trim() || '';
export const MINIO_SECRET_KEY = process.env.MINIO_SECRET_KEY?.trim() || '';
export const MINIO_BUCKET = process.env.MINIO_BUCKET?.trim() || 'open-meetup-assets';
export const MINIO_REGION = process.env.MINIO_REGION?.trim() || 'us-east-1';

if (ASSET_STORAGE_PROVIDER === 'minio') {
  if (!MINIO_ENDPOINT || !MINIO_ACCESS_KEY || !MINIO_SECRET_KEY) {
    throw new Error(
      '[Config] MINIO_ENDPOINT, MINIO_ACCESS_KEY and MINIO_SECRET_KEY are required when ASSET_STORAGE_PROVIDER=minio.',
    );
  }
}
