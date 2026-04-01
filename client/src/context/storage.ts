export const STORAGE_KEYS = {
  ticket: 'open-meetup:ticket',
  ticketAcknowledged: 'open-meetup:ticket:acknowledged',
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
}
