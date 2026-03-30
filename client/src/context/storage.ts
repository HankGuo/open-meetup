import { SessionCredentials } from '../types';

export const STORAGE_KEYS = {
  session: 'open-meetup:session:v2',
  isHost: 'open-meetup:isHost',
  ticket: 'open-meetup:ticket',
  avatar: 'open-meetup:avatar',
} as const;

export function saveStoredSession(session: SessionCredentials) {
  try {
    localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
  } catch {
    // ignore storage failure
  }
}

export function clearStoredSession() {
  try {
    localStorage.removeItem(STORAGE_KEYS.session);
  } catch {
    // ignore storage failure
  }
}

export function loadStoredSession(): SessionCredentials | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.session);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SessionCredentials>;
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    if (!parsed.userId || !parsed.sessionId) {
      return null;
    }
    return {
      userId: parsed.userId,
      sessionId: parsed.sessionId,
      ticket: parsed.ticket,
    };
  } catch {
    return null;
  }
}

export function clearRoomEntryStorage() {
  localStorage.removeItem(STORAGE_KEYS.isHost);
  localStorage.removeItem(STORAGE_KEYS.ticket);
}
