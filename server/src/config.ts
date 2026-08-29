import { timingSafeEqual } from 'crypto';

export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const HOST_PASSWORD_ENV = process.env.HOST_PASSWORD;
const HOST_PASSWORD_DEV_DEFAULT = '12345678';

export const HOST_PASSWORD_MIN_LENGTH = parsePositiveIntEnv(process.env.HOST_PASSWORD_MIN_LENGTH, 6, 4, 128);
export const HOST_PASSWORD_MAX_LENGTH = 128;

export const HOST_PASSWORD = HOST_PASSWORD_ENV || HOST_PASSWORD_DEV_DEFAULT;

if (IS_PRODUCTION && !HOST_PASSWORD_ENV) {
  throw new Error('[Config] HOST_PASSWORD is required in production environment.');
}
if (HOST_PASSWORD.length < HOST_PASSWORD_MIN_LENGTH || HOST_PASSWORD.length > HOST_PASSWORD_MAX_LENGTH) {
  throw new Error(
    `[Config] HOST_PASSWORD length must be between ${HOST_PASSWORD_MIN_LENGTH} and ${HOST_PASSWORD_MAX_LENGTH} characters.`,
  );
}

export const IS_HOST_PASSWORD_DEFAULT = !HOST_PASSWORD_ENV && HOST_PASSWORD === HOST_PASSWORD_DEV_DEFAULT;

/** 主持人创建房间的口令校验（常数时间比较，避免时序侧信道） */
export function verifyHostPassword(input: string): boolean {
  const a = Buffer.from(input, 'utf8');
  const b = Buffer.from(HOST_PASSWORD, 'utf8');
  if (a.length !== b.length) {
    // 长度不同时也做一次比较，保持耗时曲线平稳
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export const ROOM_PARTICIPANT_LIMIT_MIN = 1;
export const ROOM_PARTICIPANT_LIMIT_MAX = 500;
const DEFAULT_MAX_PARTICIPANTS_PER_ROOM = 50;
const DEFAULT_DISCONNECT_GRACE_MS = 300_000;
const DEFAULT_ROOM_CLEANUP_INTERVAL_MS = 30_000;
const DEFAULT_SOCKET_PING_INTERVAL_MS = 10_000;
const DEFAULT_SOCKET_PING_TIMEOUT_MS = 10_000;

/** Socket.IO 单包上限：需容纳最大的画布场景序列化结果（图片上传走 HTTP，不走 Socket） */
const DEFAULT_SOCKET_MAX_HTTP_BUFFER_SIZE = 10_000_000;

/** 单页内容尺寸上限：canvas 场景可能内联图片 dataURL，文本类内容（url/image/markdown/html）应远小 */
const DEFAULT_MAX_PAGE_CONTENT_CANVAS_BYTES = 8_000_000;
const DEFAULT_MAX_PAGE_CONTENT_TEXT_BYTES = 64_000;

/** 单房间上传资产总配额，防止磁盘被持续上传写满 */
const DEFAULT_MAX_ROOM_ASSETS_BYTES = 268_435_456;

/** 单张图片上传上限 */
const DEFAULT_IMAGE_UPLOAD_MAX_BYTES = 4_000_000;

/** Socket 事件级限流：单个连接每窗口最多触发的事件数（NAT 场景按 socket 维度而非 IP） */
const DEFAULT_SOCKET_EVENT_RATE_LIMIT_MAX = 180;
const DEFAULT_SOCKET_EVENT_RATE_LIMIT_WINDOW_MS = 10_000;

/** 口令爆破防护：同一 IP 在窗口内创建房间失败达到阈值后锁定 */
const DEFAULT_CREATE_PASSWORD_MAX_FAILURES = 10;
const DEFAULT_CREATE_PASSWORD_FAILURE_WINDOW_MS = 300_000;
const DEFAULT_CREATE_PASSWORD_LOCKOUT_MS = 300_000;

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

export const SOCKET_MAX_HTTP_BUFFER_SIZE_BYTES = parsePositiveIntEnv(
  process.env.SOCKET_MAX_HTTP_BUFFER_SIZE,
  DEFAULT_SOCKET_MAX_HTTP_BUFFER_SIZE,
  1_000_000,
  100_000_000,
);

export const MAX_PAGE_CONTENT_CANVAS_BYTES = parsePositiveIntEnv(
  process.env.MAX_PAGE_CONTENT_CANVAS_BYTES,
  DEFAULT_MAX_PAGE_CONTENT_CANVAS_BYTES,
  1_000,
  50_000_000,
);

export const MAX_PAGE_CONTENT_TEXT_BYTES = parsePositiveIntEnv(
  process.env.MAX_PAGE_CONTENT_TEXT_BYTES,
  DEFAULT_MAX_PAGE_CONTENT_TEXT_BYTES,
  100,
  1_000_000,
);

export const MAX_ROOM_ASSETS_BYTES = parsePositiveIntEnv(
  process.env.MAX_ROOM_ASSETS_BYTES,
  DEFAULT_MAX_ROOM_ASSETS_BYTES,
  1_048_576,
  10_737_418_240,
);

export const MAX_IMAGE_UPLOAD_BYTES = parsePositiveIntEnv(
  process.env.IMAGE_UPLOAD_MAX_BYTES,
  DEFAULT_IMAGE_UPLOAD_MAX_BYTES,
  10_000,
  50_000_000,
);

export const SOCKET_EVENT_RATE_LIMIT_MAX = parsePositiveIntEnv(
  process.env.SOCKET_EVENT_RATE_LIMIT_MAX,
  DEFAULT_SOCKET_EVENT_RATE_LIMIT_MAX,
  10,
  10_000,
);

export const SOCKET_EVENT_RATE_LIMIT_WINDOW_MS = parsePositiveIntEnv(
  process.env.SOCKET_EVENT_RATE_LIMIT_WINDOW_MS,
  DEFAULT_SOCKET_EVENT_RATE_LIMIT_WINDOW_MS,
  1_000,
  60_000,
);

export const CREATE_PASSWORD_MAX_FAILURES = parsePositiveIntEnv(
  process.env.CREATE_PASSWORD_MAX_FAILURES,
  DEFAULT_CREATE_PASSWORD_MAX_FAILURES,
  1,
  1_000,
);

export const CREATE_PASSWORD_FAILURE_WINDOW_MS = parsePositiveIntEnv(
  process.env.CREATE_PASSWORD_FAILURE_WINDOW_MS,
  DEFAULT_CREATE_PASSWORD_FAILURE_WINDOW_MS,
  1_000,
  3_600_000,
);

export const CREATE_PASSWORD_LOCKOUT_MS = parsePositiveIntEnv(
  process.env.CREATE_PASSWORD_LOCKOUT_MS,
  DEFAULT_CREATE_PASSWORD_LOCKOUT_MS,
  1_000,
  3_600_000,
);

/** SVG 可携带脚本，默认拒绝上传；确认理解风险后可显式打开 */
export const ALLOW_SVG_UPLOAD = process.env.ALLOW_SVG_UPLOAD === '1';
