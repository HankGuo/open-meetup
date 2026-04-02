export const STORAGE_KEYS = {
  ticket: 'open-meetup:ticket',
  ticketAcknowledged: 'open-meetup:ticket:acknowledged',
} as const;

export function clearAllLocalStorage() {
  try {
    const prefix = 'open-meetup:';
    const keysToDelete: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key && key.startsWith(prefix)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      localStorage.removeItem(key);
    }
  } catch {
    // ignore storage failure
  }
}

export function clearRoomEntryStorage() {
  try {
    localStorage.removeItem(STORAGE_KEYS.ticket);
    localStorage.removeItem(STORAGE_KEYS.ticketAcknowledged);
  } catch {
    // ignore storage failure
  }
}
