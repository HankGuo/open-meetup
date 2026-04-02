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
