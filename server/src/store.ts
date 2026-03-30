import { Room } from './types';

export interface RoomStore {
  loadRoom(): Room | null;
  saveRoom(room: Room): void;
  clearAll(): void;
}

export class MemoryStore implements RoomStore {
  private room: Room | null = null;

  loadRoom(): Room | null {
    return this.room;
  }

  saveRoom(room: Room): void {
    this.room = room;
  }

  clearAll(): void {
    this.room = null;
  }
}
