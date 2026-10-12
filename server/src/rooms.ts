import { randInt } from '@zv/shared';
import { Room, type GameServer, type RoomOptions } from './game';

/** Room code alphabet without look-alike characters (0/O, 1/I/L). */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

export interface RoomManagerOptions extends RoomOptions {
  idleMs: number;
  sweepIntervalMs: number;
}

/**
 * Normalizes user-typed room codes (case and stray characters).
 * @param raw - Untrusted input.
 * @returns Upper-case code containing only alphabet characters.
 */
export function normalizeCode(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

/**
 * Creates, looks up and garbage-collects rooms.
 */
export class RoomManager {
  private readonly rooms = new Map<string, Room>();
  private readonly sweepTimer: ReturnType<typeof setInterval>;

  /**
   * @param io - Socket.IO server.
   * @param options - Room timings and cleanup settings.
   */
  constructor(
    private readonly io: GameServer,
    private readonly options: RoomManagerOptions,
  ) {
    this.sweepTimer = setInterval(() => this.sweep(), options.sweepIntervalMs);
    this.sweepTimer.unref();
  }

  /**
   * Creates a room with a fresh unique code.
   * @returns The new room.
   */
  create(): Room {
    let code = '';
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randInt(Math.random, 0, CODE_ALPHABET.length - 1)]).join('');
    } while (this.rooms.has(code));
    const room = new Room(code, this.io, this.options, (c) => this.rooms.delete(c));
    this.rooms.set(code, room);
    return room;
  }

  /**
   * Looks up a room by code.
   * @param code - Normalized room code.
   * @returns The room, if it exists.
   */
  get(code: string | undefined): Room | undefined {
    return code ? this.rooms.get(code) : undefined;
  }

  /**
   * Number of live rooms.
   * @returns Room count.
   */
  get size(): number {
    return this.rooms.size;
  }

  /** Deletes rooms that have been idle for too long. */
  sweep(): void {
    const cutoff = Date.now() - this.options.idleMs;
    for (const [code, room] of this.rooms) {
      if (room.lastActivity >= cutoff || room.phase === 'playing') continue;
      this.io.to(code).emit('room:kicked', { message: 'The room closed after being idle.' });
      this.io.in(code).socketsLeave(code);
      room.destroy();
      this.rooms.delete(code);
    }
  }

  /** Stops the sweeper and tears down every room. */
  close(): void {
    clearInterval(this.sweepTimer);
    for (const room of this.rooms.values()) room.destroy();
    this.rooms.clear();
  }
}
