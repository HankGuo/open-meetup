export const STORAGE_KEYS = {
  ticket: 'open-meetup:ticket',
  ticketAcknowledged: 'open-meetup:ticket:acknowledged',
  avatar: 'open-meetup:avatar',
  legacySession: 'open-meetup:session:v2',
  legacyIsHost: 'open-meetup:isHost',
} as const;

export function clearAllLocalStorage() {
  try {
    localStorage.clear();
  } catch {
    // ignore storage failure
  }
}

export function clearRoomEntryStorage() {
  localStorage.removeItem(STORAGE_KEYS.ticket);
  localStorage.removeItem(STORAGE_KEYS.ticketAcknowledged);
  localStorage.removeItem(STORAGE_KEYS.avatar);
  localStorage.removeItem(STORAGE_KEYS.legacySession);
  localStorage.removeItem(STORAGE_KEYS.legacyIsHost);
}
