import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearAllLocalStorage, clearRoomEntryStorage, STORAGE_KEYS } from './storage';

class MemoryStorage implements Storage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) ?? null) : null;
  }

  key(index: number): string | null {
    const keys = Array.from(this.map.keys());
    return keys[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

const localStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  if (localStorageDescriptor) {
    Object.defineProperty(globalThis, 'localStorage', localStorageDescriptor);
    return;
  }
  delete (globalThis as { localStorage?: Storage }).localStorage;
});

describe('storage helpers', () => {
  it('clearRoomEntryStorage 只移除 ticket 相关键', () => {
    localStorage.setItem(STORAGE_KEYS.ticket, 'TKT-1');
    localStorage.setItem(STORAGE_KEYS.ticketAcknowledged, 'TKT-1');
    localStorage.setItem('open-meetup:other', 'value');

    clearRoomEntryStorage();

    expect(localStorage.getItem(STORAGE_KEYS.ticket)).toBeNull();
    expect(localStorage.getItem(STORAGE_KEYS.ticketAcknowledged)).toBeNull();
    expect(localStorage.getItem('open-meetup:other')).toBe('value');
  });

  it('clearAllLocalStorage 应移除 open-meetup 前缀下所有键', () => {
    localStorage.setItem(STORAGE_KEYS.ticket, 'TKT-2');
    localStorage.setItem('open-meetup:user', 'u1');
    localStorage.setItem('another:key', 'keep');

    clearAllLocalStorage();

    expect(localStorage.getItem(STORAGE_KEYS.ticket)).toBeNull();
    expect(localStorage.getItem('open-meetup:user')).toBeNull();
    expect(localStorage.getItem('another:key')).toBe('keep');
  });
});
