export interface RateLimitWindow {
  windowStart: number;
  count: number;
}

export interface PasswordAttemptState {
  windowStart: number;
  failures: number;
  lockedUntil: number;
}

export interface RateLimiterOptions {
  windowMs: number;
  max: number;
  /** 超过该大小时清理过期条目，防止 Map 无限增长 */
  compactThreshold?: number;
}

/**
 * 滑动窗口计数器。返回 true 表示本次调用已被限流。
 * 独立成模块以便在单元测试中注入时钟。
 */
export function isRateLimitedByWindow(
  state: Map<string, RateLimitWindow>,
  key: string,
  options: RateLimiterOptions,
  now = Date.now(),
): boolean {
  const existing = state.get(key);
  if (!existing || now - existing.windowStart > options.windowMs) {
    state.set(key, { windowStart: now, count: 1 });
    compactRateLimiterState(state, options.windowMs, options.compactThreshold, now);
    return false;
  }

  existing.count += 1;
  return existing.count > options.max;
}

export function compactRateLimiterState(
  state: Map<string, RateLimitWindow>,
  windowMs: number,
  compactThreshold = 5_000,
  now = Date.now(),
): void {
  if (state.size <= compactThreshold) {
    return;
  }
  for (const [key, value] of state.entries()) {
    if (now - value.windowStart > windowMs * 2) {
      state.delete(key);
    }
  }
}

export interface PasswordAttemptLimiterOptions {
  windowMs: number;
  maxFailures: number;
  lockoutMs: number;
}

export interface PasswordAttemptVerdict {
  allowed: boolean;
  retryAfterMs: number;
}

/**
 * 口令爆破防护：窗口内累计失败次数，达到阈值后锁定该 Key 一段时间。
 * 成功后清除记录。
 */
export function checkPasswordAttemptAllowed(
  state: Map<string, PasswordAttemptState>,
  key: string,
  options: PasswordAttemptLimiterOptions,
  now = Date.now(),
): PasswordAttemptVerdict {
  const existing = state.get(key);
  if (existing && existing.lockedUntil > now) {
    return { allowed: false, retryAfterMs: existing.lockedUntil - now };
  }
  return { allowed: true, retryAfterMs: 0 };
}

export function recordPasswordAttemptFailure(
  state: Map<string, PasswordAttemptState>,
  key: string,
  options: PasswordAttemptLimiterOptions,
  now = Date.now(),
): void {
  const existing = state.get(key);
  if (!existing || now - existing.windowStart > options.windowMs) {
    state.set(key, { windowStart: now, failures: 1, lockedUntil: 0 });
    compactPasswordAttemptState(state, options.windowMs, now);
    return;
  }

  existing.failures += 1;
  if (existing.failures >= options.maxFailures) {
    existing.lockedUntil = now + options.lockoutMs;
  }
}

export function recordPasswordAttemptSuccess(state: Map<string, PasswordAttemptState>, key: string): void {
  state.delete(key);
}

function compactPasswordAttemptState(
  state: Map<string, PasswordAttemptState>,
  windowMs: number,
  now = Date.now(),
): void {
  if (state.size <= 5_000) {
    return;
  }
  for (const [key, value] of state.entries()) {
    if (value.lockedUntil < now && now - value.windowStart > windowMs * 2) {
      state.delete(key);
    }
  }
}
