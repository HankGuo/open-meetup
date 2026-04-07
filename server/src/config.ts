export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const HOST_PASSWORD_ENV = process.env.HOST_PASSWORD;
export const HOST_PASSWORD = HOST_PASSWORD_ENV || '12345678';

if (IS_PRODUCTION && !HOST_PASSWORD_ENV) {
  throw new Error('[Config] HOST_PASSWORD is required in production environment.');
}

export const ROOM_PARTICIPANT_LIMIT_MIN = 1;
export const ROOM_PARTICIPANT_LIMIT_MAX = 500;
const DEFAULT_MAX_PARTICIPANTS_PER_ROOM = 50;
const DEFAULT_DISCONNECT_GRACE_MS = 300_000;
const DEFAULT_ROOM_CLEANUP_INTERVAL_MS = 30_000;
const DEFAULT_SOCKET_PING_INTERVAL_MS = 10_000;
const DEFAULT_SOCKET_PING_TIMEOUT_MS = 10_000;

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

export const DISCONNECT_GRACE_MS = parsePositiveIntEnv(
  process.env.DISCONNECT_GRACE_MS,
  DEFAULT_DISCONNECT_GRACE_MS,
  5_000,
  1_800_000,
);

export const ROOM_CLEANUP_INTERVAL_MS = parsePositiveIntEnv(
  process.env.ROOM_CLEANUP_INTERVAL_MS,
  DEFAULT_ROOM_CLEANUP_INTERVAL_MS,
  1_000,
  60_000,
);

export const SOCKET_PING_INTERVAL_MS = parsePositiveIntEnv(
  process.env.SOCKET_PING_INTERVAL_MS,
  DEFAULT_SOCKET_PING_INTERVAL_MS,
  1_000,
  60_000,
);

export const SOCKET_PING_TIMEOUT_MS = parsePositiveIntEnv(
  process.env.SOCKET_PING_TIMEOUT_MS,
  DEFAULT_SOCKET_PING_TIMEOUT_MS,
  1_000,
  60_000,
);
